\set ON_ERROR_STOP on
begin;

-- Verify least-privilege catalog state before exercising service-role RPCs.
do $$
declare
  v_internal record;
  v_procedure record;
begin
  select rolcanlogin, rolinherit, rolbypassrls
    into strict v_internal
    from pg_catalog.pg_roles
   where rolname = 'archive_runner_internal';
  if v_internal.rolcanlogin or v_internal.rolinherit or v_internal.rolbypassrls then
    raise exception 'INTERNAL_ROLE_PRIVILEGES_INVALID';
  end if;
  if has_schema_privilege('archive_runner_internal', 'survival_rpg', 'CREATE') then
    raise exception 'INTERNAL_ROLE_SCHEMA_CREATE_NOT_REVOKED';
  end if;
  if exists (
    select 1 from pg_catalog.pg_auth_members m
     where m.roleid = 'archive_runner_internal'::regrole
       and m.member = 'postgres'::regrole
       and (m.inherit_option or m.set_option)
  ) then
    raise exception 'POSTGRES_INTERNAL_ROLE_OPTIONS_REMAIN';
  end if;

  if not (select relrowsecurity and relforcerowsecurity
            from pg_catalog.pg_class
           where oid = 'survival_rpg.archive_publication_tasks'::regclass) then
    raise exception 'TASK_TABLE_RLS_NOT_FORCED';
  end if;
  if not (select relrowsecurity and relforcerowsecurity
            from pg_catalog.pg_class
           where oid = 'survival_rpg.archive_publication_daily_runs'::regclass) then
    raise exception 'RUN_TABLE_RLS_NOT_FORCED';
  end if;
  if not (select relrowsecurity and relforcerowsecurity
            from pg_catalog.pg_class
           where oid = 'survival_rpg.archive_publication_run_batches'::regclass) then
    raise exception 'RUN_BATCH_TABLE_RLS_NOT_FORCED';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class idx on idx.oid = i.indexrelid
    where i.indrelid = 'survival_rpg.archive_publication_task_events'::regclass
      and idx.relname = 'archive_publication_task_events_task_idx'
      and i.indisvalid
  ) then
    raise exception 'TASK_EVENT_FK_INDEX_MISSING';
  end if;

  if has_table_privilege('anon', 'survival_rpg.archive_publication_tasks', 'SELECT')
     or has_table_privilege('authenticated', 'survival_rpg.archive_publication_tasks', 'SELECT')
     or has_table_privilege('service_role', 'survival_rpg.archive_publication_tasks', 'SELECT')
     or has_table_privilege('service_role', 'survival_rpg.archive_publication_tasks', 'UPDATE') then
    raise exception 'DIRECT_TASK_TABLE_ACCESS_GRANTED';
  end if;

  if has_function_privilege('anon', 'survival_rpg.claim_archive_publication_daily_run(date,text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'survival_rpg.claim_archive_publication_daily_run(date,text,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'survival_rpg.claim_archive_publication_daily_run(date,text,integer)', 'EXECUTE') then
    raise exception 'DAILY_RUN_RPC_GRANTS_INVALID';
  end if;

  select prosecdef, proconfig, pg_catalog.pg_get_userbyid(proowner) as owner_name
    into strict v_procedure
    from pg_catalog.pg_proc
   where oid = 'survival_rpg.claim_archive_publication_daily_run(date,text,integer)'::regprocedure;
  if not v_procedure.prosecdef
     or v_procedure.owner_name <> 'archive_runner_internal'
     or not ('search_path=pg_catalog, survival_rpg' = any(v_procedure.proconfig)) then
    raise exception 'DAILY_RUN_RPC_SECURITY_INVALID';
  end if;

  if not survival_rpg.archive_publication_receipt_is_valid('{"result":"NOOP","pr_number":"149"}'::jsonb)
     or survival_rpg.archive_publication_receipt_is_valid('{"result":"private transcript"}'::jsonb)
     or survival_rpg.archive_publication_receipt_is_valid('{"unknown_key":"value"}'::jsonb)
     or survival_rpg.archive_publication_receipt_is_valid('{"result":true}'::jsonb) then
    raise exception 'RECEIPT_METADATA_VALIDATION_INVALID';
  end if;
end;
$$;

set local role service_role;

do $$
declare
  v_schedule date := (pg_catalog.clock_timestamp() at time zone 'Asia/Seoul')::date - 3;
  v_link_schedule date := (pg_catalog.clock_timestamp() at time zone 'Asia/Seoul')::date - 4;
  v_run record;
  v_link_run record;
  v_task record;
  v_finished text;
  v_event_count integer;
  v_event_count_after integer;
  v_batch_count integer;
  v_task_status text;
  v_task_receipt jsonb;
  v_run_receipt jsonb;
  v_run_finished_at timestamptz;
begin
  select * into strict v_run
    from survival_rpg.claim_archive_publication_daily_run(v_schedule, 'ci-runner-a', 300);
  if not v_run.out_claimed or v_run.out_status <> 'CLAIMED' or v_run.out_attempt_count <> 1
     or v_run.out_lag_seconds is null or v_run.out_lease_token is null then
    raise exception 'FIRST_DAILY_RUN_CLAIM_FAILED';
  end if;

  select * into strict v_task
    from survival_rpg.claim_archive_publication_daily_run(v_schedule, 'ci-runner-b', 300);
  if v_task.out_claimed or v_task.out_lease_token is not null
     or v_task.out_claim_version is not null or v_task.out_lease_expires_at is not null then
    raise exception 'FAILED_DAILY_RUN_CLAIM_EXPOSED_LEASE';
  end if;

  begin
    perform survival_rpg.renew_archive_publication_daily_run_lease(
      v_schedule, v_task.out_claim_version, v_task.out_lease_token, 300
    );
    raise exception 'FAILED_DAILY_RUN_CLAIM_RENEWED_ACTIVE_LEASE';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    perform survival_rpg.link_archive_publication_run_batch(
      v_schedule, v_task.out_claim_version, v_task.out_lease_token,
      'batch-' || repeat('8', 64), 'plan-' || repeat('9', 64)
    );
    raise exception 'FAILED_DAILY_RUN_CLAIM_LINKED_BATCH';
  exception when sqlstate '22023' then
    null;
  end;

  select count(*) into v_event_count
    from survival_rpg.archive_publication_daily_run_events
   where scheduled_date = v_schedule;
  begin
    perform survival_rpg.finish_archive_publication_daily_run(
      v_schedule, v_task.out_claim_version, v_task.out_lease_token,
      'NOOP', '{"result":"loser"}'::jsonb, null, null
    );
    raise exception 'FAILED_DAILY_RUN_CLAIM_FINISHED_ACTIVE_LEASE';
  exception when sqlstate '22023' then
    null;
  end;
  select count(*) into v_event_count_after
    from survival_rpg.archive_publication_daily_run_events
   where scheduled_date = v_schedule;
  select count(*) into v_batch_count
    from survival_rpg.archive_publication_run_batches
   where scheduled_date = v_schedule;
  select receipt, finished_at into v_run_receipt, v_run_finished_at
    from survival_rpg.archive_publication_daily_runs where scheduled_date = v_schedule;
  if v_event_count_after <> v_event_count or v_batch_count <> 0
     or v_run_receipt <> '{}'::jsonb or v_run_finished_at is not null
     or not exists (
       select 1 from survival_rpg.archive_publication_daily_runs
        where scheduled_date = v_schedule and status = 'CLAIMED'
          and lease_owner = 'ci-runner-a' and lease_token = v_run.out_lease_token
     ) then
    raise exception 'FAILED_DAILY_RUN_CLAIM_MUTATED_ACTIVE_LEASE';
  end if;

  if not survival_rpg.renew_archive_publication_daily_run_lease(
    v_schedule, v_run.out_claim_version, v_run.out_lease_token, 300
  ) then
    raise exception 'DAILY_RUN_LEASE_RENEWAL_FAILED';
  end if;

  begin
    perform survival_rpg.finish_archive_publication_daily_run(
      v_schedule, v_run.out_claim_version, v_run.out_lease_token,
      'COMPLETE', '{"result":"private transcript"}'::jsonb, null, null
    );
    raise exception 'INVALID_RECEIPT_WAS_ACCEPTED';
  exception when sqlstate '22023' then
    null;
  end;

  v_finished := survival_rpg.finish_archive_publication_daily_run(
    v_schedule, v_run.out_claim_version, v_run.out_lease_token,
    'NOOP', '{"result":"NOOP"}'::jsonb, null, null
  );
  if v_finished <> 'NOOP' then raise exception 'DAILY_RUN_NOOP_FAILED'; end if;

  select * into strict v_task
    from survival_rpg.claim_archive_publication_daily_run(v_schedule, 'ci-runner-c', 300);
  if v_task.out_claimed or v_task.out_status <> 'NOOP' then
    raise exception 'COMPLETED_DAILY_RUN_RECLAIMED';
  end if;

  select * into strict v_task
    from survival_rpg.enqueue_archive_publication_task(
      'task-' || repeat('1', 64), 'batch-' || repeat('2', 64), 'plan-' || repeat('3', 64),
      'TEXT_SOURCE', 'C03-AFTERFALL', 'AFTERFALL', 'S03', repeat('a', 64)
    );
  if not v_task.out_created or v_task.out_status <> 'PENDING' then
    raise exception 'TASK_ENQUEUE_FAILED';
  end if;
  select * into strict v_task
    from survival_rpg.enqueue_archive_publication_task(
      'task-' || repeat('1', 64), 'batch-' || repeat('2', 64), 'plan-' || repeat('3', 64),
      'TEXT_SOURCE', 'C03-AFTERFALL', 'AFTERFALL', 'S03', repeat('a', 64)
    );
  if v_task.out_created or v_task.out_status <> 'PENDING' then
    raise exception 'TASK_ENQUEUE_NOT_IDEMPOTENT';
  end if;

  select * into strict v_link_run
    from survival_rpg.claim_archive_publication_daily_run(v_link_schedule, 'ci-runner-link', 300);
  if not v_link_run.out_claimed then raise exception 'LINK_DAILY_RUN_CLAIM_FAILED'; end if;
  if not survival_rpg.link_archive_publication_run_batch(
    v_link_schedule, v_link_run.out_claim_version, v_link_run.out_lease_token,
    'batch-' || repeat('2', 64), 'plan-' || repeat('3', 64)
  ) then raise exception 'FIRST_RUN_BATCH_LINK_FAILED'; end if;
  if survival_rpg.link_archive_publication_run_batch(
    v_link_schedule, v_link_run.out_claim_version, v_link_run.out_lease_token,
    'batch-' || repeat('2', 64), 'plan-' || repeat('3', 64)
  ) then raise exception 'RUN_BATCH_LINK_NOT_IDEMPOTENT'; end if;
  if survival_rpg.finish_archive_publication_daily_run(
    v_link_schedule, v_link_run.out_claim_version, v_link_run.out_lease_token,
    'NOOP', '{"result":"NOOP"}'::jsonb, null, null
  ) <> 'NOOP' then raise exception 'LINK_DAILY_RUN_FINISH_FAILED'; end if;
  select * into strict v_task
    from survival_rpg.claim_archive_publication_task('ci-runner-a', 300);
  if v_task.out_task_id <> 'task-' || repeat('1', 64) or v_task.out_attempt_count <> 1 then
    raise exception 'TASK_CLAIM_FAILED';
  end if;

  select count(*) into v_event_count
    from survival_rpg.archive_publication_task_events
   where task_id = v_task.out_task_id;
  begin
    perform survival_rpg.finish_archive_publication_task(
      v_task.out_task_id, null::bigint, null::uuid, 'NOOP', '{"result":"null-both"}'::jsonb, null, null
    );
    raise exception 'NULL_TASK_LEASE_IDENTITY_BOTH_ACCEPTED';
  exception when sqlstate '55000' then
    null;
  end;
  begin
    perform survival_rpg.finish_archive_publication_task(
      v_task.out_task_id, null::bigint, v_task.out_lease_token, 'NOOP', '{"result":"null-version"}'::jsonb, null, null
    );
    raise exception 'NULL_TASK_CLAIM_VERSION_ACCEPTED';
  exception when sqlstate '55000' then
    null;
  end;
  begin
    perform survival_rpg.finish_archive_publication_task(
      v_task.out_task_id, v_task.out_claim_version, null::uuid, 'NOOP', '{"result":"null-token"}'::jsonb, null, null
    );
    raise exception 'NULL_TASK_LEASE_TOKEN_ACCEPTED';
  exception when sqlstate '55000' then
    null;
  end;
  select status, receipt into v_task_status, v_task_receipt
    from survival_rpg.archive_publication_tasks where task_id = v_task.out_task_id;
  select count(*) into v_event_count_after
    from survival_rpg.archive_publication_task_events where task_id = v_task.out_task_id;
  if v_task_status <> 'CLAIMED' or v_task_receipt <> '{}'::jsonb
     or v_event_count_after <> v_event_count then
    raise exception 'INVALID_TASK_LEASE_IDENTITY_MUTATED_TASK';
  end if;

  v_finished := survival_rpg.finish_archive_publication_task(
    v_task.out_task_id, v_task.out_claim_version, v_task.out_lease_token,
    'NOOP', '{"result":"NOOP"}'::jsonb, null, null
  );
  if v_finished <> 'NOOP' then raise exception 'TASK_NOOP_FAILED'; end if;
end;
$$;

reset role;

-- The transaction rolls back all synthetic rows; only catalog structure is exercised.
rollback;
