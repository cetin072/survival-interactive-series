-- A dedicated login for the one-shot daily ledger runner. No password is
-- installed here; provision one only when the runner is explicitly enabled.
-- It cannot read source text or write ledger tables directly.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'archive_publication_runner') then
    raise exception 'archive_publication_runner already exists; audit before migration'
      using errcode = '42710';
  end if;
  if to_regprocedure('survival_rpg.claim_archive_publication_daily_run(date,text,integer)') is null
    or to_regprocedure('survival_rpg.finish_archive_publication_daily_run(date,bigint,uuid,text,jsonb,text,integer)') is null then
    raise exception 'hardened publication ledger required first' using errcode = '55000';
  end if;
end;
$$;

create role archive_publication_runner login nosuperuser noinherit nocreatedb
  nocreaterole noreplication nobypassrls password null;
alter role archive_publication_runner set statement_timeout = '10s';
alter role archive_publication_runner set search_path = pg_catalog, survival_rpg;
do $$
begin
  execute format('grant connect on database %I to archive_publication_runner', current_database());
end;
$$;
grant usage on schema survival_rpg to archive_publication_runner;
grant execute on function survival_rpg.claim_archive_publication_daily_run(date,text,integer)
  to archive_publication_runner;
grant execute on function survival_rpg.finish_archive_publication_daily_run(date,bigint,uuid,text,jsonb,text,integer)
  to archive_publication_runner;

do $$
begin
  if exists (select 1 from pg_auth_members where member = 'archive_publication_runner'::regrole)
    or exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'survival_rpg' and c.relkind in ('r','p','v','m','f')
        and (has_any_column_privilege('archive_publication_runner', c.oid, 'SELECT, INSERT, UPDATE')
          or has_table_privilege('archive_publication_runner', c.oid, 'DELETE'))
    )
    or has_function_privilege('archive_publication_runner',
      'survival_rpg.enqueue_archive_publication_task(text,text,text,text,text,text,text,text)', 'EXECUTE')
    or has_function_privilege('archive_publication_runner',
      'survival_rpg.claim_archive_publication_task(text,integer)', 'EXECUTE') then
    raise exception 'archive_publication_runner acquired an unsafe privilege'
      using errcode = '42501';
  end if;
end;
$$;
