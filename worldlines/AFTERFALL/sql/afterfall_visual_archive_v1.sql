-- AFTERFALL Visual Archive v1
-- Applied to Supabase staging as migration: afterfall_visual_archive_v1
-- This file is the repository-side audit copy of the additive schema.

create table if not exists survival_rpg.visual_assets (
  worldline_id text not null references survival_rpg.saves(worldline_id),
  asset_id text not null,
  asset_type text not null
    check (asset_type = any (array['WORLD_MAP','LOCATION','CHARACTER','EVENT']::text[])),
  status text not null default 'CANDIDATE'
    check (status = any (array[
      'CANDIDATE','WAITING_CANON','READY','GENERATING',
      'GENERATED','PUBLISHED','REJECTED','SUPERSEDED','ERROR'
    ]::text[])),
  visibility text not null default 'PLAYER_ARCHIVE'
    check (visibility = any (array['PUBLIC_ARCHIVE','PLAYER_ARCHIVE','CORE_PRIVATE']::text[])),
  title text not null,
  style_version text not null default 'AFTERFALL_ARCHIVE_V1',
  source jsonb not null default '{}'::jsonb,
  brief jsonb not null default '{}'::jsonb,
  prompt_snapshot text,
  provider text,
  provider_model text,
  provider_asset_id text,
  object_path text,
  image_url text,
  generation_meta jsonb not null default '{}'::jsonb,
  error_text text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (worldline_id, asset_id),
  check (btrim(asset_id) <> ''),
  check (btrim(title) <> ''),
  check (jsonb_typeof(source) = 'object'),
  check (jsonb_typeof(brief) = 'object'),
  check (jsonb_typeof(generation_meta) = 'object')
);

comment on table survival_rpg.visual_assets is
'Low-touch visual archive queue and asset registry. Trusted tooling only; never a gameplay source of truth.';

comment on column survival_rpg.visual_assets.visibility is
'PUBLIC_ARCHIVE may be published; PLAYER_ARCHIVE is player-safe but not automatically public; CORE_PRIVATE must never enter public manifests.';

comment on column survival_rpg.visual_assets.source is
'Pointers to existing Canon/runtime sources such as scene_id, character_id, base_id, event ids, or WORLD_MAP_GRID version.';

comment on column survival_rpg.visual_assets.brief is
'Provider-neutral visual brief derived from Canon. Must not contain unrevealed GM-only future information for public/player assets.';

create index if not exists visual_assets_worldline_status_idx
  on survival_rpg.visual_assets (worldline_id, status);

create index if not exists visual_assets_worldline_type_idx
  on survival_rpg.visual_assets (worldline_id, asset_type);

create index if not exists visual_assets_publish_idx
  on survival_rpg.visual_assets (worldline_id, visibility, status, published_at desc);

alter table survival_rpg.visual_assets enable row level security;

revoke all on table survival_rpg.visual_assets from anon, authenticated;
grant select, insert, update, delete on table survival_rpg.visual_assets to service_role;

create or replace function survival_rpg.touch_visual_assets_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists visual_assets_touch_updated_at on survival_rpg.visual_assets;
create trigger visual_assets_touch_updated_at
before update on survival_rpg.visual_assets
for each row execute function survival_rpg.touch_visual_assets_updated_at();

insert into survival_rpg.visual_assets (
  worldline_id, asset_id, asset_type, status, visibility, title,
  style_version, source, brief
)
values (
  'AFTERFALL',
  'AF-MAP-001',
  'WORLD_MAP',
  'WAITING_CANON',
  'PLAYER_ARCHIVE',
  '서림 생활권 지도',
  'AFTERFALL_ARCHIVE_V1',
  jsonb_build_object(
    'kind', 'WORLD_MAP',
    'grid_document', 'worldlines/AFTERFALL/WORLD_MAP_GRID_V1.md',
    'reason', 'FIRST_ARCHIVE_VISUAL'
  ),
  jsonb_build_object(
    'purpose', '아카이브 대문용 첫 세계관 지도',
    'waiting_for', jsonb_build_array(
      '제3거점 확장 이전 여부 확정',
      '전면 생활거점 구조 확정',
      '북서 실습센터 후방화 여부 확정',
      '공개용 지도 보안레이어 확정'
    ),
    'generation_policy', 'DO_NOT_GENERATE_UNTIL_CANON_READY'
  )
)
on conflict (worldline_id, asset_id) do update
set
  status = excluded.status,
  visibility = excluded.visibility,
  title = excluded.title,
  style_version = excluded.style_version,
  source = excluded.source,
  brief = excluded.brief;
