-- Reuse the two named cron rows as the durable shared admission switch.
-- GitHub fallback and Supabase dispatch both pass the same DB admission gate.
create or replace function public.archive_knowledge_semantic_prep_enabled()
returns boolean language sql stable security definer set search_path='' as $$
  select count(*)=2 and coalesce(bool_and(active),false) from cron.job
  where jobname in ('afterfall-knowledge-semantic-prep-am','afterfall-knowledge-semantic-prep-pm');
$$;
revoke all on function public.archive_knowledge_semantic_prep_enabled() from public,anon,authenticated;
grant execute on function public.archive_knowledge_semantic_prep_enabled() to service_role;

create or replace function survival_ops.set_knowledge_semantic_prep_enabled(p_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare target record;
begin
  if p_enabled is null then raise exception 'PREP_ENABLED_REQUIRED'; end if;
  if (select count(*) from cron.job where jobname in ('afterfall-knowledge-semantic-prep-am','afterfall-knowledge-semantic-prep-pm')) <> 2 then
    raise exception 'PREP_CRON_IDENTITY_MISSING';
  end if;
  for target in select jobid from cron.job where jobname in ('afterfall-knowledge-semantic-prep-am','afterfall-knowledge-semantic-prep-pm') loop
    perform cron.alter_job(target.jobid,active:=p_enabled);
  end loop;
  return public.archive_knowledge_semantic_prep_enabled();
end;
$$;
revoke all on function survival_ops.set_knowledge_semantic_prep_enabled(boolean) from public,anon,authenticated,service_role;
grant execute on function survival_ops.set_knowledge_semantic_prep_enabled(boolean) to postgres;

create or replace function public.archive_knowledge_semantic_job_prepare(
  p_job_type text,p_source_kind text,p_source_ref text,p_source_sha256 text,p_work_key text,
  p_policy_version text,p_policy_sha256 text,p_policy_pin jsonb,p_main_sha text,p_semantic_context jsonb,
  p_initial_status text default 'PREPARED',p_blocker_code text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing survival_ops.knowledge_semantic_jobs%rowtype;
begin
  if not public.archive_knowledge_semantic_prep_enabled() then
    return jsonb_build_object('status','PREP_PAUSED','created',false);
  end if;
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
