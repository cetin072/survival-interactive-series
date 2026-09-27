-- Additive hardening for the publication ledger lease identity checks.
-- Keep the original ledger migration immutable because it may already be installed.

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
   where task_id = p_task_id;

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

  -- A non-owner receives status only. Never return the active lease identity.
  if v_run.status in ('NOOP', 'COMPLETE', 'QUARANTINED', 'FAILED') then
    return query select v_run.scheduled_date, v_run.status, v_run.attempt_count::integer,
      null::bigint, null::uuid, null::timestamptz,
      v_run.lag_seconds, false;
    return;
  end if;
  if v_run.status = 'CLAIMED' and v_run.lease_expires_at > v_now then
    return query select v_run.scheduled_date, v_run.status, v_run.attempt_count::integer,
      null::bigint, null::uuid, null::timestamptz,
      v_run.lag_seconds, false;
    return;
  end if;
  if v_run.status = 'RETRY_WAIT' and v_run.retry_after > v_now then
    return query select v_run.scheduled_date, v_run.status, v_run.attempt_count::integer,
      null::bigint, null::uuid, null::timestamptz,
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
      null::bigint, null::uuid, null::timestamptz,
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
