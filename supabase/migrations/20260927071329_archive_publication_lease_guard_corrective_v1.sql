-- Forward correction for the installed publication ledger. Do not replay the original migration.
-- The connected staging role cannot replace functions owned by the non-login
-- internal role after its SET membership and schema CREATE rights were removed.
-- Temporarily restore those rights in this atomic migration, then revoke them.
grant archive_runner_internal to postgres with set true, inherit false;
grant create on schema survival_rpg to archive_runner_internal;
set role archive_runner_internal;

create or replace function survival_rpg.finish_archive_publication_task(
  p_task_id text,
  p_claim_version bigint,
  p_lease_token uuid,
  p_outcome text,
  p_receipt jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_retry_after_seconds integer default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_task survival_rpg.archive_publication_tasks%rowtype;
  v_outcome text := p_outcome;
  v_retry_after timestamptz;
begin
  if p_outcome is null or p_outcome not in ('NOOP', 'COMPLETE', 'RETRY_WAIT', 'QUARANTINED', 'FAILED') then
    raise exception 'INVALID_TASK_OUTCOME' using errcode = '22023';
  end if;
  if p_outcome in ('FAILED', 'QUARANTINED', 'RETRY_WAIT') and p_error_code is null then
    raise exception 'ERROR_CODE_REQUIRED' using errcode = '22023';
  end if;
  if p_outcome in ('NOOP', 'COMPLETE') and p_error_code is not null then
    raise exception 'UNEXPECTED_ERROR_CODE' using errcode = '22023';
  end if;
  if p_error_code is not null and p_error_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then
    raise exception 'INVALID_ERROR_CODE' using errcode = '22023';
  end if;
  if not survival_rpg.archive_publication_receipt_is_valid(p_receipt) then
    raise exception 'INVALID_RECEIPT_METADATA' using errcode = '22023';
  end if;
  if p_outcome = 'RETRY_WAIT' and (p_retry_after_seconds is null or p_retry_after_seconds < 30 or p_retry_after_seconds > 21600) then
    raise exception 'INVALID_RETRY_DELAY' using errcode = '22023';
  end if;

  select * into strict v_task
    from survival_rpg.archive_publication_tasks
   where task_id = p_task_id
   for update;

  if p_claim_version is null or p_lease_token is null then
    raise exception 'INVALID_LEASE_IDENTITY' using errcode = '22023';
  end if;
  if v_task.status is distinct from 'CLAIMED'
     or v_task.claim_version is distinct from p_claim_version
     or v_task.lease_token is distinct from p_lease_token
     or v_task.lease_expires_at is null
     or v_task.lease_expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'TASK_LEASE_NOT_OWNED' using errcode = '55000';
  end if;

  if p_outcome = 'RETRY_WAIT' then
    if v_task.attempt_count >= 3 then
      v_outcome := 'QUARANTINED';
      p_error_code := coalesce(p_error_code, 'RETRY_LIMIT_EXHAUSTED');
    else
      v_retry_after := pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_retry_after_seconds);
    end if;
  end if;

  update survival_rpg.archive_publication_tasks
     set status = v_outcome,
         lease_owner = null, lease_token = null, lease_expires_at = null,
         retry_after = v_retry_after,
         receipt = p_receipt,
         last_error_code = p_error_code,
         updated_at = pg_catalog.clock_timestamp(),
         completed_at = case when v_outcome in ('NOOP', 'COMPLETE', 'QUARANTINED', 'FAILED') then pg_catalog.clock_timestamp() else null end
   where task_id = p_task_id
     and status = 'CLAIMED'
     and claim_version = p_claim_version
     and lease_token = p_lease_token
     and lease_expires_at > pg_catalog.clock_timestamp();

  if not found then
    raise exception 'TASK_LEASE_NOT_OWNED' using errcode = '55000';
  end if;

  insert into survival_rpg.archive_publication_task_events (
    task_id, batch_id, event_type, worker_id, claim_version, event_metadata
  ) values (
    v_task.task_id, v_task.batch_id, v_outcome, v_task.lease_owner, v_task.claim_version,
    jsonb_build_object('receipt', p_receipt, 'error_code', p_error_code, 'retry_after', v_retry_after)
  );

  return v_outcome;
end;
$$;

create or replace function survival_rpg.claim_archive_publication_daily_run(
  p_scheduled_date date,
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns table (
  out_scheduled_date date, out_status text, out_attempt_count integer,
  out_claim_version bigint, out_lease_token uuid, out_lease_expires_at timestamptz,
  out_lag_seconds integer, out_claimed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_run survival_rpg.archive_publication_daily_runs%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_scheduled_for timestamptz;
begin
  if p_scheduled_date is null
     or p_scheduled_date > (v_now at time zone 'Asia/Seoul')::date then
    raise exception 'INVALID_SCHEDULE_DATE' using errcode = '22023';
  end if;
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9_.:-]{1,80}$' then
    raise exception 'INVALID_WORKER_ID' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'INVALID_LEASE_DURATION' using errcode = '22023';
  end if;

  v_scheduled_for := (p_scheduled_date + time '04:30') at time zone 'Asia/Seoul';
  if v_now < v_scheduled_for then
    raise exception 'SCHEDULE_NOT_DUE' using errcode = '55000';
  end if;

  insert into survival_rpg.archive_publication_daily_runs (scheduled_date, scheduled_for)
  values (p_scheduled_date, v_scheduled_for)
  on conflict (scheduled_date) do nothing;

  select * into strict v_run
    from survival_rpg.archive_publication_daily_runs
   where scheduled_date = p_scheduled_date
   for update;

  if v_run.status in ('NOOP', 'COMPLETE', 'QUARANTINED', 'FAILED') then
    return query select v_run.scheduled_date, v_run.status, v_run.attempt_count::integer,
      v_run.claim_version, null::uuid, v_run.lease_expires_at,
      v_run.lag_seconds, false;
    return;
  end if;
  if v_run.status = 'CLAIMED' and v_run.lease_expires_at > v_now then
    return query select v_run.scheduled_date, v_run.status, v_run.attempt_count::integer,
      v_run.claim_version, null::uuid, v_run.lease_expires_at,
      v_run.lag_seconds, false;
    return;
  end if;
  if v_run.status = 'RETRY_WAIT' and v_run.retry_after > v_now then
    return query select v_run.scheduled_date, v_run.status, v_run.attempt_count::integer,
      v_run.claim_version, null::uuid, v_run.lease_expires_at,
      v_run.lag_seconds, false;
    return;
  end if;

  if v_run.attempt_count >= 3 then
    update survival_rpg.archive_publication_daily_runs
       set status = 'QUARANTINED',
           lease_owner = null, lease_token = null, lease_expires_at = null,
           retry_after = null, last_error_code = 'RETRY_LIMIT_EXHAUSTED',
           finished_at = v_now
     where scheduled_date = p_scheduled_date
     returning * into v_run;
    insert into survival_rpg.archive_publication_daily_run_events (
      scheduled_date, event_type, worker_id, claim_version, event_metadata
    ) values (
      p_scheduled_date, 'QUARANTINED', p_worker_id, v_run.claim_version,
      jsonb_build_object('reason_code', 'RETRY_LIMIT_EXHAUSTED')
    );
    return query select v_run.scheduled_date, v_run.status, v_run.attempt_count::integer,
      v_run.claim_version, null::uuid, v_run.lease_expires_at,
      v_run.lag_seconds, false;
    return;
  end if;

  update survival_rpg.archive_publication_daily_runs
     set status = 'CLAIMED',
         attempt_count = attempt_count + 1,
         claim_version = claim_version + 1,
         lease_owner = p_worker_id,
         lease_token = gen_random_uuid(),
         lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
         retry_after = null,
         lag_seconds = greatest(0, floor(extract(epoch from (v_now - v_scheduled_for)))::integer),
         started_at = coalesce(started_at, v_now),
         finished_at = null
   where scheduled_date = p_scheduled_date
   returning * into v_run;

  insert into survival_rpg.archive_publication_daily_run_events (
    scheduled_date, event_type, worker_id, claim_version, event_metadata
  ) values (
    p_scheduled_date, 'CLAIMED', p_worker_id, v_run.claim_version,
    jsonb_build_object('attempt', v_run.attempt_count, 'lag_seconds', v_run.lag_seconds)
  );

  return query select v_run.scheduled_date, v_run.status, v_run.attempt_count::integer,
    v_run.claim_version, v_run.lease_token, v_run.lease_expires_at,
    v_run.lag_seconds, true;
end;
$$;

create or replace function survival_rpg.finish_archive_publication_daily_run(
  p_scheduled_date date,
  p_claim_version bigint,
  p_lease_token uuid,
  p_outcome text,
  p_receipt jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_retry_after_seconds integer default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_run survival_rpg.archive_publication_daily_runs%rowtype;
  v_outcome text := p_outcome;
  v_retry_after timestamptz;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_scheduled_date is null or p_claim_version is null or p_lease_token is null then
    raise exception 'INVALID_LEASE_IDENTITY' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome not in ('NOOP', 'COMPLETE', 'RETRY_WAIT', 'QUARANTINED', 'FAILED') then
    raise exception 'INVALID_RUN_OUTCOME' using errcode = '22023';
  end if;
  if not survival_rpg.archive_publication_receipt_is_valid(p_receipt) then
    raise exception 'INVALID_RECEIPT_METADATA' using errcode = '22023';
  end if;
  if p_error_code is not null and p_error_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then
    raise exception 'INVALID_ERROR_CODE' using errcode = '22023';
  end if;
  if p_outcome in ('FAILED', 'QUARANTINED', 'RETRY_WAIT') and p_error_code is null then
    raise exception 'ERROR_CODE_REQUIRED' using errcode = '22023';
  end if;
  if p_outcome in ('NOOP', 'COMPLETE') and p_error_code is not null then
    raise exception 'UNEXPECTED_ERROR_CODE' using errcode = '22023';
  end if;
  if p_outcome = 'RETRY_WAIT' and (p_retry_after_seconds is null or p_retry_after_seconds < 30 or p_retry_after_seconds > 21600) then
    raise exception 'INVALID_RETRY_DELAY' using errcode = '22023';
  end if;

  select * into strict v_run
    from survival_rpg.archive_publication_daily_runs
   where scheduled_date = p_scheduled_date
   for update;

  if v_run.status is distinct from 'CLAIMED'
     or v_run.claim_version is distinct from p_claim_version
     or v_run.lease_token is distinct from p_lease_token
     or v_run.lease_expires_at is null
     or v_run.lease_expires_at <= v_now then
    raise exception 'RUN_LEASE_NOT_OWNED' using errcode = '55000';
  end if;

  if p_outcome = 'RETRY_WAIT' then
    if v_run.attempt_count >= 3 then
      v_outcome := 'QUARANTINED';
      p_error_code := 'RETRY_LIMIT_EXHAUSTED';
    else
      v_retry_after := v_now + make_interval(secs => p_retry_after_seconds);
    end if;
  end if;

  update survival_rpg.archive_publication_daily_runs
     set status = v_outcome,
         lease_owner = null, lease_token = null, lease_expires_at = null,
         retry_after = v_retry_after,
         receipt = p_receipt,
         last_error_code = p_error_code,
         finished_at = case when v_outcome in ('NOOP', 'COMPLETE', 'QUARANTINED', 'FAILED') then v_now else null end
   where scheduled_date = p_scheduled_date
     and status = 'CLAIMED'
     and claim_version = p_claim_version
     and lease_token = p_lease_token
     and lease_expires_at > pg_catalog.clock_timestamp();

  if not found then
    raise exception 'RUN_LEASE_NOT_OWNED' using errcode = '55000';
  end if;

  insert into survival_rpg.archive_publication_daily_run_events (
    scheduled_date, event_type, worker_id, claim_version, event_metadata
  ) values (
    p_scheduled_date, v_outcome, v_run.lease_owner, v_run.claim_version,
    jsonb_build_object('receipt', p_receipt, 'error_code', p_error_code, 'retry_after', v_retry_after)
  );

  return v_outcome;
end;
$$;

create or replace function survival_rpg.link_archive_publication_run_batch(
  p_scheduled_date date,
  p_claim_version bigint,
  p_lease_token uuid,
  p_batch_id text,
  p_plan_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_run survival_rpg.archive_publication_daily_runs%rowtype;
  v_existing_plan_id text;
  v_inserted integer;
begin
  if p_scheduled_date is null or p_claim_version is null or p_lease_token is null
     or p_batch_id is null or p_plan_id is null then
    raise exception 'INVALID_BATCH_LINK_IDENTITY' using errcode = '22023';
  end if;
  if p_batch_id !~ '^batch-[0-9a-f]{64}$' or p_plan_id !~ '^plan-[0-9a-f]{64}$' then
    raise exception 'INVALID_BATCH_LINK_IDENTITY' using errcode = '22023';
  end if;

  select * into strict v_run
    from survival_rpg.archive_publication_daily_runs
   where scheduled_date = p_scheduled_date
   for update;
  if v_run.status is distinct from 'CLAIMED'
     or v_run.claim_version is distinct from p_claim_version
     or v_run.lease_token is distinct from p_lease_token
     or v_run.lease_expires_at is null
     or v_run.lease_expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'RUN_LEASE_NOT_OWNED' using errcode = '55000';
  end if;
  if not exists (
    select 1 from survival_rpg.archive_publication_tasks t
     where t.batch_id = p_batch_id and t.plan_id = p_plan_id
  ) then
    raise exception 'BATCH_TASKS_NOT_ENQUEUED' using errcode = '55000';
  end if;

  insert into survival_rpg.archive_publication_run_batches (scheduled_date, batch_id, plan_id)
  values (p_scheduled_date, p_batch_id, p_plan_id)
  on conflict (scheduled_date, batch_id) do nothing;
  get diagnostics v_inserted = row_count;

  select plan_id into strict v_existing_plan_id
    from survival_rpg.archive_publication_run_batches
   where scheduled_date = p_scheduled_date and batch_id = p_batch_id;
  if v_existing_plan_id <> p_plan_id then
    raise exception 'BATCH_LINK_IDENTITY_CONFLICT' using errcode = '23505';
  end if;

  if v_inserted = 1 then
    insert into survival_rpg.archive_publication_daily_run_events (
      scheduled_date, event_type, worker_id, claim_version, event_metadata
    ) values (
      p_scheduled_date, 'BATCH_LINKED', v_run.lease_owner, v_run.claim_version,
      jsonb_build_object('batch_id', p_batch_id, 'plan_id', p_plan_id)
    );
  end if;
  return v_inserted = 1;
end;
$$;

-- SECURITY DEFINER RPCs remain callable only by the service credential. The worker_id
-- is an audit label, not independent caller authentication.
revoke all on function survival_rpg.finish_archive_publication_task(text,bigint,uuid,text,jsonb,text,integer) from public, anon, authenticated;
grant execute on function survival_rpg.finish_archive_publication_task(text,bigint,uuid,text,jsonb,text,integer) to service_role;
revoke all on function survival_rpg.claim_archive_publication_daily_run(date,text,integer) from public, anon, authenticated;
grant execute on function survival_rpg.claim_archive_publication_daily_run(date,text,integer) to service_role;
revoke all on function survival_rpg.finish_archive_publication_daily_run(date,bigint,uuid,text,jsonb,text,integer) from public, anon, authenticated;
grant execute on function survival_rpg.finish_archive_publication_daily_run(date,bigint,uuid,text,jsonb,text,integer) to service_role;
revoke all on function survival_rpg.link_archive_publication_run_batch(date,bigint,uuid,text,text) from public, anon, authenticated;
grant execute on function survival_rpg.link_archive_publication_run_batch(date,bigint,uuid,text,text) to service_role;

-- Correct existing remote ACL drift on every related RPC, not just the four
-- replaced above. The service credential remains the only callable worker
-- identity; the internal receipt helper is restricted to the function owner.
revoke all on function survival_rpg.archive_publication_receipt_is_valid(jsonb) from public, anon, authenticated, service_role;
grant execute on function survival_rpg.archive_publication_receipt_is_valid(jsonb) to archive_runner_internal;
revoke all on function survival_rpg.enqueue_archive_publication_task(text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function survival_rpg.enqueue_archive_publication_task(text,text,text,text,text,text,text,text) to service_role;
revoke all on function survival_rpg.renew_archive_publication_daily_run_lease(date,bigint,uuid,integer) from public, anon, authenticated;
grant execute on function survival_rpg.renew_archive_publication_daily_run_lease(date,bigint,uuid,integer) to service_role;
revoke all on function survival_rpg.claim_archive_publication_task(text,integer) from public, anon, authenticated;
grant execute on function survival_rpg.claim_archive_publication_task(text,integer) to service_role;
revoke all on function survival_rpg.renew_archive_publication_task_lease(text,bigint,uuid,integer) from public, anon, authenticated;
grant execute on function survival_rpg.renew_archive_publication_task_lease(text,bigint,uuid,integer) to service_role;
reset role;
revoke create on schema survival_rpg from archive_runner_internal;
grant archive_runner_internal to postgres with set false, inherit false;

