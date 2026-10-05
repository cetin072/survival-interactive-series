-- Preserve terminal history while excluding targets already published by a later job.
create function survival_ops.knowledge_main_drift_recoverable(j survival_ops.knowledge_semantic_jobs)
returns boolean language sql stable security definer set search_path='' as $$
  select j.status='BLOCKED' and j.blocker_code='MAIN_MOVED_REVALIDATION_REQUIRED'
    and j.blocker_stage='PR_RECONCILE' and j.semantic_result is not null
    and j.result_decision in('HUMAN_REVIEW','BRIEF_READY')
    and j.semantic_result->'brief'->>'id' ~ '^K-[0-9]+$'
    and not exists(select 1 from survival_ops.knowledge_semantic_jobs p
      where p.status='PUBLISHED' and p.semantic_result->'brief'->>'id'=j.semantic_result->'brief'->>'id');
$$;
revoke all on function survival_ops.knowledge_main_drift_recoverable(survival_ops.knowledge_semantic_jobs) from public,anon,authenticated,service_role;

create or replace function public.archive_knowledge_semantic_job_prepare(
  p_job_type text,p_source_kind text,p_source_ref text,p_source_sha256 text,p_work_key text,
  p_policy_version text,p_policy_sha256 text,p_policy_pin jsonb,p_main_sha text,p_semantic_context jsonb,
  p_initial_status text default 'PREPARED',p_blocker_code text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare recovery uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(724015);
  select j.job_id into recovery from survival_ops.knowledge_semantic_jobs j
    where survival_ops.knowledge_main_drift_recoverable(j) order by prepared_at limit 1;
  if found then return jsonb_build_object('status','ACTIVE_RECOVERABLE_JOB_EXISTS','job_id',recovery,'created',false); end if;
  return public.archive_knowledge_semantic_job_prepare_admission_v1(p_job_type,p_source_kind,p_source_ref,p_source_sha256,
    p_work_key,p_policy_version,p_policy_sha256,p_policy_pin,p_main_sha,p_semantic_context,p_initial_status,p_blocker_code);
end;
$$;
create or replace function public.archive_knowledge_semantic_job_list_active()
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(j)-'semantic_result'-'semantic_context'-'policy_pin' order by prepared_at),'[]'::jsonb)
  from survival_ops.knowledge_semantic_jobs j where status not in('PUBLISHED','HOLD','BLOCKED')
    or survival_ops.knowledge_main_drift_recoverable(j);
$$;
create or replace function public.archive_knowledge_semantic_job_list_handled()
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('job_type',job_type,'source_kind',source_kind,'source_ref',source_ref,
    'source_sha256',source_sha256,'work_key',work_key,'status',status,'blocker_code',blocker_code,
    'blocker_stage',blocker_stage,'result_decision',result_decision,
    'recovery_available',coalesce(survival_ops.knowledge_main_drift_recoverable(j),false)) order by prepared_at),'[]'::jsonb)
  from survival_ops.knowledge_semantic_jobs j where status in('PUBLISHED','HOLD','BLOCKED');
$$;
