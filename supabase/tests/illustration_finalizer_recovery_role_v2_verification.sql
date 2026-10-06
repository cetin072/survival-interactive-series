-- Verify finalizer recovery is callable only by service_role and does not
-- depend on request.jwt.claim.role being populated.

do $$
begin
  if has_function_privilege(
      'anon',
      'public.archive_illustration_finalizer_recover_check_timeout(text,text,text,text)',
      'EXECUTE'
    ) then
    raise exception 'anon must not execute finalizer recovery';
  end if;
  if has_function_privilege(
      'authenticated',
      'public.archive_illustration_finalizer_recover_check_timeout(text,text,text,text)',
      'EXECUTE'
    ) then
    raise exception 'authenticated must not execute finalizer recovery';
  end if;
  if not has_function_privilege(
      'service_role',
      'public.archive_illustration_finalizer_recover_check_timeout(text,text,text,text)',
      'EXECUTE'
    ) then
    raise exception 'service_role must execute finalizer recovery';
  end if;
end
$$;

set role authenticated;
do $$
begin
  perform public.archive_illustration_finalizer_recover_check_timeout(
    'illustration-missing-0001',
    repeat('a',64),
    'chatgpt-library:file_missing',
    'site-missing-staging'
  );
  raise exception 'authenticated unexpectedly executed finalizer recovery';
exception
  when insufficient_privilege then null;
end
$$;
reset role;

set role service_role;
do $$
begin
  perform public.archive_illustration_finalizer_recover_check_timeout(
    'illustration-missing-0001',
    repeat('a',64),
    'chatgpt-library:file_missing',
    'site-missing-staging'
  );
  raise exception 'expected missing-job validation';
exception
  when sqlstate '22023' then
    if sqlerrm <> 'ILLUSTRATION_RENDER_JOB_NOT_FOUND' then
      raise;
    end if;
end
$$;
reset role;
