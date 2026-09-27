-- Disposable PostgreSQL fixture for the AFTERFALL turn-link migrations.
-- Contains synthetic schema only; no project data or transcript text.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema survival_rpg;

create table survival_rpg.saves (
  worldline_id text primary key,
  save_version integer not null
);

create table survival_rpg.transcript_sessions (
  id uuid primary key,
  worldline_id text not null,
  chronicle_id text not null,
  season_id text not null,
  status text not null,
  last_message_order integer not null default -1
);

create table survival_rpg.transcript_messages (
  id uuid primary key,
  worldline_id text not null,
  chronicle_id text not null,
  season_id text not null,
  session_id uuid not null references survival_rpg.transcript_sessions(id),
  turn_no integer not null,
  message_order integer not null,
  role text not null,
  save_version integer not null,
  content text,
  content_sha256 text,
  idempotency_key uuid unique,
  game_time text,
  scene_id text,
  source_type text
);

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
  p_game_time text,
  p_scene_id text,
  p_save_version integer,
  p_source_type text
)
returns survival_rpg.transcript_messages
language plpgsql
security invoker
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_message survival_rpg.transcript_messages%rowtype;
  v_last_message_order integer;
begin
  select m.* into v_message
  from survival_rpg.transcript_messages as m
  where m.idempotency_key = p_idempotency_key;
  if found then
    if v_message.session_id is distinct from p_session_id
       or v_message.worldline_id is distinct from p_worldline_id
       or v_message.chronicle_id is distinct from p_chronicle_id
       or v_message.season_id is distinct from p_season_id
       or v_message.turn_no is distinct from p_turn_no
       or v_message.message_order is distinct from p_message_order
       or v_message.role is distinct from p_role
       or v_message.content is distinct from p_content
       or v_message.content_sha256 is distinct from p_content_sha256
       or v_message.save_version is distinct from p_save_version
       or v_message.game_time is distinct from p_game_time
       or v_message.scene_id is distinct from p_scene_id
       or v_message.source_type is distinct from p_source_type then
      raise exception 'fixture idempotency key conflicts with stored message'
        using errcode = '22023';
    end if;
    return v_message;
  end if;

  select s.last_message_order into v_last_message_order
  from survival_rpg.transcript_sessions as s
  where s.id = p_session_id
    and s.worldline_id = p_worldline_id
    and s.chronicle_id = p_chronicle_id
    and s.season_id = p_season_id
    and s.status = 'OPEN'
  for update;
  if not found or p_message_order <> v_last_message_order + 1 then
    raise exception 'fixture message order is not the next OPEN session order'
      using errcode = '22023';
  end if;

  insert into survival_rpg.transcript_messages (
    id, worldline_id, chronicle_id, season_id, session_id, turn_no,
    message_order, role, save_version, content, content_sha256,
    idempotency_key, game_time, scene_id, source_type
  ) values (
    p_idempotency_key, p_worldline_id, p_chronicle_id, p_season_id,
    p_session_id, p_turn_no, p_message_order, p_role, p_save_version,
    p_content, p_content_sha256, p_idempotency_key, p_game_time, p_scene_id,
    p_source_type
  ) returning * into v_message;
  update survival_rpg.transcript_sessions
  set last_message_order = p_message_order
  where id = p_session_id;
  return v_message;
end;
$$;

revoke all on function survival_rpg.append_public_transcript_message(
  uuid, text, text, text, integer, integer, text, text, text, uuid,
  text, text, integer, text
) from public, anon, authenticated;
grant execute on function survival_rpg.append_public_transcript_message(
  uuid, text, text, text, integer, integer, text, text, text, uuid,
  text, text, integer, text
) to service_role;

alter table survival_rpg.transcript_messages enable row level security;
alter table survival_rpg.transcript_messages force row level security;
alter table survival_rpg.transcript_sessions enable row level security;
alter table survival_rpg.transcript_sessions force row level security;

grant usage on schema survival_rpg to service_role;
grant select on survival_rpg.transcript_sessions,
  survival_rpg.transcript_messages to service_role;
grant insert on survival_rpg.transcript_messages to service_role;
grant insert, update on survival_rpg.transcript_sessions to service_role;
