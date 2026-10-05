-- Forward C3 recovery. No source/result/review decision is rewritten.
create table survival_ops.knowledge_main_drift_recoveries (
  job_id uuid primary key references survival_ops.knowledge_semantic_jobs(job_id),
  review_item_id uuid not null references survival_ops.archive_review_items(id),
  semantic_result_sha256 text not null,
  original_head_sha text not null,
  validated_main_sha text not null check(validated_main_sha ~ '^[a-f0-9]{40}$'),
  previous_blocker jsonb not null,
  recovered_at timestamptz not null default clock_timestamp()
);
create table survival_ops.knowledge_review_publication_attempts (
  id bigint generated always as identity primary key,
  job_id uuid not null references survival_ops.knowledge_semantic_jobs(job_id),
  review_item_id uuid not null references survival_ops.archive_review_items(id),
  decided_at timestamptz not null,
  approved_head_sha text not null,
  semantic_result_sha256 text not null,
  source_sha256 text not null,
  policy_sha256 text not null,
  validated_main_sha text not null check(validated_main_sha ~ '^[a-f0-9]{40}$'),
  prepared_head_sha text not null check(prepared_head_sha ~ '^[a-f0-9]{40}$'),
  operator_draft_revision integer,
  operator_draft_sha256 text,
  created_at timestamptz not null default clock_timestamp(),
  unique(review_item_id,prepared_head_sha)
);
alter table survival_ops.knowledge_main_drift_recoveries enable row level security;
alter table survival_ops.knowledge_review_publication_attempts enable row level security;
revoke all on survival_ops.knowledge_main_drift_recoveries,survival_ops.knowledge_review_publication_attempts from public,anon,authenticated,service_role;

-- Hold the existing single-work admission boundary for complete recoverable packages.
alter function public.archive_knowledge_semantic_job_prepare(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text)
  rename to archive_knowledge_semantic_job_prepare_admission_v1;
revoke all on function public.archive_knowledge_semantic_job_prepare_admission_v1(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text) from public,anon,authenticated,service_role;
create function public.archive_knowledge_semantic_job_prepare(
  p_job_type text,p_source_kind text,p_source_ref text,p_source_sha256 text,p_work_key text,
  p_policy_version text,p_policy_sha256 text,p_policy_pin jsonb,p_main_sha text,p_semantic_context jsonb,
  p_initial_status text default 'PREPARED',p_blocker_code text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare recovery uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(724015);
  select job_id into recovery from survival_ops.knowledge_semantic_jobs
    where status='BLOCKED' and blocker_code='MAIN_MOVED_REVALIDATION_REQUIRED'
      and blocker_stage='PR_RECONCILE' and semantic_result is not null
      and result_decision in('HUMAN_REVIEW','BRIEF_READY') order by prepared_at limit 1;
  if found then return jsonb_build_object('status','ACTIVE_RECOVERABLE_JOB_EXISTS','job_id',recovery,'created',false); end if;
  return public.archive_knowledge_semantic_job_prepare_admission_v1(p_job_type,p_source_kind,p_source_ref,p_source_sha256,
    p_work_key,p_policy_version,p_policy_sha256,p_policy_pin,p_main_sha,p_semantic_context,p_initial_status,p_blocker_code);
end;
$$;
revoke all on function public.archive_knowledge_semantic_job_prepare(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.archive_knowledge_semantic_job_prepare(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text) to service_role;

create or replace function public.archive_knowledge_semantic_job_list_active()
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(j)-'semantic_result'-'semantic_context'-'policy_pin' order by prepared_at),'[]'::jsonb)
  from survival_ops.knowledge_semantic_jobs j
  where status not in('PUBLISHED','HOLD','BLOCKED') or (status='BLOCKED'
    and blocker_code='MAIN_MOVED_REVALIDATION_REQUIRED' and blocker_stage='PR_RECONCILE'
    and semantic_result is not null and result_decision in('HUMAN_REVIEW','BRIEF_READY'));
$$;

create or replace function public.archive_knowledge_semantic_job_list_handled()
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('job_type',job_type,'source_kind',source_kind,'source_ref',source_ref,
    'source_sha256',source_sha256,'work_key',work_key,'status',status,'blocker_code',blocker_code,
    'blocker_stage',blocker_stage,'result_decision',result_decision) order by prepared_at),'[]'::jsonb)
  from survival_ops.knowledge_semantic_jobs where status in('PUBLISHED','HOLD','BLOCKED');
$$;

create function survival_ops.recover_knowledge_main_drift(
  p_job_id uuid,p_review_item_id uuid,p_result_sha256 text,p_source_sha256 text,p_policy_sha256 text,
  p_pr_number integer,p_head_ref text,p_head_sha text,p_validated_main_sha text,p_target_absent boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare j survival_ops.knowledge_semantic_jobs%rowtype; r survival_ops.archive_review_items%rowtype;
begin
  perform pg_advisory_xact_lock(724015);
  select * into j from survival_ops.knowledge_semantic_jobs where job_id=p_job_id for update;
  select * into r from survival_ops.archive_review_items where id=p_review_item_id for update;
  if j.status is distinct from 'BLOCKED' or j.blocker_code is distinct from 'MAIN_MOVED_REVALIDATION_REQUIRED'
    or j.blocker_stage is distinct from 'PR_RECONCILE' or j.result_decision is distinct from 'HUMAN_REVIEW'
    or j.semantic_result is null or j.semantic_result_sha256 is distinct from p_result_sha256
    or encode(extensions.digest(convert_to(j.semantic_result::text,'UTF8'),'sha256'),'hex') is distinct from p_result_sha256
    or j.source_sha256 is distinct from p_source_sha256 or j.policy_sha256 is distinct from p_policy_sha256
    or j.final_pr_number is distinct from p_pr_number or j.final_head_ref is distinct from p_head_ref
    or j.final_head_sha is distinct from p_head_sha or j.merge_sha is not null or j.published_at is not null
    or r.status is distinct from 'PENDING' or r.source_worker is distinct from 'C_KNOWLEDGE'
    or r.item_type is distinct from 'KNOWLEDGE' or r.decided_at is not null or r.decided_by is not null
    or r.payload->>'brief_id' is distinct from j.semantic_result->'brief'->>'id'
    or r.payload->>'head_sha' is distinct from p_head_sha or r.payload->>'head_ref' is distinct from p_head_ref
    or r.payload->>'pr_number' is distinct from p_pr_number::text
    or r.source_ref is distinct from 'https://github.com/cetin072/survival-interactive-series/blob/'||p_head_sha||'/knowledge/content/briefs/'||(j.semantic_result->'brief'->>'id')||'.json'
    or p_validated_main_sha is null or p_validated_main_sha !~ '^[a-f0-9]{40}$' or p_target_absent is distinct from true
    or exists(select 1 from survival_ops.knowledge_semantic_jobs where job_id<>j.job_id and status not in('PUBLISHED','HOLD','BLOCKED')) then
    return jsonb_build_object('status','REJECTED','reason','MAIN_DRIFT_RECOVERY_BINDING_MISMATCH');
  end if;
  insert into survival_ops.knowledge_main_drift_recoveries(job_id,review_item_id,semantic_result_sha256,
    original_head_sha,validated_main_sha,previous_blocker)
  values(j.job_id,r.id,p_result_sha256,p_head_sha,p_validated_main_sha,
    jsonb_build_object('code',j.blocker_code,'stage',j.blocker_stage,'finalized_at',j.finalized_at));
  perform set_config('survival_ops.knowledge_main_drift_recovery_job',j.job_id::text,true);
  update survival_ops.knowledge_semantic_jobs set status='HUMAN_REVIEW',blocker_code=null,blocker_stage=null
    where job_id=j.job_id;
  return jsonb_build_object('status','HUMAN_REVIEW','job_id',j.job_id,'review_item_id',r.id);
end;
$$;
revoke all on function survival_ops.recover_knowledge_main_drift(uuid,uuid,text,text,text,integer,text,text,text,boolean) from public,anon,authenticated,service_role;

-- Old deployed code must not close a restored PR before this Draft fix is merged.
-- New callers use v2 and receive the original result plus registered transport heads.
create function public.archive_knowledge_semantic_job_list_reconcile_v2()
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(j)||jsonb_build_object(
    'result_digest_verified',j.semantic_result_sha256=encode(extensions.digest(convert_to(j.semantic_result::text,'UTF8'),'sha256'),'hex'),
    'publication_heads',coalesce((select jsonb_agg(a.prepared_head_sha) from survival_ops.knowledge_review_publication_attempts a
      where a.job_id=j.job_id and a.semantic_result_sha256=j.semantic_result_sha256),'[]'::jsonb)) order by j.updated_at),'[]'::jsonb)
  from survival_ops.knowledge_semantic_jobs j where status in('PR_OPEN','HUMAN_REVIEW');
$$;
create or replace function public.archive_knowledge_semantic_job_list_reconcile()
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(j)-'semantic_result'-'semantic_context'-'policy_pin' order by j.updated_at),'[]'::jsonb)
  from survival_ops.knowledge_semantic_jobs j where status in('PR_OPEN','HUMAN_REVIEW')
    and not exists(select 1 from survival_ops.knowledge_main_drift_recoveries r where r.job_id=j.job_id);
$$;
revoke all on function public.archive_knowledge_semantic_job_list_reconcile_v2() from public,anon,authenticated;
grant execute on function public.archive_knowledge_semantic_job_list_reconcile_v2() to service_role;

create function public.archive_knowledge_review_package(p_item_id uuid,p_decided_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r survival_ops.archive_review_items%rowtype; j survival_ops.knowledge_semantic_jobs%rowtype;
begin
  select * into r from survival_ops.archive_review_items where id=p_item_id;
  if r.status is distinct from 'APPROVED' or r.decided_at is distinct from p_decided_at
    or r.source_worker is distinct from 'C_KNOWLEDGE' or r.item_type is distinct from 'KNOWLEDGE'
    or not exists(select 1 from survival_ops.archive_review_decisions where item_id=r.id and decision='APPROVED' and actor_profile_id=r.decided_by) then
    raise exception 'SEMANTIC_APPROVAL_BINDING_MISMATCH';
  end if;
  select * into j from survival_ops.knowledge_semantic_jobs where final_pr_number=(r.payload->>'pr_number')::integer
    and final_head_ref=r.payload->>'head_ref' and semantic_result->'brief'->>'id'=r.payload->>'brief_id';
  if not found then return jsonb_build_object('status','NOT_C3'); end if;
  if j.result_decision is distinct from 'HUMAN_REVIEW' or j.semantic_result is null
    or j.semantic_result_sha256 is distinct from encode(extensions.digest(convert_to(j.semantic_result::text,'UTF8'),'sha256'),'hex')
    or (j.final_head_sha is distinct from r.payload->>'head_sha' and not exists(
      select 1 from survival_ops.knowledge_review_publication_attempts a where a.job_id=j.job_id
        and a.review_item_id=r.id and a.decided_at=r.decided_at and a.approved_head_sha=r.payload->>'head_sha'
        and a.prepared_head_sha=j.final_head_sha and a.semantic_result_sha256=j.semantic_result_sha256)) then
    raise exception 'SEMANTIC_APPROVED_PACKAGE_CHANGED';
  end if;
  return jsonb_build_object('status','C3','job',to_jsonb(j),'review',to_jsonb(r),
    'prepared_heads',coalesce((select jsonb_agg(a.prepared_head_sha) from survival_ops.knowledge_review_publication_attempts a
      where a.review_item_id=r.id and a.decided_at=r.decided_at and a.semantic_result_sha256=j.semantic_result_sha256),'[]'::jsonb));
end;
$$;
create function public.archive_knowledge_review_record_preparation(
  p_item_id uuid,p_decided_at timestamptz,p_result_sha256 text,p_source_sha256 text,p_policy_sha256 text,
  p_validated_main_sha text,p_prepared_head_sha text,p_operator_revision integer default null,p_operator_sha256 text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare package jsonb; j jsonb; r jsonb;
begin
  package:=public.archive_knowledge_review_package(p_item_id,p_decided_at); j:=package->'job'; r:=package->'review';
  if package->>'status' is distinct from 'C3' or j->>'status' not in('HUMAN_REVIEW','PR_OPEN')
    or j->>'semantic_result_sha256' is distinct from p_result_sha256 or j->>'source_sha256' is distinct from p_source_sha256
    or j->>'policy_sha256' is distinct from p_policy_sha256
    or p_operator_revision::text is distinct from r->'payload'->>'operator_draft_revision'
    or p_operator_sha256 is distinct from r->'payload'->>'operator_draft_sha256' then
    raise exception 'SEMANTIC_PREPARATION_BINDING_MISMATCH';
  end if;
  insert into survival_ops.knowledge_review_publication_attempts(job_id,review_item_id,decided_at,approved_head_sha,
    semantic_result_sha256,source_sha256,policy_sha256,validated_main_sha,prepared_head_sha,operator_draft_revision,operator_draft_sha256)
  values((j->>'job_id')::uuid,p_item_id,p_decided_at,r->'payload'->>'head_sha',p_result_sha256,p_source_sha256,
    p_policy_sha256,p_validated_main_sha,p_prepared_head_sha,p_operator_revision,p_operator_sha256) on conflict do nothing;
  return jsonb_build_object('status','PREPARATION_RECORDED','prepared_head_sha',p_prepared_head_sha);
end;
$$;
revoke all on function public.archive_knowledge_review_package(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.archive_knowledge_review_record_preparation(uuid,timestamptz,text,text,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.archive_knowledge_review_package(uuid,timestamptz) to service_role;
grant execute on function public.archive_knowledge_review_record_preparation(uuid,timestamptz,text,text,text,text,text,integer,text) to service_role;

create or replace function survival_ops.guard_knowledge_semantic_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  repair_job text;
  retry_job text;
  revalidate_job text;
  publish_job text;
  repair_allowed boolean := false;
begin
  if tg_op = 'UPDATE' then
    repair_job := pg_catalog.current_setting('survival_ops.knowledge_semantic_repair_job', true);
    retry_job := pg_catalog.current_setting('survival_ops.knowledge_semantic_retry_job', true);
    revalidate_job := pg_catalog.current_setting('survival_ops.knowledge_ex001_revalidate_job', true);
    publish_job := pg_catalog.current_setting('survival_ops.knowledge_ex001_publish_job', true);

    repair_allowed :=
      (
        old.status = 'BLOCKED'
        and old.result_decision = 'BRIEF_READY'
        and old.blocker_code = 'PR_HEAD_CHANGED'
        and old.blocker_stage = 'PR_RECONCILE'
        and new.status = 'PUBLISHED'
        and repair_job = old.job_id::text
        and new.semantic_result is not distinct from old.semantic_result
        and new.final_pr_number is not distinct from old.final_pr_number
        and new.final_head_ref is not distinct from old.final_head_ref
        and new.final_head_sha ~ '^[a-f0-9]{40}$'
        and new.merge_sha ~ '^[a-f0-9]{40}$'
        and new.blocker_code is null
        and new.blocker_stage is null
        and new.published_at is not null
      )
      or
      (
        old.status = 'BLOCKED'
        and old.blocker_stage = 'FINALIZER'
        and old.result_decision in ('BRIEF_READY','HUMAN_REVIEW')
        and new.status = 'SUBMITTED'
        and retry_job = old.job_id::text
        and new.semantic_result is not distinct from old.semantic_result
        and new.semantic_result_sha256 is not distinct from old.semantic_result_sha256
        and new.result_decision is not distinct from old.result_decision
        and new.final_pr_number is null
        and new.final_head_ref is null
        and new.final_head_sha is null
        and new.merge_sha is null
        and new.blocker_code is null
        and new.blocker_stage is null
        and new.finalizing_at is null
        and new.finalized_at is null
        and new.published_at is null
        and new.finalizer_attempt_count = 0
      )
      or
      (
        old.status = 'BLOCKED'
        and old.source_kind = 'USER_REPORTED_EXPERIENCE'
        and old.source_ref = 'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json'
        and old.result_decision = 'HUMAN_REVIEW'
        and old.blocker_code = 'MAIN_MOVED_REVALIDATION_REQUIRED'
        and old.blocker_stage = 'PR_RECONCILE'
        and revalidate_job = old.job_id::text
        and new.status = 'HUMAN_REVIEW'
        and new.final_pr_number > 0
        and new.final_pr_number <> old.final_pr_number
        and new.final_head_ref ~ '^knowledge/worker/[A-Za-z0-9._/-]+$'
        and new.final_head_sha ~ '^[a-f0-9]{40}$'
        and new.final_head_sha <> old.final_head_sha
        and new.blocker_code is null
        and new.blocker_stage is null
        and (pg_catalog.to_jsonb(new) - array['status','final_pr_number','final_head_ref','final_head_sha','blocker_code','blocker_stage'])
            = (pg_catalog.to_jsonb(old) - array['status','final_pr_number','final_head_ref','final_head_sha','blocker_code','blocker_stage'])
      )
      or
      (
        old.job_id = '83ee5b52-0732-4d47-a56c-e1046cf18a33'::uuid
        and old.status = 'BLOCKED'
        and old.source_kind = 'USER_REPORTED_EXPERIENCE'
        and old.source_ref = 'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json'
        and old.result_decision = 'HUMAN_REVIEW'
        and old.blocker_code = 'PR_HEAD_CHANGED'
        and old.blocker_stage = 'PR_RECONCILE'
        and old.final_pr_number = 416
        and old.final_head_sha = '0e5db34a41d1b80a9bf1267c8be50e54621f7ddf'
        and publish_job = old.job_id::text
        and new.status = 'PUBLISHED'
        and new.final_head_sha = '6183501036e1388f48d42e30f8845f0c84176d79'
        and new.merge_sha = 'd00c351cedeebc8703afdfdf817a3104cd4c608c'
        and new.blocker_code is null
        and new.blocker_stage is null
        and new.published_at is not null
        and (pg_catalog.to_jsonb(new) - array['status','final_head_sha','merge_sha','blocker_code','blocker_stage','published_at','finalized_at','updated_at'])
          = (pg_catalog.to_jsonb(old) - array['status','final_head_sha','merge_sha','blocker_code','blocker_stage','published_at','finalized_at','updated_at'])
      );

    repair_allowed := repair_allowed or (
      old.status='BLOCKED' and old.blocker_code='MAIN_MOVED_REVALIDATION_REQUIRED'
      and old.blocker_stage='PR_RECONCILE' and old.result_decision='HUMAN_REVIEW'
      and new.status='HUMAN_REVIEW'
      and current_setting('survival_ops.knowledge_main_drift_recovery_job',true)=old.job_id::text
      and new.blocker_code is null and new.blocker_stage is null
      and (to_jsonb(new)-array['status','blocker_code','blocker_stage'])=(to_jsonb(old)-array['status','blocker_code','blocker_stage'])
      and exists(select 1 from survival_ops.knowledge_main_drift_recoveries r
        where r.job_id=old.job_id and r.semantic_result_sha256=old.semantic_result_sha256
          and r.original_head_sha=old.final_head_sha)
    );
    if old.status='HUMAN_REVIEW' and new.final_head_sha is distinct from old.final_head_sha
      and not exists(select 1 from survival_ops.knowledge_review_publication_attempts a
        where a.job_id=old.job_id and a.prepared_head_sha=new.final_head_sha
          and a.semantic_result_sha256=old.semantic_result_sha256
          and a.source_sha256=old.source_sha256 and a.policy_sha256=old.policy_sha256) then
      raise exception 'SEMANTIC_TRANSPORT_NOT_REGISTERED';
    end if;
    if old.status in ('PUBLISHED','HOLD','BLOCKED') and not repair_allowed then
      raise exception 'KNOWLEDGE_SEMANTIC_TERMINAL_IMMUTABLE';
    end if;
    if old.status <> 'PREPARED' and new.semantic_result is distinct from old.semantic_result then
      raise exception 'KNOWLEDGE_SEMANTIC_RESULT_IMMUTABLE';
    end if;
    if not repair_allowed then
      if old.status = 'PREPARED' and new.status not in ('PREPARED','SUBMITTED','HOLD','BLOCKED') then
        raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
      elsif old.status = 'SUBMITTED' and new.status not in ('SUBMITTED','FINALIZING','HOLD','BLOCKED') then
        raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
      elsif old.status = 'FINALIZING' and new.status not in ('FINALIZING','SUBMITTED','PR_OPEN','HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED') then
        raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
      elsif old.status = 'PR_OPEN' and new.status not in ('PR_OPEN','HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED') then
        raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
      elsif old.status = 'HUMAN_REVIEW' and new.status not in ('HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED') then
        raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
      end if;
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
