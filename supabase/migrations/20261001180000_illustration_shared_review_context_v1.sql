-- Automation B: bind Renderer and Reviewer to one immutable shared visual context.
-- Additive and backward-compatible: existing/legacy jobs may keep all context fields NULL.

alter table survival_ops.illustration_render_jobs
  add column if not exists review_context_version text,
  add column if not exists review_context_sha256 text,
  add column if not exists review_context jsonb;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='illustration_render_jobs_review_context_check'
      and conrelid='survival_ops.illustration_render_jobs'::regclass
  ) then
    alter table survival_ops.illustration_render_jobs
      add constraint illustration_render_jobs_review_context_check check (
        (
          review_context_version is null
          and review_context_sha256 is null
          and review_context is null
        )
        or
        (
          review_context_version is not null
          and review_context_sha256 is not null
          and review_context is not null
          and review_context_version='illustration-review-context-v1'
          and review_context_sha256 ~ '^[a-f0-9]{64}$'
          and jsonb_typeof(review_context)='object'
          and coalesce(review_context->>'version','')=review_context_version
          and coalesce(review_context->>'point_id','')=point_id
          and coalesce(review_context->>'generation_key','')=generation_key
          and coalesce(review_context->>'subject_id','')=subject_id
          and coalesce(review_context->>'point_type','') in ('CHARACTER','LOCATION','EVENT')
          and jsonb_typeof(review_context->'visual_brief')='object'
          and jsonb_typeof(review_context->'visual_profile')='object'
          and coalesce(review_context->'visual_profile'->>'node_id','')=subject_id
          and lower(coalesce(review_context->>'point_type',''))=coalesce(review_context->'visual_profile'->>'type','')
          and jsonb_typeof(review_context->'visual_profile'->'render_cues')='array'
          and coalesce(review_context->'cue_semantics'->>'render_cues','')='ALLOWED_NOT_REQUIRED_NOT_NEW_CANON'
        )
      );
  end if;
end
$migration$;

-- New enqueues require a complete shared-context snapshot. The legacy internal
-- enqueue remains the bounded queue implementation; this wrapper validates and
-- persists the new binding atomically in the same transaction.
create or replace function public.archive_illustration_render_job_enqueue(p_job jsonb)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,survival_ops,archive_ops as $function$
declare
  v_result jsonb;
  v_job_id text;
begin
  if coalesce(jsonb_typeof(p_job),'')<>'object'
     or p_job->>'job_id' is null
     or p_job->>'main_sha' !~ '^[a-f0-9]{40}$'
     or p_job->>'point_id' !~ '^point-[a-f0-9]{64}$'
     or p_job->>'generation_key' !~ '^generation-[a-f0-9]{64}$'
     or p_job->>'subject_id' !~ '^(char|loc|event)-[a-z0-9]+(-[a-z0-9]+)*$'
     or p_job->>'title' is null
     or p_job->>'active_provider' not in ('native_chatgpt','api_openai','manual_import')
     or p_job->>'prompt_contract'<>'illustration-image-prompt-v1'
     or p_job->>'prompt_text' is null
     or length(p_job->>'prompt_text')<20
     or length(p_job->>'prompt_text')>12000
     or p_job->>'prompt_sha256' !~ '^[a-f0-9]{64}$'
     or coalesce(p_job->>'review_context_version','')<>'illustration-review-context-v1'
     or coalesce(p_job->>'review_context_sha256','') !~ '^[a-f0-9]{64}$'
     or coalesce(jsonb_typeof(p_job->'review_context'),'')<>'object'
     or coalesce(p_job->'review_context'->>'version','')<>coalesce(p_job->>'review_context_version','')
     or coalesce(p_job->'review_context'->>'point_id','')<>coalesce(p_job->>'point_id','')
     or coalesce(p_job->'review_context'->>'generation_key','')<>coalesce(p_job->>'generation_key','')
     or coalesce(p_job->'review_context'->>'subject_id','')<>coalesce(p_job->>'subject_id','')
     or coalesce(p_job->'review_context'->>'point_type','') not in ('CHARACTER','LOCATION','EVENT')
     or coalesce(jsonb_typeof(p_job->'review_context'->'visual_brief'),'')<>'object'
     or coalesce(jsonb_typeof(p_job->'review_context'->'visual_profile'),'')<>'object'
     or coalesce(p_job->'review_context'->'visual_profile'->>'node_id','')<>coalesce(p_job->>'subject_id','')
     or lower(coalesce(p_job->'review_context'->>'point_type',''))<>coalesce(p_job->'review_context'->'visual_profile'->>'type','')
     or coalesce(jsonb_typeof(p_job->'review_context'->'visual_profile'->'render_cues'),'')<>'array'
     or coalesce(p_job->'review_context'->'cue_semantics'->>'render_cues','')<>'ALLOWED_NOT_REQUIRED_NOT_NEW_CANON'
  then
    raise exception 'INVALID_ILLUSTRATION_REVIEW_CONTEXT' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('illustration-render-enqueue'));
  perform public.archive_illustration_render_jobs_sweep_stale();
  v_result:=public.archive_illustration_render_job_enqueue_validated_internal(p_job);

  if v_result->>'status'='PREPARED' then
    v_job_id:=v_result->>'job_id';
    update survival_ops.illustration_render_jobs set
      review_context_version=p_job->>'review_context_version',
      review_context_sha256=p_job->>'review_context_sha256',
      review_context=p_job->'review_context',
      updated_at=clock_timestamp()
    where job_id=v_job_id;
    if not found then
      raise exception 'ILLUSTRATION_REVIEW_CONTEXT_PERSIST_FAILED' using errcode='22023';
    end if;
    v_result:=v_result || jsonb_build_object(
      'review_context_version',p_job->>'review_context_version',
      'review_context_sha256',p_job->>'review_context_sha256'
    );
  end if;
  return v_result;
end
$function$;

revoke all on function public.archive_illustration_render_job_enqueue(jsonb) from public,anon,authenticated;
grant execute on function public.archive_illustration_render_job_enqueue(jsonb) to service_role;

-- The lease wrapper also binds the review decision to the exact immutable
-- context hash. Legacy rows with NULL review_context_sha256 retain the old path.
create or replace function public.archive_illustration_review_complete(p_review jsonb)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,survival_ops as $function$
declare
  v_token uuid;
  v_job_id text:=p_review->>'job_id';
  v_result jsonb;
  v_decision text:=p_review->>'decision';
  v_job survival_ops.illustration_render_jobs%rowtype;
begin
  begin
    v_token:=(p_review->>'lease_token')::uuid;
  exception when others then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end;

  perform public.archive_illustration_assert_job_lease(v_job_id,v_token,array['PREPARED']);
  select * into v_job from survival_ops.illustration_render_jobs where job_id=v_job_id;
  if not found then
    raise exception 'ILLUSTRATION_RENDER_JOB_NOT_FOUND' using errcode='22023';
  end if;

  if v_job.review_context_sha256 is not null
     and (
       p_review->>'review_context_sha256' is null
       or p_review->>'review_context_sha256' is distinct from v_job.review_context_sha256
     ) then
    raise exception 'ILLUSTRATION_REVIEW_CONTEXT_MISMATCH' using errcode='22023';
  end if;

  v_result:=public.archive_illustration_review_complete_unleased_internal(
    p_review-'lease_token'-'review_context_sha256'
  );

  update survival_ops.illustration_render_jobs set
    lease_owner=null,
    lease_token=null,
    lease_until=case when v_decision='HUMAN_REVIEW' then clock_timestamp()+interval '7 days' else null end,
    last_heartbeat_at=case when v_decision='HUMAN_REVIEW' then clock_timestamp() else last_heartbeat_at end,
    updated_at=clock_timestamp()
  where job_id=v_job_id
    and status=case when v_decision='PASS' then 'FINALIZE_QUEUED'
      when v_decision='REJECT' then 'REVIEW_REJECTED' else 'HUMAN_REVIEW' end;

  return v_result;
end
$function$;

revoke all on function public.archive_illustration_review_complete(jsonb) from public,anon,authenticated;
grant execute on function public.archive_illustration_review_complete(jsonb) to service_role;

notify pgrst, 'reload schema';
