-- Extend the dedicated publication login with ledger RPCs only.
-- Apply after 20260927215800_archive_daily_runner_login_v1.sql.
-- The exporter remains read only, and this login has no direct table grants.
do $$
begin
  if not exists (
    select 1 from pg_authid
     where rolname = 'archive_publication_runner'
       and rolcanlogin and rolpassword is null and not rolsuper
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
grant execute on function survival_rpg.claim_archive_publication_task(text,integer)
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
    or exists (select 1 from pg_auth_members
      where member = 'archive_publication_runner'::regrole) then
    raise exception 'PUBLICATION_RUNNER_DIRECT_ACCESS_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;
