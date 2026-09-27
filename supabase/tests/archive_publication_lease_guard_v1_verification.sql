\set ON_ERROR_STOP on
begin;

-- Exercise the installed RPC bodies on real PostgreSQL. Every rejected task
-- completion must leave the full row and event count unchanged.
do $$
declare
  v_task_id text := 'task-' || repeat('c', 64);
  v_batch_id text := 'batch-' || repeat('d', 64);
  v_plan_id text := 'plan-' || repeat('e', 64);
  v_claim record;
  v_reclaim record;
  v_case record;
  v_before jsonb;
  v_after jsonb;
  v_events_before bigint;
  v_events_after bigint;
  v_rejected boolean;
begin
  perform survival_rpg.enqueue_archive_publication_task(
    v_task_id, v_batch_id, v_plan_id, 'TEXT_SOURCE',
    'C03-AFTERFALL', 'AFTERFALL', 'S03', repeat('a', 64)
  );
  select * into strict v_claim from survival_rpg.claim_archive_publication_task('ci-owner-a', 300);
  if v_claim.out_task_id <> v_task_id then raise exception 'TASK_CLAIM_MISMATCH'; end if;

  for v_case in select * from (values
    ('both-null', null::bigint, null::uuid),
    ('version-null', null::bigint, v_claim.out_lease_token),
    ('token-null', v_claim.out_claim_version, null::uuid),
    ('wrong-token', v_claim.out_claim_version, gen_random_uuid()),
    ('old-version', v_claim.out_claim_version - 1, v_claim.out_lease_token)
  ) as c(label, claim_version, lease_token) loop
    select to_jsonb(t) into strict v_before from survival_rpg.archive_publication_tasks t where task_id = v_task_id;
    select count(*) into v_events_before from survival_rpg.archive_publication_task_events where task_id = v_task_id;
    v_rejected := false;
    begin
      perform survival_rpg.finish_archive_publication_task(
        v_task_id, v_case.claim_version, v_case.lease_token, 'COMPLETE', '{"result":"COMPLETE"}'::jsonb
      );
    exception when sqlstate '22023' or sqlstate '55000' then v_rejected := true;
    end;
    select to_jsonb(t) into strict v_after from survival_rpg.archive_publication_tasks t where task_id = v_task_id;
    select count(*) into v_events_after from survival_rpg.archive_publication_task_events where task_id = v_task_id;
    if not v_rejected or v_before is distinct from v_after or v_events_before <> v_events_after then
      raise exception 'TASK_REJECTION_MUTATED_STATE: %', v_case.label;
    end if;
  end loop;

  update survival_rpg.archive_publication_tasks set lease_expires_at = clock_timestamp() - interval '1 second'
    where task_id = v_task_id;
  select to_jsonb(t) into strict v_before from survival_rpg.archive_publication_tasks t where task_id = v_task_id;
  select count(*) into v_events_before from survival_rpg.archive_publication_task_events where task_id = v_task_id;
  v_rejected := false;
  begin
    perform survival_rpg.finish_archive_publication_task(
      v_task_id, v_claim.out_claim_version, v_claim.out_lease_token, 'COMPLETE', '{"result":"COMPLETE"}'::jsonb
    );
  exception when sqlstate '55000' then v_rejected := true;
  end;
  select to_jsonb(t) into strict v_after from survival_rpg.archive_publication_tasks t where task_id = v_task_id;
  select count(*) into v_events_after from survival_rpg.archive_publication_task_events where task_id = v_task_id;
  if not v_rejected or v_before is distinct from v_after or v_events_before <> v_events_after then
    raise exception 'EXPIRED_TASK_MUTATED_STATE';
  end if;

  select * into strict v_reclaim from survival_rpg.claim_archive_publication_task('ci-owner-b', 300);
  if v_reclaim.out_task_id <> v_task_id or v_reclaim.out_claim_version <= v_claim.out_claim_version then
    raise exception 'TASK_RECLAIM_FAILED';
  end if;
  select to_jsonb(t) into strict v_before from survival_rpg.archive_publication_tasks t where task_id = v_task_id;
  select count(*) into v_events_before from survival_rpg.archive_publication_task_events where task_id = v_task_id;
  v_rejected := false;
  begin
    perform survival_rpg.finish_archive_publication_task(
      v_task_id, v_claim.out_claim_version, v_claim.out_lease_token, 'COMPLETE', '{"result":"COMPLETE"}'::jsonb
    );
  exception when sqlstate '55000' then v_rejected := true;
  end;
  select to_jsonb(t) into strict v_after from survival_rpg.archive_publication_tasks t where task_id = v_task_id;
  select count(*) into v_events_after from survival_rpg.archive_publication_task_events where task_id = v_task_id;
  if not v_rejected or v_before is distinct from v_after or v_events_before <> v_events_after then
    raise exception 'STALE_TASK_OWNER_MUTATED_STATE';
  end if;

  if survival_rpg.finish_archive_publication_task(
    v_task_id, v_reclaim.out_claim_version, v_reclaim.out_lease_token,
    'COMPLETE', '{"result":"COMPLETE"}'::jsonb
  ) <> 'COMPLETE' then raise exception 'TASK_OWNER_FINISH_FAILED'; end if;
  select to_jsonb(t) into strict v_before from survival_rpg.archive_publication_tasks t where task_id = v_task_id;
  select count(*) into v_events_before from survival_rpg.archive_publication_task_events where task_id = v_task_id;
  v_rejected := false;
  begin
    perform survival_rpg.finish_archive_publication_task(
      v_task_id, v_reclaim.out_claim_version, v_reclaim.out_lease_token,
      'COMPLETE', '{"result":"COMPLETE"}'::jsonb
    );
  exception when sqlstate '55000' then v_rejected := true;
  end;
  select to_jsonb(t) into strict v_after from survival_rpg.archive_publication_tasks t where task_id = v_task_id;
  select count(*) into v_events_after from survival_rpg.archive_publication_task_events where task_id = v_task_id;
  if not v_rejected or v_before is distinct from v_after or v_events_before <> v_events_after then
    raise exception 'DUPLICATE_TASK_FINISH_MUTATED_STATE';
  end if;
end;
$$;

-- Failed daily claim must never disclose the active owner's capability.
do $$
declare
  v_date date := (clock_timestamp() at time zone 'Asia/Seoul')::date - 7;
  v_owner record;
  v_failed record;
  v_reclaim record;
  v_before jsonb;
  v_after jsonb;
  v_events_before bigint;
  v_events_after bigint;
  v_rejected boolean;
begin
  select * into strict v_owner from survival_rpg.claim_archive_publication_daily_run(v_date, 'ci-runner-a', 300);
  select to_jsonb(r) into strict v_before from survival_rpg.archive_publication_daily_runs r where scheduled_date = v_date;
  select count(*) into v_events_before from survival_rpg.archive_publication_daily_run_events where scheduled_date = v_date;
  select * into strict v_failed from survival_rpg.claim_archive_publication_daily_run(v_date, 'ci-runner-b', 300);
  select to_jsonb(r) into strict v_after from survival_rpg.archive_publication_daily_runs r where scheduled_date = v_date;
  select count(*) into v_events_after from survival_rpg.archive_publication_daily_run_events where scheduled_date = v_date;
  if not v_owner.out_claimed or v_owner.out_lease_token is null
     or v_failed.out_claimed or v_failed.out_lease_token is not null
     or v_before is distinct from v_after or v_events_before <> v_events_after then
    raise exception 'FAILED_CLAIM_EXPOSED_CAPABILITY_OR_MUTATED_RUN';
  end if;
  v_rejected := false;
  begin
    perform survival_rpg.renew_archive_publication_daily_run_lease(
      v_date, v_failed.out_claim_version, v_failed.out_lease_token, 300
    );
  exception when sqlstate '22023' or sqlstate '55000' then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAILED_CLAIM_RENEWED'; end if;
  v_rejected := false;
  begin
    perform survival_rpg.finish_archive_publication_daily_run(
      v_date, v_failed.out_claim_version, v_failed.out_lease_token, 'COMPLETE', '{"result":"COMPLETE"}'::jsonb
    );
  exception when sqlstate '22023' or sqlstate '55000' then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAILED_CLAIM_FINISHED'; end if;
  v_rejected := false;
  begin
    perform survival_rpg.link_archive_publication_run_batch(
      v_date, v_failed.out_claim_version, v_failed.out_lease_token,
      'batch-' || repeat('d', 64), 'plan-' || repeat('e', 64)
    );
  exception when sqlstate '22023' or sqlstate '55000' then v_rejected := true;
  end;
  select to_jsonb(r) into strict v_after from survival_rpg.archive_publication_daily_runs r where scheduled_date = v_date;
  select count(*) into v_events_after from survival_rpg.archive_publication_daily_run_events where scheduled_date = v_date;
  if not v_rejected or v_before is distinct from v_after or v_events_before <> v_events_after then
    raise exception 'FAILED_CLAIM_CHANGED_RUN_OR_EVENTS';
  end if;
  if not survival_rpg.renew_archive_publication_daily_run_lease(
    v_date, v_owner.out_claim_version, v_owner.out_lease_token, 300
  ) then raise exception 'OWNER_RENEW_FAILED'; end if;
  update survival_rpg.archive_publication_daily_runs set lease_expires_at = clock_timestamp() - interval '1 second'
    where scheduled_date = v_date;
  select * into strict v_reclaim from survival_rpg.claim_archive_publication_daily_run(v_date, 'ci-runner-b', 300);
  if not v_reclaim.out_claimed or v_reclaim.out_lease_token is null
     or v_reclaim.out_claim_version <= v_owner.out_claim_version then raise exception 'RUN_RECLAIM_FAILED'; end if;
  v_rejected := false;
  begin
    perform survival_rpg.finish_archive_publication_daily_run(
      v_date, v_owner.out_claim_version, v_owner.out_lease_token, 'COMPLETE', '{"result":"COMPLETE"}'::jsonb
    );
  exception when sqlstate '55000' then v_rejected := true;
  end;
  if not v_rejected then raise exception 'STALE_RUN_OWNER_FINISHED'; end if;
  if survival_rpg.finish_archive_publication_daily_run(
    v_date, v_reclaim.out_claim_version, v_reclaim.out_lease_token, 'COMPLETE', '{"result":"COMPLETE"}'::jsonb
  ) <> 'COMPLETE' then raise exception 'RECLAIMED_RUN_FINISH_FAILED'; end if;
end;
$$;

rollback;
