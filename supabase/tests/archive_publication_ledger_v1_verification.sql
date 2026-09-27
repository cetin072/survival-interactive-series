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
begin
  select * into strict v_run
    from survival_rpg.claim_archive_publication_daily_run(v_schedule, 'ci-runner-a', 300);
  if not v_run.out_claimed or v_run.out_status <> 'CLAIMED' or v_run.out_attempt_count <> 1
     or v_run.out_lag_seconds is null or v_run.out_lease_token is null then
    raise exception 'FIRST_DAILY_RUN_CLAIM_FAILED';
  end if;

  select * into strict v_task
    from survival_rpg.claim_archive_publication_daily_run(v_schedule, 'ci-runner-b', 300);
  if v_task.out_claimed or v_task.out_lease_token <> v_run.out_lease_token
     or v_task.out_claim_version <> v_run.out_claim_version then
    raise exception 'LIVE_DAILY_RUN_LEASE_STOLEN';
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