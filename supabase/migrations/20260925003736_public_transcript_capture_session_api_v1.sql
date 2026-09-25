-- Applied to the connected Supabase project as migration 20260925003736.
-- Purpose: session-aware, ordered, idempotent writes for player-safe raw capture.

create table survival_rpg.transcript_sessions (
  id uuid primary key,
  worldline_id text not null check (btrim(worldline_id) <> ''),
  chronicle_id text not null check (btrim(chronicle_id) <> ''),
  season_id text not null check (btrim(season_id) <> ''),
  starting_save_version integer check (starting_save_version is null or starting_save_version > 0),
  starting_game_time text,
  starting_scene_id text,
  last_message_order integer not null default -1 check (last_message_order >= -1),
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closing_save_version integer check (closing_save_version is null or closing_save_version > 0),
  closing_game_time text,
  closing_scene_id text,
  close_note text,
  check (
    (status = 'OPEN' and closed_at is null)
    or (status = 'CLOSED' and closed_at is not null)
  )
);

comment on table survival_rpg.transcript_sessions is
  'Lifecycle and ordering metadata for append-only, public-safe transcript_messages.';

alter table survival_rpg.transcript_sessions enable row level security;
alter table survival_rpg.transcript_sessions force row level security;

revoke all on table survival_rpg.transcript_sessions from public;
revoke all on table survival_rpg.transcript_sessions from anon, authenticated;
grant usage on schema survival_rpg to service_role;
grant select, insert, update on table survival_rpg.transcript_sessions to service_role;

create function survival_rpg.open_public_transcript_session(
  p_session_id uuid,
  p_worldline_id text,
  p_chronicle_id text,
  p_season_id text,
  p_starting_save_version integer default null,
  p_starting_game_time text default null,
  p_starting_scene_id text default null
)
returns survival_rpg.transcript_sessions
language plpgsql
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_session survival_rpg.transcript_sessions%rowtype;
begin
  if p_session_id is null
     or coalesce(btrim(p_worldline_id), '') = ''
     or coalesce(btrim(p_chronicle_id), '') = ''
     or coalesce(btrim(p_season_id), '') = '' then
    raise exception 'session identity is required' using errcode = '22023';
  end if;

  insert into survival_rpg.transcript_sessions (
    id, worldline_id, chronicle_id, season_id,
    starting_save_version, starting_game_time, starting_scene_id
  ) values (
    p_session_id, p_worldline_id, p_chronicle_id, p_season_id,
    p_starting_save_version, p_starting_game_time, p_starting_scene_id
  ) on conflict (id) do nothing;

  select * into v_session
  from survival_rpg.transcript_sessions
  where id = p_session_id;

  if not found then
    raise exception 'could not read transcript session %', p_session_id using errcode = 'P0001';
  end if;

  if v_session.worldline_id is distinct from p_worldline_id
     or v_session.chronicle_id is distinct from p_chronicle_id
     or v_session.season_id is distinct from p_season_id
     or v_session.starting_save_version is distinct from p_starting_save_version
     or v_session.starting_game_time is distinct from p_starting_game_time
     or v_session.starting_scene_id is distinct from p_starting_scene_id then
    raise exception 'transcript session % identity does not match its original open payload', p_session_id
      using errcode = '23505';
  end if;

  if v_session.status <> 'OPEN' then
    raise exception 'transcript session % is already closed', p_session_id using errcode = '55000';
  end if;

  return v_session;
end;
$$;

create function survival_rpg.append_public_transcript_message(
  p_session_id uuid,
  p_worldline_id text,
  p_chronicle_id text,
  p_season_id text,
  p_turn_no integer,
  p_message_order integer,
  p_role text,
  p_content text,
  p_content_sha256 text,
  p_idempotency_key uuid,
  p_game_time text default null,
  p_scene_id text default null,
  p_save_version integer default null,
  p_source_type text default 'LIVE'
)
returns survival_rpg.transcript_messages
language plpgsql
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_session survival_rpg.transcript_sessions%rowtype;
  v_existing survival_rpg.transcript_messages%rowtype;
  v_message survival_rpg.transcript_messages%rowtype;
begin
  if p_session_id is null or p_idempotency_key is null
     or coalesce(btrim(p_worldline_id), '') = ''
     or coalesce(btrim(p_chronicle_id), '') = ''
     or coalesce(btrim(p_season_id), '') = ''
     or p_turn_no is null or p_turn_no < 0
     or p_message_order is null or p_message_order < 0
     or p_role not in ('USER', 'GM', 'ASSISTANT_PUBLIC_META')
     or coalesce(btrim(p_content), '') = ''
     or p_source_type not in ('LIVE', 'RECOVERY')
     or p_content_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid public transcript message payload' using errcode = '22023';
  end if;

  if p_content_sha256 <> encode(extensions.digest(convert_to(p_content, 'UTF8'), 'sha256'), 'hex') then
    raise exception 'content_sha256 does not match exact UTF-8 content' using errcode = '22000';
  end if;

  select * into v_existing
  from survival_rpg.transcript_messages
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.session_id is distinct from p_session_id
       or v_existing.worldline_id is distinct from p_worldline_id
       or v_existing.chronicle_id is distinct from p_chronicle_id
       or v_existing.season_id is distinct from p_season_id
       or v_existing.turn_no is distinct from p_turn_no
       or v_existing.message_order is distinct from p_message_order
       or v_existing.role is distinct from p_role
       or v_existing.content is distinct from p_content
       or v_existing.content_sha256 is distinct from p_content_sha256
       or v_existing.game_time is distinct from p_game_time
       or v_existing.scene_id is distinct from p_scene_id
       or v_existing.save_version is distinct from p_save_version
       or v_existing.source_type is distinct from p_source_type then
      raise exception 'idempotency key % was already used with a different payload', p_idempotency_key
        using errcode = '23505';
    end if;
    return v_existing;
  end if;

  select * into v_session
  from survival_rpg.transcript_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'transcript session % has not been opened', p_session_id using errcode = '23503';
  end if;

  if v_session.status <> 'OPEN' then
    raise exception 'transcript session % is closed', p_session_id using errcode = '55000';
  end if;

  if v_session.worldline_id is distinct from p_worldline_id
     or v_session.chronicle_id is distinct from p_chronicle_id
     or v_session.season_id is distinct from p_season_id then
    raise exception 'message identity does not match transcript session %', p_session_id using errcode = '23505';
  end if;

  select * into v_existing
  from survival_rpg.transcript_messages
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.session_id is distinct from p_session_id
       or v_existing.worldline_id is distinct from p_worldline_id
       or v_existing.chronicle_id is distinct from p_chronicle_id
       or v_existing.season_id is distinct from p_season_id
       or v_existing.turn_no is distinct from p_turn_no
       or v_existing.message_order is distinct from p_message_order
       or v_existing.role is distinct from p_role
       or v_existing.content is distinct from p_content
       or v_existing.content_sha256 is distinct from p_content_sha256
       or v_existing.game_time is distinct from p_game_time
       or v_existing.scene_id is distinct from p_scene_id
       or v_existing.save_version is distinct from p_save_version
       or v_existing.source_type is distinct from p_source_type then
      raise exception 'idempotency key % was already used with a different payload', p_idempotency_key
        using errcode = '23505';
    end if;
    return v_existing;
  end if;

  if p_message_order <> v_session.last_message_order + 1 then
    raise exception 'message_order % must follow % for transcript session %',
      p_message_order, v_session.last_message_order, p_session_id using errcode = '22023';
  end if;

  insert into survival_rpg.transcript_messages (
    worldline_id, chronicle_id, season_id, session_id, turn_no, message_order,
    role, content, content_sha256, game_time, scene_id, save_version,
    source_type, idempotency_key
  ) values (
    p_worldline_id, p_chronicle_id, p_season_id, p_session_id, p_turn_no, p_message_order,
    p_role, p_content, p_content_sha256, p_game_time, p_scene_id, p_save_version,
    p_source_type, p_idempotency_key
  ) returning * into v_message;

  update survival_rpg.transcript_sessions
  set last_message_order = p_message_order
  where id = p_session_id;

  return v_message;
end;
$$;

create function survival_rpg.close_public_transcript_session(
  p_session_id uuid,
  p_closing_save_version integer default null,
  p_closing_game_time text default null,
  p_closing_scene_id text default null,
  p_close_note text default null
)
returns survival_rpg.transcript_sessions
language plpgsql
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_session survival_rpg.transcript_sessions%rowtype;
begin
  select * into v_session
  from survival_rpg.transcript_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'transcript session % has not been opened', p_session_id using errcode = '23503';
  end if;

  if v_session.status = 'CLOSED' then
    if v_session.closing_save_version is distinct from p_closing_save_version
       or v_session.closing_game_time is distinct from p_closing_game_time
       or v_session.closing_scene_id is distinct from p_closing_scene_id
       or v_session.close_note is distinct from p_close_note then
      raise exception 'transcript session % close payload does not match the original close', p_session_id
        using errcode = '23505';
    end if;
    return v_session;
  end if;

  update survival_rpg.transcript_sessions
  set status = 'CLOSED',
      closed_at = now(),
      closing_save_version = p_closing_save_version,
      closing_game_time = p_closing_game_time,
      closing_scene_id = p_closing_scene_id,
      close_note = p_close_note
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

revoke all on function survival_rpg.open_public_transcript_session(uuid, text, text, text, integer, text, text) from public;
revoke all on function survival_rpg.append_public_transcript_message(uuid, text, text, text, integer, integer, text, text, text, uuid, text, text, integer, text) from public;
revoke all on function survival_rpg.close_public_transcript_session(uuid, integer, text, text, text) from public;
grant execute on function survival_rpg.open_public_transcript_session(uuid, text, text, text, integer, text, text) to service_role;
grant execute on function survival_rpg.append_public_transcript_message(uuid, text, text, text, integer, integer, text, text, text, uuid, text, text, integer, text) to service_role;
grant execute on function survival_rpg.close_public_transcript_session(uuid, integer, text, text, text) to service_role;
