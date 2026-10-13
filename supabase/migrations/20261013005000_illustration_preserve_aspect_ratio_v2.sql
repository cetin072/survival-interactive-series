-- Automation B image transport v2: preserve the reviewed image aspect ratio.
-- The public/stored transfer still caps the long edge at 512px and keeps the
-- existing byte/chunk limits, but no longer stretches every image to 512x512.

create or replace function public.archive_illustration_site_staging_begin(p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','survival_ops'
as $function$
declare
  v_token uuid;
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_row survival_ops.illustration_review_staging%rowtype;
  v_stored integer:=0;
  v_width integer:=coalesce((p_meta->>'width')::integer,0);
  v_height integer:=coalesce((p_meta->>'height')::integer,0);
begin
  begin
    v_token:=(p_meta->>'lease_token')::uuid;
  exception when others then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end;

  perform public.archive_illustration_assert_job_lease(
    p_meta->>'job_id',
    v_token,
    array['REVIEW_PASS_STAGED']
  );

  select * into v_job
  from survival_ops.illustration_render_jobs
  where job_id=p_meta->>'job_id'
  for update;

  if not found or v_job.review_decision<>'PASS' then
    raise exception 'ILLUSTRATION_PASS_TRANSFER_STATE_INVALID' using errcode='22023';
  end if;

  if p_meta->>'staging_id' !~ '^[a-z0-9][a-z0-9._:-]{7,159}$'
     or p_meta->>'point_id'<>v_job.point_id
     or p_meta->>'generation_key'<>v_job.generation_key
     or p_meta->>'subject_id'<>v_job.subject_id
     or p_meta->>'source_sha256' !~ '^[a-f0-9]{64}$'
     or coalesce((p_meta->>'byte_count')::integer,0) not between 1 and 1000000
     or v_width not between 1 and 512
     or v_height not between 1 and 512
     or greatest(v_width,v_height)<>512
     or p_meta->>'mime_type'<>'image/png'
     or coalesce((p_meta->>'chunk_count')::integer,0) not between 1 and 8
     or p_meta->>'provider_asset_id' is distinct from v_job.provider_asset_id then
    raise exception 'INVALID_ILLUSTRATION_SITE_STAGING_META' using errcode='22023';
  end if;

  perform public.archive_illustration_assert_source_fresh(
    v_job.job_id,
    p_meta->>'source_sha256'
  );

  select * into v_row
  from survival_ops.illustration_review_staging
  where job_id=v_job.job_id
  for update;

  if found then
    if v_row.point_id<>v_job.point_id
       or v_row.generation_key<>v_job.generation_key
       or v_row.subject_id<>v_job.subject_id
       or v_row.source_sha256<>p_meta->>'source_sha256'
       or v_row.byte_count<>(p_meta->>'byte_count')::integer
       or v_row.width<>v_width
       or v_row.height<>v_height
       or v_row.mime_type<>'image/png'
       or v_row.chunk_count<>(p_meta->>'chunk_count')::integer
       or v_row.provider_asset_id<>v_job.provider_asset_id then
      raise exception 'ILLUSTRATION_SITE_STAGING_CONFLICT' using errcode='22023';
    end if;
  else
    insert into survival_ops.illustration_review_staging(
      staging_id,job_id,point_id,generation_key,subject_id,source_sha256,
      byte_count,width,height,mime_type,chunk_count,provider_asset_id,status
    ) values (
      p_meta->>'staging_id',v_job.job_id,v_job.point_id,v_job.generation_key,v_job.subject_id,
      p_meta->>'source_sha256',(p_meta->>'byte_count')::integer,v_width,v_height,'image/png',
      (p_meta->>'chunk_count')::integer,v_job.provider_asset_id,'UPLOADING'
    )
    returning * into v_row;
  end if;

  select count(*)::integer into v_stored
  from survival_ops.illustration_review_staging_chunks
  where staging_id=v_row.staging_id;

  update survival_ops.illustration_render_jobs
  set ingest_expected_chunk_count=v_row.chunk_count::smallint,
      ingest_uploaded_chunk_count=least(v_stored,128)::smallint,
      updated_at=clock_timestamp()
  where job_id=v_job.job_id
    and lease_token=v_token
    and status='REVIEW_PASS_STAGED';

  perform public.archive_illustration_render_job_lease_heartbeat(
    v_job.job_id,
    v_token,
    600
  );

  return jsonb_build_object(
    'status',v_row.status,
    'staging_id',v_row.staging_id,
    'job_id',v_row.job_id,
    'point_id',v_row.point_id,
    'generation_key',v_row.generation_key,
    'subject_id',v_row.subject_id,
    'source_sha256',v_row.source_sha256,
    'byte_count',v_row.byte_count,
    'width',v_row.width,
    'height',v_row.height,
    'mime_type',v_row.mime_type,
    'chunk_count',v_row.chunk_count,
    'provider_asset_id',v_row.provider_asset_id,
    'stored_chunk_count',v_stored
  );
end
$function$;

create or replace function public.archive_illustration_site_staging_finalize(
  p_job_id text,
  p_lease_token uuid,
  p_staging_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','survival_ops','archive_ops'
as $function$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_staging survival_ops.illustration_review_staging%rowtype;
  v_result jsonb;
  v_dispatch bigint;
begin
  perform public.archive_illustration_assert_job_lease(
    p_job_id,
    p_lease_token,
    array['REVIEW_PASS_STAGED']
  );

  select * into v_job
  from survival_ops.illustration_render_jobs
  where job_id=p_job_id
  for update;

  select * into v_staging
  from survival_ops.illustration_review_staging
  where staging_id=p_staging_id;

  if not found
     or v_staging.job_id<>p_job_id
     or v_job.review_decision<>'PASS'
     or v_staging.provider_asset_id<>v_job.provider_asset_id then
    raise exception 'ILLUSTRATION_SITE_STAGING_BINDING_INVALID' using errcode='22023';
  end if;

  v_result:=public.archive_illustration_review_staging_finalize_unleased_internal(
    p_staging_id
  );

  if v_result->>'status'<>'READY'
     or v_staging.width not between 1 and 512
     or v_staging.height not between 1 and 512
     or greatest(v_staging.width,v_staging.height)<>512
     or v_staging.mime_type<>'image/png' then
    raise exception 'ILLUSTRATION_SITE_STAGING_FINALIZE_FAILED' using errcode='22023';
  end if;

  update survival_ops.illustration_render_jobs
  set status='FINALIZE_QUEUED',
      output_sha256=v_staging.source_sha256,
      output_bytes=v_staging.byte_count,
      output_width=v_staging.width,
      output_height=v_staging.height,
      review_staging_id=v_staging.staging_id,
      ingest_expected_chunk_count=v_staging.chunk_count::smallint,
      ingest_uploaded_chunk_count=v_staging.chunk_count::smallint,
      lease_owner=null,
      lease_token=null,
      lease_until=null,
      last_heartbeat_at=clock_timestamp(),
      updated_at=clock_timestamp()
  where job_id=p_job_id
    and lease_token=p_lease_token
    and status='REVIEW_PASS_STAGED';

  if not found then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;

  v_dispatch:=archive_ops.dispatch_afterfall_illustration_finalize(p_job_id);

  update survival_ops.illustration_render_jobs
  set finalizer_dispatch_request_id=v_dispatch,
      finalizer_dispatch_at=clock_timestamp(),
      updated_at=clock_timestamp()
  where job_id=p_job_id
    and status='FINALIZE_QUEUED';

  return v_result || jsonb_build_object(
    'status','FINALIZE_QUEUED',
    'job_id',p_job_id,
    'dispatch_request_id',v_dispatch,
    'review_decision','PASS'
  );
end
$function$;

create or replace function public.archive_illustration_finalizer_recover_check_timeout(
  p_job_id text,
  p_expected_output_sha256 text,
  p_expected_provider_asset_id text,
  p_expected_review_staging_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path='pg_catalog','survival_ops'
as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
begin
  if coalesce(p_job_id,'') !~ '^[a-z0-9][a-z0-9-]{7,119}$'
     or coalesce(p_expected_output_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_expected_provider_asset_id,'') = ''
     or coalesce(p_expected_review_staging_id,'') = '' then
    raise exception 'ILLUSTRATION_FINALIZER_RECOVERY_ARGUMENT_INVALID' using errcode='22023';
  end if;

  select * into v_job
  from survival_ops.illustration_render_jobs
  where job_id=p_job_id
  for update;

  if not found then
    raise exception 'ILLUSTRATION_RENDER_JOB_NOT_FOUND' using errcode='22023';
  end if;

  if v_job.status <> 'BLOCKED'
     or v_job.blocker_code <> 'FINALIZER_PR_CHECKS_NOT_REPORTED_TIMEOUT'
     or v_job.blocker_stage <> 'PROGRAM_FINALIZER'
     or v_job.review_decision <> 'PASS'
     or v_job.output_sha256 is distinct from p_expected_output_sha256
     or v_job.provider_asset_id is distinct from p_expected_provider_asset_id
     or v_job.review_staging_id is distinct from p_expected_review_staging_id
     or coalesce(v_job.output_width,0) not between 1 and 512
     or coalesce(v_job.output_height,0) not between 1 and 512
     or greatest(v_job.output_width,v_job.output_height) <> 512
     or coalesce(v_job.output_bytes,0) <= 0
     or v_job.finalizer_failure_count < 1
     or v_job.finalizer_failure_count >= 5
     or (v_job.lease_token is not null and v_job.lease_until > clock_timestamp()) then
    raise exception 'ILLUSTRATION_FINALIZER_RECOVERY_NOT_ELIGIBLE' using errcode='22023';
  end if;

  update survival_ops.illustration_render_jobs
  set
    status='FINALIZE_QUEUED',
    finalized_at=null,
    blocker_code=null,
    blocker_stage=null,
    last_error_code=null,
    last_error_stage=null,
    lease_owner=null,
    lease_token=null,
    lease_until=null,
    updated_at=clock_timestamp(),
    last_heartbeat_at=clock_timestamp()
  where job_id=p_job_id
  returning * into v_job;

  return jsonb_build_object(
    'status',v_job.status,
    'job_id',v_job.job_id,
    'recovered_from','FINALIZER_PR_CHECKS_NOT_REPORTED_TIMEOUT',
    'finalizer_failure_count',v_job.finalizer_failure_count
  );
end
$$;

revoke all on function public.archive_illustration_site_staging_begin(jsonb)
  from public, anon, authenticated;
grant execute on function public.archive_illustration_site_staging_begin(jsonb)
  to service_role;

revoke all on function public.archive_illustration_site_staging_finalize(text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.archive_illustration_site_staging_finalize(text,uuid,text)
  to service_role;

revoke all on function public.archive_illustration_finalizer_recover_check_timeout(text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.archive_illustration_finalizer_recover_check_timeout(text,text,text,text)
  to service_role;

notify pgrst,'reload schema';
