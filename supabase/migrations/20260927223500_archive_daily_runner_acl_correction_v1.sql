-- The staging migration login is not the owner of the daily ledger RPCs.
-- Correct the two EXECUTE ACLs as the non-login function owner. Keep the
-- exporter read only and restore the managed membership in one transaction.
begin;
do $$
begin
  if not exists (select 1 from pg_roles r
      where r.rolname = 'archive_publication_runner' and r.rolcanlogin
        and not r.rolsuper and not r.rolbypassrls and not r.rolinherit)
    or (select count(*) from pg_auth_members m
      where m.roleid = 'archive_runner_internal'::regrole
        and m.member = 'postgres'::regrole) <> 1
    or not exists (select 1 from pg_auth_members m
      where m.roleid = 'archive_runner_internal'::regrole
        and m.member = 'postgres'::regrole
        and m.grantor = 'supabase_admin'::regrole and m.admin_option
        and not m.inherit_option and not m.set_option) then
    raise exception 'ARCHIVE_DAILY_ACL_PRECONDITION_FAILED' using errcode = '42501';
  end if;
end;
$$;
grant archive_runner_internal to postgres with set true, inherit false;
set role archive_runner_internal;
grant execute on function survival_rpg.claim_archive_publication_daily_run(date,text,integer)
  to archive_publication_runner;
grant execute on function survival_rpg.finish_archive_publication_daily_run(date,bigint,uuid,text,jsonb,text,integer)
  to archive_publication_runner;
reset role;
revoke archive_runner_internal from postgres granted by postgres;
do $$
begin
  if not has_function_privilege('archive_publication_runner',
      'survival_rpg.claim_archive_publication_daily_run(date,text,integer)', 'EXECUTE')
    or not has_function_privilege('archive_publication_runner',
      'survival_rpg.finish_archive_publication_daily_run(date,bigint,uuid,text,jsonb,text,integer)', 'EXECUTE')
    or has_function_privilege('archive_publication_runner',
      'survival_rpg.claim_archive_publication_task(text,integer)', 'EXECUTE')
    or has_table_privilege('archive_publication_runner',
      'survival_rpg.transcript_messages', 'SELECT')
    or (select count(*) from pg_auth_members m
      where m.roleid = 'archive_runner_internal'::regrole
        and m.member = 'postgres'::regrole) <> 1
    or exists (select 1 from pg_auth_members m
      where m.roleid = 'archive_runner_internal'::regrole
        and m.member = 'postgres'::regrole
        and (m.grantor <> 'supabase_admin'::regrole or not m.admin_option
          or m.inherit_option or m.set_option)) then
    raise exception 'ARCHIVE_DAILY_ACL_CORRECTION_FAILED' using errcode = '42501';
  end if;
end;
$$;
commit;
