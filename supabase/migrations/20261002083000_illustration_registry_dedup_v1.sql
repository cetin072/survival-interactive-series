-- Automation B: reject duplicate render jobs when the exact point/generation
-- already has a READY, Storage-verified Registry asset.
-- This is a fail-safe behind repository-side candidate deduplication.

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

  if exists(
    select 1
    from survival_rpg.visual_assets a
    where a.status='READY'
      and a.source->>'point_id'=p_job->>'point_id'
      and a.source->>'generation_key'=p_job->>'generation_key'
      and nullif(a.object_path,'') is not null
      and coalesce(a.generation_meta->>'storage_verified','false')='true'
  ) then
    return jsonb_build_object(
      'status','ILLUSTRATION_ALREADY_REGISTERED',
      'point_id',p_job->>'point_id',
      'generation_key',p_job->>'generation_key',
      'subject_id',p_job->>'subject_id'
    );
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

notify pgrst, 'reload schema';
