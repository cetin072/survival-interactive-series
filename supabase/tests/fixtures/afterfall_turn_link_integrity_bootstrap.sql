-- Disposable PostgreSQL fixture for the AFTERFALL turn-link migrations.
-- Contains synthetic schema only; no project data or transcript text.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

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
  save_version integer not null
);

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

grant usage on schema survival_rpg to service_role;
grant select on survival_rpg.saves, survival_rpg.transcript_sessions,
  survival_rpg.transcript_messages to service_role;
grant update on survival_rpg.saves to service_role;
