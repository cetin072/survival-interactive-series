-- Read-only catalog check for the additive turn-version continuity trigger.
-- This test performs no inserts or changes to transcript or game state.
do $$
declare
  v_function oid;
  v_trigger_type smallint;
  v_definition text;
begin
  v_function := to_regprocedure('survival_rpg.enforce_afterfall_turn_state_continuity()');
  if v_function is null then
    raise exception 'AFTERFALL continuity trigger function is missing';
  end if;

  if (select p.prosecdef from pg_proc as p where p.oid = v_function) then
    raise exception 'continuity trigger must remain SECURITY INVOKER';
  end if;
  if not (
    select coalesce(p.proconfig, array[]::text[]) @> array['search_path=pg_catalog, survival_rpg']
    from pg_proc as p where p.oid = v_function
  ) then
    raise exception 'continuity trigger search_path is not pinned';
  end if;
  if has_function_privilege('anon', v_function, 'EXECUTE')
     or has_function_privilege('authenticated', v_function, 'EXECUTE')
     or has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'continuity trigger function is directly executable';
  end if;

  select t.tgtype, pg_get_functiondef(t.tgfoid)
    into v_trigger_type, v_definition
  from pg_trigger as t
  join pg_class as c on c.oid = t.tgrelid
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'survival_rpg'
    and c.relname = 'transcript_turn_state_links'
    and t.tgname = 'enforce_afterfall_turn_state_continuity_before_insert'
    and not t.tgisinternal;

  if not found then
    raise exception 'continuity trigger is missing';
  end if;
  if (v_trigger_type & 1) = 0 or (v_trigger_type & 2) = 0 or (v_trigger_type & 4) = 0 then
    raise exception 'continuity trigger must be BEFORE INSERT FOR EACH ROW';
  end if;
  if position('new.turn_no - 1' in lower(v_definition)) = 0
     or position('new.turn_no + 1' in lower(v_definition)) = 0
     or position('new.user_save_version' in lower(v_definition)) = 0
     or position('new.gm_save_version' in lower(v_definition)) = 0
     or position('v_user.turn_no is distinct from new.turn_no' in lower(v_definition)) = 0
     or position('v_gm.turn_no is distinct from new.turn_no' in lower(v_definition)) = 0
     or position('v_gm.message_order is distinct from v_user.message_order + 1' in lower(v_definition)) = 0
     or position('v_user.message_order is distinct from v_previous_gm_message_order + 1' in lower(v_definition)) = 0
     or position('v_next_user_message_order is distinct from v_gm.message_order + 1' in lower(v_definition)) = 0 then
    raise exception 'continuity trigger does not validate message pairs and adjacent turn links';
  end if;
end;
$$;

