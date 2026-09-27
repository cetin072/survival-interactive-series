-- Remove only the extra membership created by the successful corrective
-- migration. Preserve Supabase's original ADMIN-only, non-inheriting grant.
do $$
begin
  if (select count(*) from pg_catalog.pg_auth_members m
      where m.roleid = 'archive_runner_internal'::regrole
        and m.member = 'postgres'::regrole
        and m.grantor = 'postgres'::regrole
        and not m.admin_option and not m.inherit_option and not m.set_option) <> 1
     or (select count(*) from pg_catalog.pg_auth_members m
      where m.roleid = 'archive_runner_internal'::regrole
        and m.member = 'postgres'::regrole
        and m.grantor = 'supabase_admin'::regrole
        and m.admin_option and not m.inherit_option and not m.set_option) <> 1 then
    raise exception 'ARCHIVE_OWNER_GRANT_STATE_UNEXPECTED';
  end if;
end;
$$;

revoke archive_runner_internal from postgres granted by postgres;

do $$
begin
  if (select count(*) from pg_catalog.pg_auth_members m
      where m.roleid = 'archive_runner_internal'::regrole
        and m.member = 'postgres'::regrole) <> 1
     or exists (select 1 from pg_catalog.pg_auth_members m
      where m.roleid = 'archive_runner_internal'::regrole
        and m.member = 'postgres'::regrole
        and (m.grantor <> 'supabase_admin'::regrole
             or not m.admin_option or m.inherit_option or m.set_option)) then
    raise exception 'ARCHIVE_OWNER_GRANT_CLEANUP_FAILED';
  end if;
end;
$$;
