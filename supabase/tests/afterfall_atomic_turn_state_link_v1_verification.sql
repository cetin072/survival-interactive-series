-- Read-only catalog/ACL smoke test for the installed AFTERFALL state-link API.
-- This intentionally writes no transcript, save, event, or test fixture.
do $$
declare
  v_function oid;
  v_rls_enabled boolean;
  v_rls_forced boolean;
begin
  v_function := to_regprocedure(
    'survival_rpg.append_public_transcript_turn_with_state_link(uuid,text,text,text,integer,integer,text,text,uuid,text,text,uuid,text,text,integer,text,text,integer,text,text)'
  );
  if v_function is null then
    raise exception 'AFTERFALL state-link API is missing';
  end if;

  if (select p.prosecdef from pg_proc as p where p.oid = v_function) then
    raise exception 'state-link API must remain SECURITY INVOKER';
  end if;
  if not (
    select coalesce(p.proconfig, array[]::text[]) @> array['search_path=pg_catalog, survival_rpg']
    from pg_proc as p where p.oid = v_function
  ) then
    raise exception 'state-link API search_path is not pinned';
  end if;
  if not has_function_privilege('service_role', v_function, 'EXECUTE')
     or has_function_privilege('anon', v_function, 'EXECUTE')
     or has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'state-link API EXECUTE grants are not restricted';
  end if;

  select c.relrowsecurity, c.relforcerowsecurity
    into v_rls_enabled, v_rls_forced
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'survival_rpg'
    and c.relname = 'transcript_turn_state_links';

  if not found or not v_rls_enabled or not v_rls_forced then
    raise exception 'state-link table RLS is not enabled and forced';
  end if;
  if has_table_privilege('anon', 'survival_rpg.transcript_turn_state_links', 'SELECT')
     or has_table_privilege('authenticated', 'survival_rpg.transcript_turn_state_links', 'SELECT')
     or has_table_privilege('anon', 'survival_rpg.transcript_turn_state_links', 'INSERT')
     or has_table_privilege('authenticated', 'survival_rpg.transcript_turn_state_links', 'INSERT')
     or has_table_privilege('service_role', 'survival_rpg.transcript_turn_state_links', 'UPDATE')
     or has_table_privilege('service_role', 'survival_rpg.transcript_turn_state_links', 'DELETE') then
    raise exception 'state-link table grants exceed the writer/read boundary';
  end if;
end;
$$;
