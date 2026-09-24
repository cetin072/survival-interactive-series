-- Applied to the connected Supabase project as migration 20260924173125.
-- Purpose: durable, append-only, PLAYER_SAFE raw transcript capture.

create table survival_rpg.transcript_messages (
  id uuid primary key default gen_random_uuid(),
  worldline_id text not null check (btrim(worldline_id) <> ''),
  chronicle_id text not null check (btrim(chronicle_id) <> ''),
  season_id text not null check (btrim(season_id) <> ''),
  session_id uuid not null,
  turn_no integer not null check (turn_no >= 0),
  message_order integer not null check (message_order >= 0),
  role text not null check (role in ('USER', 'GM', 'ASSISTANT_PUBLIC_META')),
  content text not null check (btrim(content) <> ''),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  game_time text,
  scene_id text,
  save_version integer check (save_version is null or save_version > 0),
  source_type text not null default 'LIVE' check (source_type in ('LIVE', 'RECOVERY')),
  public_safe boolean not null default true check (public_safe),
  idempotency_key uuid not null,
  recorded_at timestamptz not null default now(),
  constraint transcript_messages_session_order_unique
    unique (worldline_id, chronicle_id, season_id, session_id, message_order),
  constraint transcript_messages_idempotency_unique
    unique (idempotency_key)
);

comment on table survival_rpg.transcript_messages is
  'Append-only public-safe raw transcript capture. Browser roles have no access; trusted server capture only.';
comment on column survival_rpg.transcript_messages.idempotency_key is
  'Caller-generated stable UUID used to make capture retries idempotent.';
comment on column survival_rpg.transcript_messages.content_sha256 is
  'Lowercase SHA-256 of the exact UTF-8 content submitted by the trusted capture process.';

create index transcript_messages_timeline_idx
  on survival_rpg.transcript_messages
  (worldline_id, chronicle_id, season_id, session_id, turn_no, message_order);

alter table survival_rpg.transcript_messages enable row level security;
alter table survival_rpg.transcript_messages force row level security;

revoke all on table survival_rpg.transcript_messages from public;
revoke all on table survival_rpg.transcript_messages from anon, authenticated;
grant usage on schema survival_rpg to service_role;
grant select, insert on table survival_rpg.transcript_messages to service_role;

create function survival_rpg.reject_transcript_message_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'survival_rpg.transcript_messages is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function survival_rpg.reject_transcript_message_mutation() from public;

create trigger transcript_messages_append_only
before update or delete on survival_rpg.transcript_messages
for each row execute function survival_rpg.reject_transcript_message_mutation();
