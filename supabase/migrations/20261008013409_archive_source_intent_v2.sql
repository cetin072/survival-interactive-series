-- DRAFT: do not apply to the live project without separate metadata/adoption approval.
-- Existing calls and rows retain NULL intent and require review in discovery V2.
-- No backfill, new roles/keys, or source body changes. Exporter gains six approval metadata columns only.
alter table survival_rpg.transcript_sessions add column archive_intent jsonb;

create function survival_rpg.valid_archive_source_intent(p jsonb)
returns boolean language plpgsql immutable security invoker set search_path = pg_catalog as $$
begin
  return p is not null and jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k where k not in
      ('version','disposition','publication','kind','history','initial_order','predecessor_id','evidence_ref','checkpoint_ref','checkpoint_revision'))
    and p->'version' = '1'::jsonb
    and p->>'disposition' = 'REVIEW_REQUIRED'
    and p->>'publication' = 'REVIEW_REQUIRED'
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
  'Untrusted Runtime continuity intent only. Approval lives in survival_ops.archive_source_authorizations; neither this JSON nor a GitHub URL grants publication.';

-- GM CAS registration of pending continuity only; it cannot grant publication.
-- It does not edit RAW, infer a restart, or silently replace a prior intent.
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

-- Protected approval uses the EXISTING authenticated Archive operator capability.
-- No new actor, key, service-role grant, or mutation of the original RAW.
-- This migration deliberately fails if the existing operator boundary is absent.
do $$ begin
  if to_regprocedure('survival_ops.private_require_archive_operator()') is null then
    raise exception 'ARCHIVE_OPERATOR_BOUNDARY_REQUIRED';
  end if;
end $$;
create table survival_ops.archive_source_authorizations (
  session_id uuid primary key references survival_rpg.transcript_sessions(id) on delete restrict,
  chronicle_id text not null check (chronicle_id='C03'),
  worldline_id text not null check (worldline_id='AFTERFALL'),
  season_id text not null check (season_id ~ '^S[0-9]{2,3}$'),
  runtime_intent jsonb not null,
  decision jsonb not null,
  approved_by uuid not null references public.profiles(id) on delete restrict,
  approved_at timestamptz not null default now()
);
alter table survival_ops.archive_source_authorizations enable row level security;
revoke all on survival_ops.archive_source_authorizations from public,anon,authenticated,service_role,archive_exporter;
grant usage on schema survival_ops to archive_exporter;
grant select (session_id,chronicle_id,worldline_id,season_id,runtime_intent,decision)
  on survival_ops.archive_source_authorizations to archive_exporter;
create policy archive_source_authorizations_export on survival_ops.archive_source_authorizations
  for select to archive_exporter using (chronicle_id='C03' and worldline_id='AFTERFALL');

-- The operator attests adoption AND the reviewed Git publication connection.
-- Discovery independently compares the attestation against immutable main manifests.
-- URL text is an audit reference, never an authentication or approval capability.
create function public.archive_operator_authorize_source(
  p_session_id uuid,p_runtime_intent jsonb,p_decision jsonb,p_expected jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; s survival_rpg.transcript_sessions; prior jsonb; skipped survival_rpg.transcript_sessions;
begin
  -- Check the actual PostgREST DB role, never caller-written JWT role text.
  if current_setting('role',true) is distinct from 'authenticated' then
    raise exception using errcode='42501',message='ARCHIVE_OPERATOR_AUTHENTICATED_REQUIRED';
  end if;
  actor := survival_ops.private_require_archive_operator();
  select * into s from survival_rpg.transcript_sessions where id=p_session_id for update;
  if not found or s.chronicle_id <> 'C03' or s.worldline_id <> 'AFTERFALL' then
    raise exception 'UNAPPROVED_DISCOVERY_SCOPE';
  end if;
  if not coalesce(survival_rpg.valid_archive_source_intent(p_runtime_intent),false)
    or s.archive_intent is distinct from p_runtime_intent then raise exception 'ARCHIVE_INTENT_CHANGED'; end if;
  if not coalesce(jsonb_typeof(p_decision)='object'
    and not exists(select 1 from jsonb_object_keys(p_decision) k where k not in
      ('disposition','publication','evidence_ref','allow_continuation','published_predecessor_id','supersedes_id','approved_through'))
    and p_decision->>'disposition' in ('ADOPTED','SUPERSEDED','REVIEW_REQUIRED')
    and p_decision->>'publication' in ('APPROVED','REVIEW_REQUIRED')
    and p_decision->>'evidence_ref' ~ '^https://github.com/cetin072/survival-interactive-series/(issues|pull)/[0-9]+$'
    and jsonb_typeof(p_decision->'allow_continuation')='boolean'
    and p_decision ? 'published_predecessor_id' and (p_decision->'published_predecessor_id'='null'::jsonb
      or p_decision->>'published_predecessor_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
    and p_decision ? 'supersedes_id' and (p_decision->'supersedes_id'='null'::jsonb
      or p_decision->>'supersedes_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
    and p_decision ? 'approved_through' and (p_decision->'approved_through'='null'::jsonb
      or (p_decision->>'approved_through' ~ '^[0-9]+$'
        and (p_decision->>'approved_through')::integer % 2=1
        and (p_decision->>'approved_through')::integer >= (p_runtime_intent->>'initial_order')::integer
        and (p_decision->>'approved_through')::integer <= s.last_message_order))
    and (p_decision->>'disposition'='ADOPTED' or
      (p_decision->>'publication'='REVIEW_REQUIRED' and p_decision->'allow_continuation'='false'::jsonb)),false)
  then raise exception 'INVALID_ARCHIVE_AUTHORIZATION'; end if;
  if p_runtime_intent->>'kind'='RESTART' and p_decision->>'disposition'='ADOPTED' then
    if p_decision->>'supersedes_id' is null or p_decision->>'approved_through' is null
      or p_decision->>'published_predecessor_id' is null then raise exception 'RESTART_REQUIRES_EDITORIAL_REVIEW'; end if;
    select * into skipped from survival_rpg.transcript_sessions where id=(p_decision->>'supersedes_id')::uuid;
    if not found or skipped.id::text is distinct from p_runtime_intent->>'predecessor_id'
      or skipped.season_id <> s.season_id or skipped.chronicle_id <> s.chronicle_id
      or skipped.worldline_id <> s.worldline_id or skipped.status <> 'CLOSED'
      or skipped.archive_intent->>'predecessor_id' is distinct from p_decision->>'published_predecessor_id'
      or not exists(select 1 from survival_ops.archive_source_authorizations a
        where a.session_id=skipped.id and a.runtime_intent=skipped.archive_intent
          and a.decision->>'disposition'='SUPERSEDED') then raise exception 'RESTART_SUPERSESSION_UNVERIFIED'; end if;
  elsif p_decision->>'supersedes_id' is not null
    or p_decision->>'published_predecessor_id' is distinct from p_runtime_intent->>'predecessor_id' then
    raise exception 'INVALID_ARCHIVE_AUTHORIZATION';
  end if;
  select decision into prior from survival_ops.archive_source_authorizations where session_id=s.id;
  if prior is not distinct from p_decision and exists(select 1 from survival_ops.archive_source_authorizations
    where session_id=s.id and runtime_intent=p_runtime_intent) then return p_decision; end if;
  if prior is distinct from p_expected then raise exception 'ARCHIVE_AUTHORIZATION_CHANGED'; end if;
  insert into survival_ops.archive_source_authorizations
    (session_id,chronicle_id,worldline_id,season_id,runtime_intent,decision,approved_by)
  values(s.id,s.chronicle_id,s.worldline_id,s.season_id,p_runtime_intent,p_decision,actor)
  on conflict(session_id) do update set runtime_intent=excluded.runtime_intent,decision=excluded.decision,
    chronicle_id=excluded.chronicle_id,worldline_id=excluded.worldline_id,season_id=excluded.season_id,
    approved_by=excluded.approved_by,approved_at=now();
  return p_decision;
end $$;
revoke all on function public.archive_operator_authorize_source(uuid,jsonb,jsonb,jsonb)
  from public,anon,authenticated,service_role,archive_exporter;
grant execute on function public.archive_operator_authorize_source(uuid,jsonb,jsonb,jsonb) to authenticated;
