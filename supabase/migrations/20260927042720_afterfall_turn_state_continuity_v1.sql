-- Add a write-time guard for contiguous linked turns without rewriting the
-- already-applied v1 migration or changing any existing transcript rows.
create function survival_rpg.enforce_afterfall_turn_state_continuity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_user survival_rpg.transcript_messages%rowtype;
  v_gm survival_rpg.transcript_messages%rowtype;
  v_previous_gm_save_version integer;
  v_previous_gm_message_order integer;
  v_next_user_save_version integer;
  v_next_user_message_order integer;
begin
  select m.* into v_user
  from survival_rpg.transcript_messages as m
  where m.id = new.user_message_id;
  if not found then
    raise exception 'linked USER message is missing' using errcode = '23503';
  end if;

  select m.* into v_gm
  from survival_rpg.transcript_messages as m
  where m.id = new.gm_message_id;
  if not found then
    raise exception 'linked GM message is missing' using errcode = '23503';
  end if;

  if v_user.worldline_id is distinct from new.worldline_id
     or v_user.chronicle_id is distinct from new.chronicle_id
     or v_user.season_id is distinct from new.season_id
     or v_user.session_id is distinct from new.session_id
     or v_user.turn_no is distinct from new.turn_no
     or v_user.role is distinct from 'USER'
     or v_user.save_version is distinct from new.user_save_version
     or v_gm.worldline_id is distinct from new.worldline_id
     or v_gm.chronicle_id is distinct from new.chronicle_id
     or v_gm.season_id is distinct from new.season_id
     or v_gm.session_id is distinct from new.session_id
     or v_gm.turn_no is distinct from new.turn_no
     or v_gm.role is distinct from 'GM'
     or v_gm.save_version is distinct from new.gm_save_version
     or v_gm.message_order is distinct from v_user.message_order + 1 then
    raise exception 'turn state link does not match its ordered USER/GM messages'
      using errcode = '22023';
  end if;

  select l.gm_save_version, m.message_order
    into v_previous_gm_save_version, v_previous_gm_message_order
  from survival_rpg.transcript_turn_state_links as l
  join survival_rpg.transcript_messages as m on m.id = l.gm_message_id
  where l.worldline_id = new.worldline_id
    and l.chronicle_id = new.chronicle_id
    and l.season_id = new.season_id
    and l.session_id = new.session_id
    and l.turn_no = new.turn_no - 1;

  if found and (
    new.user_save_version is distinct from v_previous_gm_save_version
    or v_user.message_order is distinct from v_previous_gm_message_order + 1
  ) then
    raise exception 'turn state link is discontinuous with previous linked turn'
      using errcode = '22023';
  end if;

  -- Also check an already-inserted successor so out-of-order link inserts
  -- cannot evade the same continuity rule.
  select l.user_save_version, m.message_order
    into v_next_user_save_version, v_next_user_message_order
  from survival_rpg.transcript_turn_state_links as l
  join survival_rpg.transcript_messages as m on m.id = l.user_message_id
  where l.worldline_id = new.worldline_id
    and l.chronicle_id = new.chronicle_id
    and l.season_id = new.season_id
    and l.session_id = new.session_id
    and l.turn_no = new.turn_no + 1;

  if found and (
    v_next_user_save_version is distinct from new.gm_save_version
    or v_next_user_message_order is distinct from v_gm.message_order + 1
  ) then
    raise exception 'next turn state link is discontinuous with inserted link'
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
  'Validates linked USER/GM identity, order, and save versions, plus adjacent AFTERFALL turn continuity; does not alter existing rows.';

