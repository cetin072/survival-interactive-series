-- Human review is durable history, not machine execution.
drop index survival_ops.knowledge_semantic_jobs_one_active;
create unique index knowledge_semantic_jobs_one_active on survival_ops.knowledge_semantic_jobs ((true))
  where status in ('PREPARED','SUBMITTED','FINALIZING','PR_OPEN');

create or replace function public.archive_knowledge_semantic_job_list_active()
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(j)-'semantic_result'-'semantic_context'-'policy_pin' order by prepared_at),'[]'::jsonb)
  from survival_ops.knowledge_semantic_jobs j
  where status in ('PREPARED','SUBMITTED','FINALIZING','PR_OPEN') or survival_ops.knowledge_main_drift_recoverable(j);
$$;
create or replace function public.archive_knowledge_semantic_job_list_handled()
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('job_type',job_type,'source_kind',source_kind,'source_ref',source_ref,
    'source_sha256',source_sha256,'work_key',work_key,'status',status,'blocker_code',blocker_code,
    'blocker_stage',blocker_stage,'result_decision',result_decision,
    'brief_id',semantic_context->'target'->>'brief_id',
    'recovery_available',coalesce(survival_ops.knowledge_main_drift_recoverable(j),false)) order by prepared_at),'[]'::jsonb)
  from survival_ops.knowledge_semantic_jobs j where status in ('HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED');
$$;
create or replace function public.archive_knowledge_semantic_job_prepare(
  p_job_type text,p_source_kind text,p_source_ref text,p_source_sha256 text,p_work_key text,
  p_policy_version text,p_policy_sha256 text,p_policy_pin jsonb,p_main_sha text,p_semantic_context jsonb,
  p_initial_status text default 'PREPARED',p_blocker_code text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing survival_ops.knowledge_semantic_jobs%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(724015);
  select * into existing from survival_ops.knowledge_semantic_jobs j
    where survival_ops.knowledge_main_drift_recoverable(j) order by prepared_at limit 1;
  if found then return jsonb_build_object('status','ACTIVE_RECOVERABLE_JOB_EXISTS','job_id',existing.job_id,'created',false); end if;
  select * into existing from survival_ops.knowledge_semantic_jobs
    where work_key=p_work_key or (source_kind=p_source_kind and source_ref=p_source_ref
      and source_sha256=p_source_sha256 and job_type=p_job_type) order by prepared_at limit 1;
  if found then return jsonb_build_object('status','EXISTING_JOB','job_id',existing.job_id,'job_status',existing.status,'created',false); end if;
  if p_semantic_context->'target'->>'brief_id' is null
    or p_semantic_context->'target'->>'brief_id' !~ '^K-[0-9]+$' then
    raise exception 'KNOWLEDGE_SEMANTIC_TARGET_INVALID';
  end if;
  if exists(select 1 from survival_ops.knowledge_semantic_jobs
      where semantic_context->'target'->>'brief_id'=p_semantic_context->'target'->>'brief_id') then
    return jsonb_build_object('status','BRIEF_RESERVED','created',false);
  end if;
  select * into existing from survival_ops.knowledge_semantic_jobs
    where status in ('PREPARED','SUBMITTED','FINALIZING','PR_OPEN') order by prepared_at limit 1;
  if found then return jsonb_build_object('status','ACTIVE_JOB_EXISTS','job_id',existing.job_id,'job_status',existing.status,'created',false); end if;
  -- Retain the existing validation, KST four-per-day cap and source unique constraint.
  return public.archive_knowledge_semantic_job_prepare_admission_v1(p_job_type,p_source_kind,p_source_ref,p_source_sha256,
    p_work_key,p_policy_version,p_policy_sha256,p_policy_pin,p_main_sha,p_semantic_context,p_initial_status,p_blocker_code);
end;
$$;

create or replace function survival_ops.dispatch_knowledge_semantic_finalizer()
returns bigint language plpgsql security definer set search_path='' as $$
declare request_id bigint;
begin
  if not exists(select 1 from survival_ops.knowledge_semantic_jobs
    where status='SUBMITTED'
      or (status='FINALIZING' and finalizing_at < clock_timestamp()-interval '15 minutes')
      or (status='PR_OPEN' and updated_at < clock_timestamp()-interval '5 minutes')) then return null; end if;
  request_id := survival_ops.dispatch_knowledge_workflow('knowledge-semantic-finalizer.yml','semantic_submit');
  update survival_ops.knowledge_semantic_jobs
    set finalizer_dispatch_count=least(finalizer_dispatch_count+1,100000),
      finalizer_dispatch_at=clock_timestamp(),finalizer_dispatch_request_id=request_id
    where status='SUBMITTED'
      or (status='FINALIZING' and finalizing_at < clock_timestamp()-interval '15 minutes')
      or (status='PR_OPEN' and updated_at < clock_timestamp()-interval '5 minutes');
  return request_id;
end;
$$;

-- Complete C3 history in the existing approval consumer transaction, once.
-- The original receipt RPC retains authentication and approval timestamp checks.
alter function public.archive_worker_record_review_consumption(uuid,timestamptz,text,jsonb)
  rename to archive_worker_record_review_consumption_v1;
revoke all on function public.archive_worker_record_review_consumption_v1(uuid,timestamptz,text,jsonb)
  from public,anon,authenticated,service_role;
create function public.archive_worker_record_review_consumption(
  p_item_id uuid,p_decided_at timestamptz,p_outcome text,p_result jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt jsonb; review survival_ops.archive_review_items%rowtype; job survival_ops.knowledge_semantic_jobs%rowtype;
  prepared text; merged text;
begin
  receipt := public.archive_worker_record_review_consumption_v1(p_item_id,p_decided_at,p_outcome,p_result);
  if receipt->>'outcome' <> 'CONSUMED' then return receipt; end if;
  select * into review from survival_ops.archive_review_items where id=p_item_id;
  select * into job from survival_ops.knowledge_semantic_jobs
    where final_pr_number=(review.payload->>'pr_number')::integer
      and final_head_ref=review.payload->>'head_ref'
      and semantic_context->'target'->>'brief_id'=review.payload->>'brief_id' for update;
  if not found or job.status='PUBLISHED' then return receipt; end if;
  prepared := receipt->'result'->>'prepared_sha';
  merged := receipt->'result'->>'merge_sha';
  if job.status <> 'HUMAN_REVIEW' or job.result_decision <> 'HUMAN_REVIEW'
    or prepared is null or prepared !~ '^[a-f0-9]{40}$' or merged is null or merged !~ '^[a-f0-9]{40}$'
    or receipt->'result'->>'brief_id' is distinct from review.payload->>'brief_id'
    or not exists(select 1 from survival_ops.knowledge_review_publication_attempts a
      where a.job_id=job.job_id and a.review_item_id=p_item_id and a.decided_at=p_decided_at
        and a.prepared_head_sha=prepared and a.semantic_result_sha256=job.semantic_result_sha256)
    then raise exception 'KNOWLEDGE_REVIEW_CONSUMPTION_BINDING_INVALID'; end if;
  perform public.archive_knowledge_semantic_job_update(job.job_id,'HUMAN_REVIEW','PUBLISHED',
    null,null,null,null,prepared,merged);
  return receipt;
end;
$$;
revoke all on function public.archive_worker_record_review_consumption(uuid,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.archive_worker_record_review_consumption(uuid,timestamptz,text,jsonb) to service_role;
