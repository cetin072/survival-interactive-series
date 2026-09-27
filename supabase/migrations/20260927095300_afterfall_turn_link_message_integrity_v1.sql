-- Harden the already-installed AFTERFALL turn-link trigger in a new migration.
-- The installed 20260927042720 migration remains immutable.
-- This verifies that each link points to the matching stored USER/GM rows and
-- current save head, including when a privileged writer inserts a link directly.
create or replace function survival_rpg.enforce_afterfall_turn_state_continuity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_current_save_version integer;
  v_user_worldline_id text;
  v_user_chronicle_id text;
  v_user_season_id text;
  v_user_session_id uuid;
  v_user_turn_no integer;
  v_user_role text;
  v_user_save_version integer;
  v_user_message_order integer;
  v_gm_worldline_id text;
  v_gm_chronicle_id text;
  v_gm_season_id text;
  v_gm_session_id uuid;
  v_gm_turn_no integer;
  v_gm_role text;
  v_gm_save_version integer;
  v_gm_message_order integer;
  v_previous_gm_save_version integer;
  v_previous_gm_message_order integer;
  v_next_user_save_version integer;
  v_next_user_message_order integer;
begin
  if new.worldline_id is distinct from 'AFTERFALL'
     or new.chronicle_id is distinct from 'C03' then
    raise exception 'turn state link is outside the AFTERFALL/C03 namespace'
      using errcode = '22023';
  end if;

  -- Serialize all AFTERFALL state links through the authoritative save row.
  -- The normal RPC already holds this lock; retaining it here also prevents a
  -- direct privileged INSERT from racing adjacent-link checks or claiming an
  -- obsolete save head.
  select s.save_version into v_current_save_version
  from survival_rpg.saves as s
  where s.worldline_id = new.worldline_id
  for update;

  if not found then
    raise exception 'AFTERFALL authoritative save is missing' using errcode = '23503';
  end if;
  if new.linked_save_version is distinct from v_current_save_version then
    raise exception 'turn state link does not match the current AFTERFALL save head'
      using errcode = '22023';
  end if;

  select m.worldline_id, m.chronicle_id, m.season_id, m.session_id,
    m.turn_no, m.role, m.save_version, m.message_order
    into v_user_worldline_id, v_user_chronicle_id, v_user_season_id,
      v_user_session_id, v_user_turn_no, v_user_role, v_user_save_version,
      v_user_message_order
  from survival_rpg.transcript_messages as m
  where m.id = new.user_message_id
  for share;
  if not found then
    raise exception 'linked USER message is missing' using errcode = '23503';
  end if;

  select m.worldline_id, m.chronicle_id, m.season_id, m.session_id,
    m.turn_no, m.role, m.save_version, m.message_order
    into v_gm_worldline_id, v_gm_chronicle_id, v_gm_season_id,
      v_gm_session_id, v_gm_turn_no, v_gm_role, v_gm_save_version,
      v_gm_message_order
  from survival_rpg.transcript_messages as m
  where m.id = new.gm_message_id
  for share;
  if not found then
    raise exception 'linked GM message is missing' using errcode = '23503';
  end if;

  if v_user_worldline_id is distinct from new.worldline_id
     or v_user_chronicle_id is distinct from new.chronicle_id
     or v_user_season_id is distinct from new.season_id
     or v_user_session_id is distinct from new.session_id
     or v_user_turn_no is distinct from new.turn_no
     or v_user_role is distinct from 'USER'
     or v_user_save_version is distinct from new.user_save_version
     or v_gm_worldline_id is distinct from new.worldline_id
     or v_gm_chronicle_id is distinct from new.chronicle_id
     or v_gm_season_id is distinct from new.season_id
     or v_gm_session_id is distinct from new.session_id
     or v_gm_turn_no is distinct from new.turn_no
     or v_gm_role is distinct from 'GM'
     or v_gm_save_version is distinct from new.gm_save_version
     or v_gm_message_order is distinct from v_user_message_order + 1 then
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
    and l.turn_no = new.turn_no - 1
  for share of l, m;

  if found and (
    new.user_save_version is distinct from v_previous_gm_save_version
    or v_user_message_order is distinct from v_previous_gm_message_order + 1
  ) then
    raise exception 'turn state link is discontinuous with previous linked turn'
      using errcode = '22023';
  end if;

  -- Also check an already-inserted successor so out-of-order link inserts
  -- cannot evade the same save-version and message-order rules.
  select l.user_save_version, m.message_order
    into v_next_user_save_version, v_next_user_message_order
  from survival_rpg.transcript_turn_state_links as l
  join survival_rpg.transcript_messages as m on m.id = l.user_message_id
  where l.worldline_id = new.worldline_id
    and l.chronicle_id = new.chronicle_id
    and l.season_id = new.season_id
    and l.session_id = new.session_id
    and l.turn_no = new.turn_no + 1
  for share of l, m;

  if found and (
    v_next_user_save_version is distinct from new.gm_save_version
    or v_next_user_message_order is distinct from v_gm_message_order + 1
  ) then
    raise exception 'next turn state link is discontinuous with inserted link'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function survival_rpg.enforce_afterfall_turn_state_continuity() from public;
revoke all on function survival_rpg.enforce_afterfall_turn_state_continuity()
  from anon, authenticated, service_role;

comment on function survival_rpg.enforce_afterfall_turn_state_continuity() is
  'Validates current AFTERFALL save head, linked USER/GM row identity and order, and adjacent linked-turn continuity; does not alter existing rows.';
