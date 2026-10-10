-- Focused verification for Automation B survival_ops hardening.

do $$
declare
  t text;
begin
  foreach t in array array[
    'illustration_review_staging_chunks',
    'illustration_worker_runs',
    'illustration_binary_staging_chunks',
    'illustration_vault_items',
    'illustration_render_jobs',
    'knowledge_ex001_review_revalidations',
    'illustration_review_staging',
    'illustration_binary_staging'
  ]
  loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='survival_ops'
        and c.relname=t
        and c.relrowsecurity
    ) then
      raise exception 'RLS_NOT_ENABLED:%', t;
    end if;

    if has_table_privilege('anon',format('survival_ops.%I',t),'SELECT,INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated',format('survival_ops.%I',t),'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'CLIENT_TABLE_PRIVILEGE_PRESENT:%', t;
    end if;
  end loop;

  if has_schema_privilege('anon','survival_ops','USAGE')
     or has_schema_privilege('authenticated','survival_ops','USAGE') then
    raise exception 'CLIENT_SURVIVAL_OPS_SCHEMA_USAGE_PRESENT';
  end if;

  if has_function_privilege('anon','public.archive_illustration_review_decide_v3(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.archive_illustration_review_decide_v3(jsonb)','EXECUTE') then
    raise exception 'REVIEW_DECIDE_CLIENT_EXECUTE_PRESENT';
  end if;

  if has_function_privilege('anon','public.archive_illustration_site_staging_begin(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.archive_illustration_site_staging_begin(jsonb)','EXECUTE') then
    raise exception 'SITE_BEGIN_CLIENT_EXECUTE_PRESENT';
  end if;

  if has_function_privilege('anon','public.archive_illustration_site_staging_finalize(text,uuid,text)','EXECUTE')
     or has_function_privilege('authenticated','public.archive_illustration_site_staging_finalize(text,uuid,text)','EXECUTE') then
    raise exception 'SITE_FINALIZE_CLIENT_EXECUTE_PRESENT';
  end if;

  if not has_function_privilege('service_role','public.archive_illustration_review_decide_v3(jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.archive_illustration_site_staging_begin(jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.archive_illustration_site_staging_finalize(text,uuid,text)','EXECUTE') then
    raise exception 'SERVICE_ROLE_EXECUTE_MISSING';
  end if;

  if has_function_privilege('service_role','archive_ops.dispatch_afterfall_illustration_vault(text)','EXECUTE')
     or has_function_privilege('service_role','archive_ops.dispatch_afterfall_illustration_vault_pending()','EXECUTE') then
    raise exception 'SERVICE_ROLE_ARCHIVE_OPS_DISPATCH_PRESENT';
  end if;

  if not has_function_privilege('postgres','archive_ops.dispatch_afterfall_illustration_vault(text)','EXECUTE')
     or not has_function_privilege('postgres','archive_ops.dispatch_afterfall_illustration_vault_pending()','EXECUTE') then
    raise exception 'POSTGRES_ARCHIVE_OPS_DISPATCH_MISSING';
  end if;

  if not (select rolbypassrls from pg_roles where rolname='service_role') then
    raise exception 'SERVICE_ROLE_NOT_BYPASSRLS';
  end if;
end
$$;

set role service_role;
select count(*) from survival_ops.illustration_render_jobs;
select count(*) from survival_ops.illustration_review_staging;
select count(*) from survival_ops.illustration_review_staging_chunks;
select count(*) from survival_ops.illustration_worker_runs;
select count(*) from survival_ops.illustration_binary_staging;
select count(*) from survival_ops.illustration_binary_staging_chunks;
select count(*) from survival_ops.illustration_vault_items;
reset role;
