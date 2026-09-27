-- Extend the dedicated publication login with ledger RPCs only.
-- Apply after 20260927215800_archive_daily_runner_login_v1.sql.
-- The exporter remains read only, and this login has no direct table grants.
begin;
do $$
begin
  if not exists (
    select 1 from pg_roles
     where rolname = 'archive_publication_runner'
       and rolcanlogin and not rolsuper
       and not rolinherit and not rolbypassrls
       and not rolcreatedb and not rolcreaterole
  ) or exists (
    select 1 from pg_auth_members
     where member = 'archive_publication_runner'::regrole
  ) then
    raise exception 'DEDICATED_PUBLICATION_RUNNER_REQUIRED' using errcode = '42501';
  end if;
  if to_regprocedure('survival_rpg.enqueue_archive_publication_task(text,text,text,text,text,text,text,text)') is null
    or to_regprocedure('survival_rpg.link_archive_publication_run_batch(date,bigint,uuid,text,text)') is null
    or to_regprocedure('survival_rpg.renew_archive_publication_daily_run_lease(date,bigint,uuid,integer)') is null
    or to_regprocedure('survival_rpg.claim_archive_publication_task(text,integer)') is null
    or to_regprocedure('survival_rpg.renew_archive_publication_task_lease(text,bigint,uuid,integer)') is null
    or to_regprocedure('survival_rpg.finish_archive_publication_task(text,bigint,uuid,text,jsonb,text,integer)') is null then
    raise exception 'HARDENED_PUBLICATION_LEDGER_REQUIRED' using errcode = '55000';
  end if;
end;
$$;

grant execute on function survival_rpg.renew_archive_publication_daily_run_lease(date,bigint,uuid,integer)
  to archive_publication_runner;
grant execute on function survival_rpg.enqueue_archive_publication_task(text,text,text,text,text,text,text,text)
  to archive_publication_runner;
grant execute on function survival_rpg.link_archive_publication_run_batch(date,bigint,uuid,text,text)
  to archive_publication_runner;
-- The generic claim chooses any pending task. A text runner must claim only
-- its deterministic task ID, so another publication lane cannot lose attempts.
-- Staging postgres is non-superuser. Restore SET/CREATE only within this
-- transaction and create the SECURITY DEFINER function as its final owner.
grant archive_runner_internal to postgres with set true, inherit false;
grant create on schema survival_rpg to archive_runner_internal;
set role archive_runner_internal;
create or replace function survival_rpg.claim_archive_publication_task_by_id(
  p_task_id text, p_worker_id text, p_lease_seconds integer default 300
)
returns table (
  out_task_id text, out_batch_id text, out_plan_id text, out_task_kind text,
  out_chronicle_id text, out_worldline_id text, out_season_id text,
  out_source_snapshot_sha256 text, out_attempt_count integer, out_claim_version bigint,
  out_lease_token uuid, out_lease_expires_at timestamptz
)
language plpgsql security definer
set search_path = pg_catalog, survival_rpg
as $$
declare v_task survival_rpg.archive_publication_tasks%rowtype;
begin
  if p_task_id is null or p_task_id !~ '^task-[a-f0-9]{64}$'
    or p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9_.:-]{1,80}$' then
    raise exception 'INVALID_TASK_CLAIM_IDENTITY' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'INVALID_LEASE_DURATION' using errcode = '22023';
  end if;
  select t.* into v_task from survival_rpg.archive_publication_tasks t
   where t.task_id = p_task_id and t.task_kind = 'TEXT_SOURCE'
     and (t.status = 'PENDING'
       or (t.status = 'RETRY_WAIT' and t.retry_after <= pg_catalog.clock_timestamp())
       or (t.status = 'CLAIMED' and t.lease_expires_at <= pg_catalog.clock_timestamp()))
   for update skip locked;
  if not found then return; end if;
  if v_task.attempt_count >= 3 then
    update survival_rpg.archive_publication_tasks
       set status = 'QUARANTINED', lease_owner = null, lease_token = null,
           lease_expires_at = null, retry_after = null,
           last_error_code = 'RETRY_LIMIT_EXHAUSTED',
           updated_at = pg_catalog.clock_timestamp(),
           completed_at = pg_catalog.clock_timestamp()
     where task_id = p_task_id;
    insert into survival_rpg.archive_publication_task_events
      (task_id,batch_id,event_type,worker_id,claim_version,event_metadata)
    values (p_task_id,v_task.batch_id,'QUARANTINED',p_worker_id,
      v_task.claim_version,jsonb_build_object('reason_code','RETRY_LIMIT_EXHAUSTED'));
    return;
  end if;
  update survival_rpg.archive_publication_tasks t
     set status = 'CLAIMED', attempt_count = t.attempt_count + 1,
         claim_version = t.claim_version + 1, lease_owner = p_worker_id,
         lease_token = gen_random_uuid(),
         lease_expires_at = pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_lease_seconds),
         retry_after = null, updated_at = pg_catalog.clock_timestamp()
   where t.task_id = p_task_id returning t.* into v_task;
  insert into survival_rpg.archive_publication_task_events
    (task_id,batch_id,event_type,worker_id,claim_version,event_metadata)
  values (p_task_id,v_task.batch_id,'CLAIMED',p_worker_id,v_task.claim_version,
    jsonb_build_object('attempt',v_task.attempt_count,'lease_seconds',p_lease_seconds));
  return query select v_task.task_id,v_task.batch_id,v_task.plan_id,v_task.task_kind,
    v_task.chronicle_id,v_task.worldline_id,v_task.season_id,
    v_task.source_snapshot_sha256,v_task.attempt_count::integer,v_task.claim_version,
    v_task.lease_token,v_task.lease_expires_at;
end;
$$;
revoke all on function survival_rpg.claim_archive_publication_task_by_id(text,text,integer)
  from public, anon, authenticated, service_role;
reset role;
revoke create on schema survival_rpg from archive_runner_internal;
-- Preserve only Supabase's pre-existing ADMIN-only grant. A GRANT issued by
-- postgres creates a second grantor row even after SET is switched off.
revoke archive_runner_internal from postgres granted by postgres;
revoke all on function survival_rpg.claim_archive_publication_task(text,integer)
  from archive_publication_runner;
grant execute on function survival_rpg.claim_archive_publication_task_by_id(text,text,integer)
  to archive_publication_runner;
grant execute on function survival_rpg.renew_archive_publication_task_lease(text,bigint,uuid,integer)
  to archive_publication_runner;
grant execute on function survival_rpg.finish_archive_publication_task(text,bigint,uuid,text,jsonb,text,integer)
  to archive_publication_runner;

do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'survival_rpg' and c.relkind in ('r','p','v','m','f')
       and (has_any_column_privilege('archive_publication_runner', c.oid,
              'SELECT, INSERT, UPDATE')
         or has_table_privilege('archive_publication_runner', c.oid, 'DELETE'))
  ) or has_table_privilege('archive_publication_runner',
      'survival_rpg.transcript_messages', 'SELECT')
    or (select p.proowner <> 'archive_runner_internal'::regrole
          from pg_proc p
         where p.oid = 'survival_rpg.claim_archive_publication_task_by_id(text,text,integer)'::regprocedure)
    or has_schema_privilege('archive_runner_internal', 'survival_rpg', 'CREATE')
    or (select count(*) from pg_auth_members m
      where m.roleid = 'archive_runner_internal'::regrole
        and m.member = 'postgres'::regrole) <> 1
    or exists (select 1 from pg_auth_members m
      where m.roleid = 'archive_runner_internal'::regrole
        and m.member = 'postgres'::regrole
        and (m.grantor <> 'supabase_admin'::regrole or not m.admin_option
          or m.inherit_option or m.set_option))
    or exists (select 1 from pg_auth_members
      where member = 'archive_publication_runner'::regrole) then
    raise exception 'PUBLICATION_RUNNER_DIRECT_ACCESS_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;
commit;
