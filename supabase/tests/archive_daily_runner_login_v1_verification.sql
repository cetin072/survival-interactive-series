do $$
begin
  if not exists (select 1 from pg_authid where rolname='archive_publication_runner'
      and rolcanlogin and rolpassword is null and not rolsuper
      and not rolinherit and not rolbypassrls and not rolcreaterole)
    or exists (select 1 from pg_auth_members where member='archive_publication_runner'::regrole)
    or not has_function_privilege('archive_publication_runner',
      'survival_rpg.claim_archive_publication_daily_run(date,text,integer)', 'EXECUTE')
    or not has_function_privilege('archive_publication_runner',
      'survival_rpg.finish_archive_publication_daily_run(date,bigint,uuid,text,jsonb,text,integer)', 'EXECUTE')
    or has_function_privilege('archive_publication_runner',
      'survival_rpg.claim_archive_publication_task(text,integer)', 'EXECUTE')
    or has_table_privilege('archive_publication_runner',
      'survival_rpg.archive_publication_daily_runs', 'SELECT')
    or has_table_privilege('archive_publication_runner',
      'survival_rpg.archive_publication_daily_runs', 'UPDATE')
    or has_table_privilege('archive_publication_runner',
      'survival_rpg.transcript_messages', 'SELECT') then
    raise exception 'DAILY_RUNNER_PERMISSION_BOUNDARY_FAILED';
  end if;
end;
$$;
