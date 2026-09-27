-- Metadata-only durable Archive publication run and task ledger.
-- No transcript, gameplay, save, hidden-state, or publication payload is stored here.

do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'archive_runner_internal') then
    raise exception 'ARCHIVE_RUNNER_ROLE_NAME_COLLISION';
  end if;
  create role archive_runner_internal nologin noinherit nobypassrls;
end;
$$;

create or replace function survival_rpg.archive_publication_receipt_is_valid(p_receipt jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_receipt is null or jsonb_typeof(p_receipt) <> 'object'
      or octet_length(p_receipt::text) > 8192 then false
    else not exists (
      select 1
        from jsonb_each(p_receipt) as entry(key, value)
       where jsonb_typeof(entry.value) <> 'string'
          or not case entry.key
            when 'source_sha256' then entry.value #>> '{}' ~ '^[0-9a-f]{64}$'
            when 'release_id' then entry.value #>> '{}' ~ '^[0-9a-f]{64}$'
            when 'pr_number' then entry.value #>> '{}' ~ '^[1-9][0-9]{0,11}$'
            when 'ci_run_id' then entry.value #>> '{}' ~ '^[1-9][0-9]{0,15}$'
            when 'deploy_id' then entry.value #>> '{}' ~ '^[A-Za-z0-9_-]{1,128}$'
            when 'published_commit' then entry.value #>> '{}' ~ '^[0-9a-f]{7,40}$'
            when 'verified_at' then entry.value #>> '{}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'
            when 'reason_code' then entry.value #>> '{}' ~ '^[A-Z][A-Z0-9_]{0,63}$'
            when 'result' then entry.value #>> '{}' in ('NOOP', 'COMPLETE', 'FAILED', 'SKIPPED', 'VERIFIED')
            else false
          end
    )
  end;
$$;
create table survival_rpg.archive_publication_tasks (
  task_id text primary key
    check (task_id ~ '^task-[0-9a-f]{64}$'),
  batch_id text not null
    check (batch_id ~ '^batch-[0-9a-f]{64}$'),
  plan_id text not null
    check (plan_id ~ '^plan-[0-9a-f]{64}$'),
  task_kind text not null
    check (task_kind in (
      'TEXT_SOURCE', 'GRAPH_RECONCILIATION', 'VISUAL_POINT_SCAN',
      'IMAGE_GENERATION', 'IMAGE_STORAGE', 'SITE_PUBLICATION',
      'CI', 'MERGE', 'DEPLOY_VERIFY'
    )),
  chronicle_id text not null
    check (chronicle_id in ('C01-HAN-JUNHO', 'C02-STRONGHOLD', 'C03-AFTERFALL')),
  worldline_id text not null,
  season_id text not null check (season_id ~ '^S[0-9]{2,3}$'),
  source_snapshot_sha256 text not null
    check (source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'CLAIMED', 'RETRY_WAIT', 'NOOP', 'COMPLETE', 'QUARANTINED', 'FAILED')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  claim_version bigint not null default 0 check (claim_version >= 0),
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  retry_after timestamptz,
  receipt jsonb not null default '{}'::jsonb
    check (survival_rpg.archive_publication_receipt_is_valid(receipt)),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  constraint archive_publication_tasks_worldline_matches_chronicle check (
    (chronicle_id = 'C01-HAN-JUNHO' and worldline_id = 'CANON-V2') or
    (chronicle_id = 'C02-STRONGHOLD' and worldline_id = 'STRONGHOLD') or
    (chronicle_id = 'C03-AFTERFALL' and worldline_id = 'AFTERFALL')
  ),
  constraint archive_publication_tasks_claim_fields_consistent check (
    (status = 'CLAIMED' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
    or
    (status <> 'CLAIMED' and lease_owner is null and lease_token is null and lease_expires_at is null)
  )
);

create index archive_publication_tasks_claim_idx
  on survival_rpg.archive_publication_tasks (status, retry_after, created_at, task_id);

create table survival_rpg.archive_publication_task_events (
  event_id uuid primary key default gen_random_uuid(),
  task_id text not null references survival_rpg.archive_publication_tasks(task_id) on delete restrict,
  batch_id text not null check (batch_id ~ '^batch-[0-9a-f]{64}$'),
  event_type text not null
    check (event_type in ('ENQUEUED', 'CLAIMED', 'LEASE_RENEWED', 'RETRY_WAIT', 'NOOP', 'COMPLETE', 'QUARANTINED', 'FAILED')),
  worker_id text,
  claim_version bigint,
  event_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_metadata) = 'object' and pg_catalog.octet_length(event_metadata::text) <= 8192),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index archive_publication_task_events_batch_idx
  on survival_rpg.archive_publication_task_events (batch_id, occurred_at, event_id);

create table survival_rpg.archive_publication_daily_runs (
  scheduled_date date primary key,
  scheduled_for timestamptz not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'CLAIMED', 'RETRY_WAIT', 'NOOP', 'COMPLETE', 'QUARANTINED', 'FAILED')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  claim_version bigint not null default 0 check (claim_version >= 0),
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  retry_after timestamptz,
  lag_seconds integer check (lag_seconds is null or lag_seconds >= 0),
  receipt jsonb not null default '{}'::jsonb
    check (survival_rpg.archive_publication_receipt_is_valid(receipt)),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint archive_publication_daily_runs_scheduled_time check (
    scheduled_for = ((scheduled_date + time '04:30') at time zone 'Asia/Seoul')
  ),
  constraint archive_publication_daily_runs_claim_fields_consistent check (
    (status = 'CLAIMED' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
    or
    (status <> 'CLAIMED' and lease_owner is null and lease_token is null and lease_expires_at is null)
  )
);

create index archive_publication_daily_runs_retry_idx
  on survival_rpg.archive_publication_daily_runs (status, retry_after, scheduled_date);

create table survival_rpg.archive_publication_daily_run_events (
  event_id uuid primary key default gen_random_uuid(),
  scheduled_date date not null references survival_rpg.archive_publication_daily_runs(scheduled_date) on delete restrict,
  event_type text not null
    check (event_type in ('CLAIMED', 'LEASE_RENEWED', 'BATCH_LINKED', 'RETRY_WAIT', 'NOOP', 'COMPLETE', 'QUARANTINED', 'FAILED')),
  worker_id text,
  claim_version bigint,
  event_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_metadata) = 'object' and pg_catalog.octet_length(event_metadata::text) <= 8192),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index archive_publication_daily_run_events_date_idx
create table survival_rpg.archive_publication_run_batches (
  scheduled_date date not null references survival_rpg.archive_publication_daily_runs(scheduled_date) on delete restrict,
  batch_id text not null check (batch_id ~ '^batch-[0-9a-f]{64}$'),
  plan_id text not null check (plan_id ~ '^plan-[0-9a-f]{64}$'),
  linked_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (scheduled_date, batch_id)
);

create index archive_publication_run_batches_batch_idx
  on survival_rpg.archive_publication_run_batches (batch_id, scheduled_date);
  on survival_rpg.archive_publication_daily_run_events (scheduled_date, occurred_at, event_id);
alter table survival_rpg.archive_publication_daily_runs enable row level security;
alter table survival_rpg.archive_publication_daily_runs force row level security;
alter table survival_rpg.archive_publication_daily_run_events enable row level security;
alter table survival_rpg.archive_publication_run_batches enable row level security;
alter table survival_rpg.archive_publication_run_batches force row level security;
alter table survival_rpg.archive_publication_daily_run_events force row level security;

create policy archive_publication_daily_runs_internal_access
  on survival_rpg.archive_publication_daily_runs
  for all to archive_runner_internal
  using (true) with check (true);

create policy archive_publication_daily_run_events_internal_access
  on survival_rpg.archive_publication_daily_run_events
  for all to archive_runner_internal
  using (true) with check (true);

create policy archive_publication_run_batches_internal_access
  on survival_rpg.archive_publication_run_batches
  for all to archive_runner_internal
  using (true) with check (true);
alter table survival_rpg.archive_publication_tasks enable row level security;
alter table survival_rpg.archive_publication_tasks force row level security;
alter table survival_rpg.archive_publication_task_events enable row level security;
alter table survival_rpg.archive_publication_task_events force row level security;

create policy archive_publication_tasks_internal_access
  on survival_rpg.archive_publication_tasks
  for all to archive_runner_internal
  using (true) with check (true);

create policy archive_publication_task_events_internal_access
  on survival_rpg.archive_publication_task_events
  for all to archive_runner_internal
  using (true) with check (true);

revoke all privileges on table survival_rpg.archive_publication_tasks from public, anon, authenticated, service_role;
revoke all privileges on table survival_rpg.archive_publication_daily_runs from public, anon, authenticated, service_role;
revoke all privileges on table survival_rpg.archive_publication_daily_run_events from public, anon, authenticated, service_role;
revoke all privileges on table survival_rpg.archive_publication_run_batches from public, anon, authenticated, service_role;
revoke all privileges on table survival_rpg.archive_publication_task_events from public, anon, authenticated, service_role;
grant usage, create on schema survival_rpg to archive_runner_internal;
grant usage on schema survival_rpg to service_role;
grant select, insert, update on table survival_rpg.archive_publication_tasks to archive_runner_internal;
grant select, insert on table survival_rpg.archive_publication_task_events to archive_runner_internal;
grant select, insert, update on table survival_rpg.archive_publication_daily_runs to archive_runner_internal;
grant select, insert on table survival_rpg.archive_publication_daily_run_events to archive_runner_internal;
grant select, insert on table survival_rpg.archive_publication_run_batches to archive_runner_internal;

create or replace function survival_rpg.enqueue_archive_publication_task(
  p_task_id text,
  p_batch_id text,
  p_plan_id text,
  p_task_kind text,
  p_chronicle_id text,
  p_worldline_id text,
  p_season_id text,
  p_source_snapshot_sha256 text
)
returns table (out_task_id text, out_status text, out_created boolean)
language plpgsql
security definer
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_task survival_rpg.archive_publication_tasks%rowtype;
  v_rows integer;
begin
  if p_task_id is null or p_batch_id is null or p_plan_id is null
     or p_task_kind is null or p_chronicle_id is null or p_worldline_id is null
     or p_season_id is null or p_source_snapshot_sha256 is null then
    raise exception 'INVALID_TASK_IDENTITY' using errcode = '22023';
  end if;

  insert into survival_rpg.archive_publication_tasks (
    task_id, batch_id, plan_id, task_kind, chronicle_id, worldline_id, season_id, source_snapshot_sha256
  ) values (
    p_task_id, p_batch_id, p_plan_id, p_task_kind, p_chronicle_id, p_worldline_id, p_season_id, p_source_snapshot_sha256
  ) on conflict (task_id) do nothing;

  get diagnostics v_rows = row_count;
  select * into strict v_task
    from survival_rpg.archive_publication_tasks
   where task_id = p_task_id
   for update;

  if v_task.batch_id <> p_batch_id
     or v_task.plan_id <> p_plan_id
     or v_task.task_kind <> p_task_kind
     or v_task.chronicle_id <> p_chronicle_id
     or v_task.worldline_id <> p_worldline_id
     or v_task.season_id <> p_season_id
     or v_task.source_snapshot_sha256 <> p_source_snapshot_sha256 then
    raise exception 'TASK_IDENTITY_CONFLICT' using errcode = '23505';
  end if;

  if v_rows = 1 then
    insert into survival_rpg.archive_publication_task_events (task_id, batch_id, event_type)
    values (v_task.task_id, v_task.batch_id, 'ENQUEUED');
  end if;

  return query select v_task.task_id, v_task.status, (v_rows = 1);
end;
$$;

create or replace function survival_rpg.claim_archive_publication_task(
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns table (
  out_task_id text, out_batch_id text, out_plan_id text, out_task_kind text,
  out_chronicle_id text, out_worldline_id text, out_season_id text,
  out_source_snapshot_sha256 text, out_attempt_count integer, out_claim_version bigint,
  out_lease_token uuid, out_lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_task survival_rpg.archive_publication_tasks%rowtype;
begin
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9_.:-]{1,80}$' then
    raise exception 'INVALID_WORKER_ID' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'INVALID_LEASE_DURATION' using errcode = '22023';
  end if;

  loop
    select t.* into v_task
      from survival_rpg.archive_publication_tasks as t
     where (
       t.status = 'PENDING'
       or (t.status = 'RETRY_WAIT' and t.retry_after <= pg_catalog.clock_timestamp())
       or (t.status = 'CLAIMED' and t.lease_expires_at <= pg_catalog.clock_timestamp())
     )
     order by t.created_at, t.task_id
     for update skip locked
     limit 1;

    if not found then
      return;
    end if;

    if v_task.attempt_count >= 3 then
      update survival_rpg.archive_publication_tasks
         set status = 'QUARANTINED',
             lease_owner = null, lease_token = null, lease_expires_at = null,
             retry_after = null, last_error_code = 'RETRY_LIMIT_EXHAUSTED',
             updated_at = pg_catalog.clock_timestamp(), completed_at = pg_catalog.clock_timestamp()
       where task_id = v_task.task_id;
      insert into survival_rpg.archive_publication_task_events (
        task_id, batch_id, event_type, worker_id, claim_version, event_metadata
      ) values (
        v_task.task_id, v_task.batch_id, 'QUARANTINED', p_worker_id, v_task.claim_version,
        jsonb_build_object('reason_code', 'RETRY_LIMIT_EXHAUSTED')
      );
      continue;
    end if;

    update survival_rpg.archive_publication_tasks as t
       set status = 'CLAIMED',
           attempt_count = t.attempt_count + 1,
           claim_version = t.claim_version + 1,
           lease_owner = p_worker_id,
           lease_token = gen_random_uuid(),
           lease_expires_at = pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_lease_seconds),
           retry_after = null,
           updated_at = pg_catalog.clock_timestamp()
     where t.task_id = v_task.task_id
     returning t.* into v_task;

    insert into survival_rpg.archive_publication_task_events (
      task_id, batch_id, event_type, worker_id, claim_version,
      event_metadata
    ) values (
      v_task.task_id, v_task.batch_id, 'CLAIMED', p_worker_id, v_task.claim_version,
      jsonb_build_object('attempt', v_task.attempt_count, 'lease_seconds', p_lease_seconds)
    );

    return query select
      v_task.task_id, v_task.batch_id, v_task.plan_id, v_task.task_kind,
      v_task.chronicle_id, v_task.worldline_id, v_task.season_id,
      v_task.source_snapshot_sha256, v_task.attempt_count, v_task.claim_version,
      v_task.lease_token, v_task.lease_expires_at;
    return;
  end loop;
end;
$$;

create or replace function survival_rpg.renew_archive_publication_task_lease(
  p_task_id text,
  p_claim_version bigint,
  p_lease_token uuid,
  p_lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_updated integer;
begin
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'INVALID_LEASE_DURATION' using errcode = '22023';
  end if;

  update survival_rpg.archive_publication_tasks
     set lease_expires_at = pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_lease_seconds),
         updated_at = pg_catalog.clock_timestamp()
   where task_id = p_task_id
     and status = 'CLAIMED'
     and claim_version = p_claim_version
     and lease_token = p_lease_token
     and lease_expires_at > pg_catalog.clock_timestamp();

  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    insert into survival_rpg.archive_publication_task_events (
      task_id, batch_id, event_type, claim_version, event_metadata
    )
    select task_id, batch_id, 'LEASE_RENEWED', claim_version,
           jsonb_build_object('lease_seconds', p_lease_seconds)
      from survival_rpg.archive_publication_tasks
     where task_id = p_task_id;
  end if;
  return v_updated = 1;
end;
$$;

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

  if v_task.status <> 'CLAIMED'
     or v_task.claim_version <> p_claim_version
     or v_task.lease_token <> p_lease_token
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

  if v_run.status in ('NOOP', 'COMPLETE', 'QUARANTINED', 'FAILED') then
    return query select v_run.scheduled_date, v_run.status, v_run.attempt_count::integer,
      v_run.claim_version, v_run.lease_token, v_run.lease_expires_at,
      v_run.lag_seconds, false;
    return;
  end if;
  if v_run.status = 'CLAIMED' and v_run.lease_expires_at > v_now then
    return query select v_run.scheduled_date, v_run.status, v_run.attempt_count::integer,
      v_run.claim_version, v_run.lease_token, v_run.lease_expires_at,
      v_run.lag_seconds, false;
    return;
  end if;
  if v_run.status = 'RETRY_WAIT' and v_run.retry_after > v_now then
    return query select v_run.scheduled_date, v_run.status, v_run.attempt_count::integer,
      v_run.claim_version, v_run.lease_token, v_run.lease_expires_at,
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
      v_run.claim_version, v_run.lease_token, v_run.lease_expires_at,
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

create or replace function survival_rpg.renew_archive_publication_daily_run_lease(
  p_scheduled_date date,
  p_claim_version bigint,
  p_lease_token uuid,
  p_lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_run survival_rpg.archive_publication_daily_runs%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_scheduled_date is null or p_claim_version is null or p_lease_token is null then
    raise exception 'INVALID_LEASE_IDENTITY' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'INVALID_LEASE_DURATION' using errcode = '22023';
  end if;

  update survival_rpg.archive_publication_daily_runs
     set lease_expires_at = v_now + make_interval(secs => p_lease_seconds)
   where scheduled_date = p_scheduled_date
     and status = 'CLAIMED'
     and claim_version = p_claim_version
     and lease_token = p_lease_token
     and lease_expires_at > v_now
   returning * into v_run;

  if not found then return false; end if;

  insert into survival_rpg.archive_publication_daily_run_events (
    scheduled_date, event_type, worker_id, claim_version, event_metadata
  ) values (
    v_run.scheduled_date, 'LEASE_RENEWED', v_run.lease_owner, v_run.claim_version,
    jsonb_build_object('lease_expires_at', v_run.lease_expires_at)
  );
  return true;
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

  if v_run.status <> 'CLAIMED'
     or v_run.claim_version <> p_claim_version
     or v_run.lease_token <> p_lease_token
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
   where scheduled_date = p_scheduled_date;

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
  if v_run.status <> 'CLAIMED'
     or v_run.claim_version <> p_claim_version
     or v_run.lease_token <> p_lease_token
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
alter function survival_rpg.link_archive_publication_run_batch(date,bigint,uuid,text,text) owner to archive_runner_internal;
alter function survival_rpg.claim_archive_publication_daily_run(date,text,integer) owner to archive_runner_internal;
alter function survival_rpg.archive_publication_receipt_is_valid(jsonb) owner to archive_runner_internal;
alter function survival_rpg.enqueue_archive_publication_task(text,text,text,text,text,text,text,text) owner to archive_runner_internal;
alter function survival_rpg.renew_archive_publication_daily_run_lease(date,bigint,uuid,integer) owner to archive_runner_internal;
alter function survival_rpg.finish_archive_publication_daily_run(date,bigint,uuid,text,jsonb,text,integer) owner to archive_runner_internal;
alter function survival_rpg.claim_archive_publication_task(text,integer) owner to archive_runner_internal;
alter function survival_rpg.renew_archive_publication_task_lease(text,bigint,uuid,integer) owner to archive_runner_internal;
alter function survival_rpg.finish_archive_publication_task(text,bigint,uuid,text,jsonb,text,integer) owner to archive_runner_internal;

revoke all on function survival_rpg.archive_publication_receipt_is_valid(jsonb) from public, anon, authenticated, service_role;
revoke all on function survival_rpg.enqueue_archive_publication_task(text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function survival_rpg.link_archive_publication_run_batch(date,bigint,uuid,text,text) from public, anon, authenticated;
revoke all on function survival_rpg.claim_archive_publication_daily_run(date,text,integer) from public, anon, authenticated;
revoke all on function survival_rpg.renew_archive_publication_daily_run_lease(date,bigint,uuid,integer) from public, anon, authenticated;
revoke all on function survival_rpg.finish_archive_publication_daily_run(date,bigint,uuid,text,jsonb,text,integer) from public, anon, authenticated;
revoke all on function survival_rpg.claim_archive_publication_task(text,integer) from public, anon, authenticated;
revoke all on function survival_rpg.renew_archive_publication_task_lease(text,bigint,uuid,integer) from public, anon, authenticated;
revoke all on function survival_rpg.finish_archive_publication_task(text,bigint,uuid,text,jsonb,text,integer) from public, anon, authenticated;

grant execute on function survival_rpg.archive_publication_receipt_is_valid(jsonb) to archive_runner_internal;
grant execute on function survival_rpg.enqueue_archive_publication_task(text,text,text,text,text,text,text,text) to service_role;
grant execute on function survival_rpg.link_archive_publication_run_batch(date,bigint,uuid,text,text) to service_role;
grant execute on function survival_rpg.claim_archive_publication_daily_run(date,text,integer) to service_role;
grant execute on function survival_rpg.renew_archive_publication_daily_run_lease(date,bigint,uuid,integer) to service_role;
grant execute on function survival_rpg.finish_archive_publication_daily_run(date,bigint,uuid,text,jsonb,text,integer) to service_role;
grant execute on function survival_rpg.claim_archive_publication_task(text,integer) to service_role;
grant execute on function survival_rpg.renew_archive_publication_task_lease(text,bigint,uuid,integer) to service_role;
grant execute on function survival_rpg.finish_archive_publication_task(text,bigint,uuid,text,jsonb,text,integer) to service_role;
revoke create on schema survival_rpg from archive_runner_internal;
