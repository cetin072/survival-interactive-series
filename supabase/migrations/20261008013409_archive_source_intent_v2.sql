-- DRAFT: do not apply to the live project without separate metadata/adoption approval.
-- Existing calls and rows retain NULL intent and require review in discovery V2.
-- No backfill, role changes, grants to new tables, or source body changes.
alter table survival_rpg.transcript_sessions add column archive_intent jsonb;

create function survival_rpg.valid_archive_source_intent(p jsonb)
returns boolean language plpgsql immutable security invoker set search_path = pg_catalog as $$
begin
  return p is not null and jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k where k not in
      ('version','disposition','publication','kind','history','initial_order','predecessor_id','evidence_ref','checkpoint_ref','checkpoint_revision'))
    and p->'version' = '1'::jsonb
    and p->>'disposition' in ('ADOPTED','SUPERSEDED','REVIEW_REQUIRED')
    and p->>'publication' in ('APPROVED','REVIEW_REQUIRED')
    and p->>'kind' in ('CONTINUE','NEW_SEASON','RESTART','LEGACY')
    and p->>'history' in ('NEW_CAPTURE','MAPPED_BASELINE','LEGACY')
    and jsonb_typeof(p->'initial_order')='number'
    and p->>'initial_order' ~ '^(0|[1-9][0-9]*)$'
    and (p->>'initial_order')::integer >= 0 and (p->>'initial_order')::integer % 2 = 0
    and p ? 'predecessor_id' and (p->'predecessor_id'='null'::jsonb
      or p->>'predecessor_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
    and p->>'evidence_ref' ~ '^https://github.com/cetin072/survival-interactive-series/(issues|pull)/[0-9]+$'
    and ((not p ? 'checkpoint_ref' and not p ? 'checkpoint_revision') or
      (p->>'checkpoint_ref' ~ '^worldlines/AFTERFALL/seasons/S[0-9]{2,3}/[A-Za-z0-9_-]+\.md$'
        and p->>'checkpoint_revision' ~ '^[a-f0-9]{40}$'));
exception when others then return false;
end;
$$;
revoke all on function survival_rpg.valid_archive_source_intent(jsonb) from public,anon,authenticated;
grant execute on function survival_rpg.valid_archive_source_intent(jsonb) to service_role;
alter table survival_rpg.transcript_sessions add constraint archive_source_intent_shape
  check (archive_intent is null or coalesce(survival_rpg.valid_archive_source_intent(archive_intent), false));
comment on column survival_rpg.transcript_sessions.archive_intent is
  'Runtime adoption/continuity and explicit publication approval. public_safe remains row safety, OPEN/CLOSED remains lifecycle. NULL never implies approval.';

-- CAS registration, called only after the operator checks committed publication history.
-- It does not edit RAW, infer a restart, or silently replace a prior decision.
create function survival_rpg.set_archive_source_intent(p_session_id uuid,p_intent jsonb,p_expected jsonb default null)
returns survival_rpg.transcript_sessions language plpgsql security invoker
set search_path = pg_catalog,survival_rpg as $$
declare s survival_rpg.transcript_sessions%rowtype; prior survival_rpg.transcript_sessions%rowtype;
begin
  select * into s from survival_rpg.transcript_sessions where id=p_session_id for update;
  if not found or s.chronicle_id <> 'C03' or s.worldline_id <> 'AFTERFALL' then
    raise exception 'UNAPPROVED_DISCOVERY_SCOPE';
  end if;
  if not coalesce(survival_rpg.valid_archive_source_intent(p_intent),false)
    or p_intent->>'predecessor_id'=s.id::text
    or (p_intent ? 'checkpoint_ref' and p_intent->>'checkpoint_ref' not like
      'worldlines/AFTERFALL/seasons/' || s.season_id || '/%') then
    raise exception 'INVALID_ARCHIVE_INTENT';
  end if;
  if s.archive_intent is not distinct from p_intent then return s; end if;
  if s.archive_intent is distinct from p_expected then raise exception 'ARCHIVE_INTENT_CHANGED'; end if;
  if p_intent->>'predecessor_id' is not null then
    select * into prior from survival_rpg.transcript_sessions where id=(p_intent->>'predecessor_id')::uuid;
    if not found or prior.chronicle_id <> s.chronicle_id or prior.worldline_id <> s.worldline_id then
      raise exception 'CONTINUITY_PREDECESSOR_MISSING';
    end if;
  end if;
  update survival_rpg.transcript_sessions set archive_intent=p_intent where id=s.id returning * into s;
  return s;
end;
$$;
revoke all on function survival_rpg.set_archive_source_intent(uuid,jsonb,jsonb) from public,anon,authenticated,archive_exporter;
grant execute on function survival_rpg.set_archive_source_intent(uuid,jsonb,jsonb) to service_role;

-- Additive Runtime connection. Existing seven-argument open RPC is unchanged.
-- Runtime supplies the previous room UUID and its explicit intent, not a UUID config file.
create function survival_rpg.open_public_transcript_session_with_archive_intent(
  p_session_id uuid,p_worldline_id text,p_chronicle_id text,p_season_id text,p_archive_intent jsonb,
  p_starting_save_version integer default null,p_starting_game_time text default null,p_starting_scene_id text default null)
returns survival_rpg.transcript_sessions language plpgsql security invoker
set search_path = pg_catalog,survival_rpg as $$
begin
  perform survival_rpg.open_public_transcript_session(p_session_id,p_worldline_id,p_chronicle_id,p_season_id,
    p_starting_save_version,p_starting_game_time,p_starting_scene_id);
  return survival_rpg.set_archive_source_intent(p_session_id,p_archive_intent);
end;
$$;
revoke all on function survival_rpg.open_public_transcript_session_with_archive_intent(uuid,text,text,text,jsonb,integer,text,text)
  from public,anon,authenticated,archive_exporter;
grant execute on function survival_rpg.open_public_transcript_session_with_archive_intent(uuid,text,text,text,jsonb,integer,text,text)
  to service_role;
