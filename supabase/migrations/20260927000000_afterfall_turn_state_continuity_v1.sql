-- Add a write-time guard for contiguous linked turns without rewriting the
-- already-applied v1 migration or changing any existing transcript rows.
create function survival_rpg.enforce_afterfall_turn_state_continuity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_previous_gm_save_version integer;
  v_next_user_save_version integer;
begin
  select l.gm_save_version into v_previous_gm_save_version
  from survival_rpg.transcript_turn_state_links as l
  where l.worldline_id = new.worldline_id
    and l.chronicle_id = new.chronicle_id
    and l.season_id = new.season_id
    and l.session_id = new.session_id
    and l.turn_no = new.turn_no - 1;

  if found and new.user_save_version is distinct from v_previous_gm_save_version then
    raise exception 'turn save version is discontinuous with previous linked turn'
      using errcode = '22023';
  end if;

  -- Also check an already-inserted successor so out-of-order link inserts
  -- cannot evade the same continuity rule.
  select l.user_save_version into v_next_user_save_version
  from survival_rpg.transcript_turn_state_links as l
  where l.worldline_id = new.worldline_id
    and l.chronicle_id = new.chronicle_id
    and l.season_id = new.season_id
    and l.session_id = new.session_id
    and l.turn_no = new.turn_no + 1;

  if found and v_next_user_save_version is distinct from new.gm_save_version then
    raise exception 'next turn save version is discontinuous with inserted link'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function survival_rpg.enforce_afterfall_turn_state_continuity() from public;
revoke all on function survival_rpg.enforce_afterfall_turn_state_continuity() from anon, authenticated, service_role;

create trigger enforce_afterfall_turn_state_continuity_before_insert
before insert on survival_rpg.transcript_turn_state_links
for each row
execute function survival_rpg.enforce_afterfall_turn_state_continuity();

comment on function survival_rpg.enforce_afterfall_turn_state_continuity() is
  'Rejects backward or unexplained forward save-version gaps between adjacent linked AFTERFALL turns; does not alter existing rows.';

