-- Automation B: make review staging resumable/abortable without weakening lease binding.
-- This fixes interrupted Library -> private staging transfers while keeping the
-- existing exact job/SHA/dimension validation and service-role-only boundary.

create or replace function public.archive_illustration_review_staging_resume(
  p_job_id text,
  p_lease_token uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog,public,survival_ops
as $$
declare
  v_staging survival_ops.illustration_review_staging%rowtype;
  v_chunk_indexes jsonb;
begin
  perform public.archive_illustration_assert_job_lease(
    p_job_id,
    p_lease_token,
    array['PREPARED','INGESTING','READY_FOR_REVIEW']
  );

  select *
    into v_staging
  from survival_ops.illustration_review_staging
  where job_id=p_job_id;

  if not found then
    return jsonb_build_object(
      'status','NO_STAGING',
      'job_id',p_job_id,
      'stored_chunk_count',0,
      'stored_chunk_indexes','[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(c.chunk_index order by c.chunk_index),'[]'::jsonb)
    into v_chunk_indexes
  from survival_ops.illustration_review_staging_chunks c
  where c.staging_id=v_staging.staging_id;

  return jsonb_build_object(
    'status',v_staging.status,
    'staging_id',v_staging.staging_id,
    'job_id',v_staging.job_id,
    'point_id',v_staging.point_id,
    'generation_key',v_staging.generation_key,
    'subject_id',v_staging.subject_id,
    'source_sha256',v_staging.source_sha256,
    'byte_count',v_staging.byte_count,
    'width',v_staging.width,
    'height',v_staging.height,
    'mime_type',v_staging.mime_type,
    'chunk_count',v_staging.chunk_count,
    'provider_asset_id',v_staging.provider_asset_id,
    'stored_chunk_count',jsonb_array_length(v_chunk_indexes),
    'stored_chunk_indexes',v_chunk_indexes
  );
end
$$;

create or replace function public.archive_illustration_review_staging_abort(
  p_job_id text,
  p_lease_token uuid,
  p_staging_id text,
  p_source_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog,public,survival_ops
as $$
declare
  v_staging survival_ops.illustration_review_staging%rowtype;
begin
  perform public.archive_illustration_assert_job_lease(
    p_job_id,
    p_lease_token,
    array['PREPARED','INGESTING','READY_FOR_REVIEW']
  );

  select *
    into v_staging
  from survival_ops.illustration_review_staging
  where job_id=p_job_id
  for update;

  if not found then
    return jsonb_build_object('status','NO_STAGING','job_id',p_job_id);
  end if;

  if v_staging.staging_id is distinct from p_staging_id
     or v_staging.source_sha256 is distinct from p_source_sha256 then
    raise exception 'ILLUSTRATION_REVIEW_STAGING_ABORT_BINDING_INVALID'
      using errcode='22023';
  end if;

  if v_staging.status<>'UPLOADING' then
    raise exception 'ILLUSTRATION_REVIEW_STAGING_ABORT_NOT_UPLOADING'
      using errcode='22023';
  end if;

  delete from survival_ops.illustration_review_staging
  where staging_id=v_staging.staging_id;

  return jsonb_build_object(
    'status','ABORTED',
    'job_id',p_job_id,
    'staging_id',p_staging_id,
    'source_sha256',p_source_sha256
  );
end
$$;

revoke all on function public.archive_illustration_review_staging_resume(text,uuid)
  from public,anon,authenticated;
grant execute on function public.archive_illustration_review_staging_resume(text,uuid)
  to service_role;

revoke all on function public.archive_illustration_review_staging_abort(text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.archive_illustration_review_staging_abort(text,uuid,text,text)
  to service_role;

notify pgrst,'reload schema';
