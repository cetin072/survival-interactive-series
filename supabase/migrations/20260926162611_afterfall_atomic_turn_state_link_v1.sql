-- AFTERFALL-only additive state linkage for atomic live transcript turns.
-- The save remains authoritative and is not modified by this capture API.
-- A link is written in the same transaction as its USER/GM pair and must point
-- at the locked current save head. This does not prove that the writer's
-- semantic outcome is true; it records the trusted writer's assertion and the
-- database-observed current save head. Legacy unlinked RAW remains untouched.

create table survival_rpg.transcript_turn_state_links (
  worldline_id text not null check (worldline_id = 'AFTERFALL'),
  chronicle_id text not null check (chronicle_id = 'C03'),
  season_id text not null check (season_id ~ '^S[0-9]{2,3}$'),
  session_id uuid not null,
  turn_no integer not null check (turn_no >= 0),
  user_message_id uuid not null references survival_rpg.transcript_messages(id),
  gm_message_id uuid not null references survival_rpg.transcript_messages(id),
  outcome text not null check (outcome in ('APPLIED', 'NO_STATE_CHANGE')),
  user_save_version integer not null check (user_save_version > 0),
  gm_save_version integer not null check (gm_save_version > 0),
  linked_save_version integer not null check (linked_save_version > 0),
  recorded_at timestamptz not null default now(),
  primary key (worldline_id, chronicle_id, season_id, session_id, turn_no),
  unique (user_message_id),
  unique (gm_message_id),
  check (
    (outcome = 'NO_STATE_CHANGE' and user_save_version = gm_save_version)
    or (outcome = 'APPLIED' and gm_save_version > user_save_version)
  ),
  check (linked_save_version = gm_save_version)
);

comment on table survival_rpg.transcript_turn_state_links is
  'AFTERFALL state-version/outcome link for a captured USER/GM pair; this ledger grants no publication visibility.';

alter table survival_rpg.transcript_turn_state_links enable row level security;
alter table survival_rpg.transcript_turn_state_links force row level security;
revoke all on table survival_rpg.transcript_turn_state_links from public;
revoke all on table survival_rpg.transcript_turn_state_links from anon, authenticated;
grant select, insert on table survival_rpg.transcript_turn_state_links to service_role;

create function survival_rpg.append_public_transcript_turn_with_state_link(
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
  select s.save_version into v_current_save_version
  from survival_rpg.saves as s
  where s.worldline_id = p_worldline_id
  for update;

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
    and l.turn_no = p_turn_no
  for update;

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

comment on function survival_rpg.append_public_transcript_turn_with_state_link(
  uuid, text, text, text, integer, integer, text, text, uuid,
  text, text, uuid, text, text, integer, text, text, integer, text, text
) is 'Atomically appends an AFTERFALL USER/GM pair plus a state-version link after locking the current save head. Does not mutate save state, prove semantic correctness, or grant publication approval.';

revoke all on function survival_rpg.append_public_transcript_turn_with_state_link(
  uuid, text, text, text, integer, integer, text, text, uuid,
  text, text, uuid, text, text, integer, text, text, integer, text, text
) from public;
revoke all on function survival_rpg.append_public_transcript_turn_with_state_link(
  uuid, text, text, text, integer, integer, text, text, uuid,
  text, text, uuid, text, text, integer, text, text, integer, text, text
) from anon, authenticated;
grant execute on function survival_rpg.append_public_transcript_turn_with_state_link(
  uuid, text, text, text, integer, integer, text, text, uuid,
  text, text, uuid, text, text, integer, text, text, integer, text, text
) to service_role;
