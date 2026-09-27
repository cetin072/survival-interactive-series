-- Harden the already-installed AFTERFALL turn-link trigger in a new migration.
-- The installed 20260927042720 migration remains immutable.
-- This verifies that each link points to the matching stored USER/GM rows and
-- current save head, including when a privileged writer inserts a link directly.
-- The invoker capture role has no direct save-table UPDATE permission, which
-- PostgreSQL requires for SELECT FOR UPDATE. Keep that lock in this narrow,
-- namespace-checked SECURITY DEFINER helper instead of broadening table grants.
create or replace function survival_rpg.lock_afterfall_authoritative_save_head(
  p_worldline_id text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_save_version integer;
begin
  if p_worldline_id is distinct from 'AFTERFALL' then
    raise exception 'save-head lock is restricted to AFTERFALL'
      using errcode = '22023';
  end if;

  select s.save_version into v_save_version
  from survival_rpg.saves as s
  where s.worldline_id = p_worldline_id
  for update;

  if not found then
    raise exception 'AFTERFALL authoritative save is missing' using errcode = '23503';
  end if;
  return v_save_version;
end;
$$;

revoke all on function survival_rpg.lock_afterfall_authoritative_save_head(text)
  from public, anon, authenticated;
grant execute on function survival_rpg.lock_afterfall_authoritative_save_head(text)
  to service_role;
comment on function survival_rpg.lock_afterfall_authoritative_save_head(text) is
  'Locks and returns the AFTERFALL save version for the trusted capture RPC/trigger without granting save-table UPDATE to its invoker.';

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
  v_current_save_version :=
    survival_rpg.lock_afterfall_authoritative_save_head(new.worldline_id);
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
  where m.id = new.user_message_id;
  if not found then
    raise exception 'linked USER message is missing' using errcode = '23503';
  end if;

  select m.worldline_id, m.chronicle_id, m.season_id, m.session_id,
    m.turn_no, m.role, m.save_version, m.message_order
    into v_gm_worldline_id, v_gm_chronicle_id, v_gm_season_id,
      v_gm_session_id, v_gm_turn_no, v_gm_role, v_gm_save_version,
      v_gm_message_order
  from survival_rpg.transcript_messages as m
  where m.id = new.gm_message_id;
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
    and l.turn_no = new.turn_no - 1;

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
    and l.turn_no = new.turn_no + 1;

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


-- Replace the original invoker RPC with the same validated transaction,
-- using the narrow lock helper instead of requesting table UPDATE.
create or replace function survival_rpg.append_public_transcript_turn_with_state_link(
  p_session_id uuid,
  p_worldline_id text,
  p_chronicle_id text,
  p_season_id text,
  p_turn_no integer,
  p_user_message_order integer,
  p_user_content text,
  p_user_content_sha256 text,
  p_user_idempotency_key uuid,
  p_gm_content text,
  p_gm_content_sha256 text,
  p_gm_idempotency_key uuid,
  p_user_game_time text,
  p_user_scene_id text,
  p_user_save_version integer,
  p_gm_game_time text,
  p_gm_scene_id text,
  p_gm_save_version integer,
  p_source_type text,
  p_outcome text
)
returns table (
  user_message_id uuid,
  gm_message_id uuid,
  user_message_order integer,
  gm_message_order integer,
  outcome text,
  user_save_version integer,
  gm_save_version integer
)
language plpgsql
security invoker
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_current_save_version integer;
  v_link survival_rpg.transcript_turn_state_links%rowtype;
  v_user survival_rpg.transcript_messages%rowtype;
  v_gm survival_rpg.transcript_messages%rowtype;
begin
  if p_worldline_id is distinct from 'AFTERFALL'
     or p_chronicle_id is distinct from 'C03'
     or p_season_id is null or p_season_id !~ '^S[0-9]{2,3}$'
     or p_session_id is null
     or p_turn_no is null or p_turn_no < 0
     or p_user_save_version is null or p_user_save_version <= 0
     or p_gm_save_version is null or p_gm_save_version <= 0
     or p_outcome not in ('APPLIED', 'NO_STATE_CHANGE') then
    raise exception 'invalid AFTERFALL state-link payload' using errcode = '22023';
  end if;

  if (p_outcome = 'NO_STATE_CHANGE' and p_user_save_version <> p_gm_save_version)
     or (p_outcome = 'APPLIED' and p_gm_save_version <= p_user_save_version) then
    raise exception 'turn outcome conflicts with linked save versions' using errcode = '22023';
  end if;

  -- Serialize against current save changes and competing turn-link attempts.
  v_current_save_version :=
    survival_rpg.lock_afterfall_authoritative_save_head(p_worldline_id);

  if not found then
    raise exception 'AFTERFALL authoritative save is missing' using errcode = '23503';
  end if;

  -- Replays are checked against the immutable link before comparing the live
  -- head: a later turn must not make an acknowledged retry fail.
  select l.* into v_link
  from survival_rpg.transcript_turn_state_links as l
  where l.worldline_id = p_worldline_id
    and l.chronicle_id = p_chronicle_id
    and l.season_id = p_season_id
    and l.session_id = p_session_id
    and l.turn_no = p_turn_no;

  if found then
  if v_link.user_save_version is distinct from p_user_save_version
       or v_link.gm_save_version is distinct from p_gm_save_version
       or v_link.outcome is distinct from p_outcome then
      raise exception 'turn state-link retry differs from original payload' using errcode = '23505';
    end if;

    v_user := survival_rpg.append_public_transcript_message(
      p_session_id, p_worldline_id, p_chronicle_id, p_season_id, p_turn_no,
      p_user_message_order, 'USER', p_user_content, p_user_content_sha256,
      p_user_idempotency_key, p_user_game_time, p_user_scene_id,
      p_user_save_version, p_source_type
    );
    v_gm := survival_rpg.append_public_transcript_message(
      p_session_id, p_worldline_id, p_chronicle_id, p_season_id, p_turn_no,
      p_user_message_order + 1, 'GM', p_gm_content, p_gm_content_sha256,
      p_gm_idempotency_key, p_gm_game_time, p_gm_scene_id,
      p_gm_save_version, p_source_type
    );

    if v_user.id is distinct from v_link.user_message_id
       or v_gm.id is distinct from v_link.gm_message_id then
      raise exception 'turn state-link message identities do not match retry' using errcode = '23505';
    end if;
  else
    if v_current_save_version is distinct from p_gm_save_version then
      raise exception 'authoritative save head changed before transcript capture' using errcode = '40001';
    end if;

    v_user := survival_rpg.append_public_transcript_message(
      p_session_id, p_worldline_id, p_chronicle_id, p_season_id, p_turn_no,
      p_user_message_order, 'USER', p_user_content, p_user_content_sha256,
      p_user_idempotency_key, p_user_game_time, p_user_scene_id,
      p_user_save_version, p_source_type
    );
    v_gm := survival_rpg.append_public_transcript_message(
      p_session_id, p_worldline_id, p_chronicle_id, p_season_id, p_turn_no,
      p_user_message_order + 1, 'GM', p_gm_content, p_gm_content_sha256,
      p_gm_idempotency_key, p_gm_game_time, p_gm_scene_id,
      p_gm_save_version, p_source_type
    );

    insert into survival_rpg.transcript_turn_state_links (
      worldline_id, chronicle_id, season_id, session_id, turn_no,
      user_message_id, gm_message_id, outcome,
      user_save_version, gm_save_version, linked_save_version
    ) values (
      p_worldline_id, p_chronicle_id, p_season_id, p_session_id, p_turn_no,
      v_user.id, v_gm.id, p_outcome,
      p_user_save_version, p_gm_save_version, v_current_save_version
    ) returning * into v_link;
  end if;

  return query select
    v_user.id, v_gm.id, v_user.message_order, v_gm.message_order,
    v_link.outcome, v_link.user_save_version, v_link.gm_save_version;
end;
$$;
