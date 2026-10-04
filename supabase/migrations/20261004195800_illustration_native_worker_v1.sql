-- Automation B Native Worker v1
-- Simplify runtime: one scheduled AI worker, review before transfer, PASS-only site asset staging.
-- Legacy review/Vault functions remain for old jobs but are no longer on the current runtime path.

create or replace function public.archive_illustration_render_job_provider_complete(
  p_job_id text,
  p_prompt_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','survival_ops'
as $function$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
begin
  if coalesce(p_job_id,'')=''
     or coalesce(p_prompt_sha256,'') !~ '^[a-f0-9]{64}$' then
    raise exception 'ILLUSTRATION_PROVIDER_COMPLETE_ARGUMENT_INVALID' using errcode='22023';
  end if;

  select * into v_job
  from survival_ops.illustration_render_jobs
  where job_id=p_job_id
  for update;

  if not found then
    raise exception 'ILLUSTRATION_RENDER_JOB_NOT_FOUND' using errcode='22023';
  end if;

  if v_job.prompt_sha256<>p_prompt_sha256
     or v_job.active_provider<>'native_chatgpt' then
    raise exception 'ILLUSTRATION_PROVIDER_COMPLETE_BINDING_INVALID' using errcode='22023';
  end if;

  if v_job.status='PREPARED' then
    update survival_ops.illustration_render_jobs
    set status='INGESTING',
        provider_completed_at=coalesce(provider_completed_at,clock_timestamp()),
        lease_owner=null,
        lease_token=null,
        lease_until=null,
        last_heartbeat_at=clock_timestamp(),
        last_error_code=null,
        last_error_stage=null,
        blocker_code=null,
        blocker_stage=null,
        updated_at=clock_timestamp()
    where job_id=p_job_id;

    return jsonb_build_object(
      'status','INGESTING',
      'job_id',p_job_id,
      'prompt_sha256',p_prompt_sha256,
      'provider_completed_at',(select provider_completed_at
        from survival_ops.illustration_render_jobs where job_id=p_job_id)
    );
  end if;

  if v_job.status in ('INGESTING','REVIEW_PASS_STAGED','READY_FOR_REVIEW') then
    return jsonb_build_object(
      'status',v_job.status,
      'job_id',p_job_id,
      'prompt_sha256',p_prompt_sha256,
      'provider_completed_at',v_job.provider_completed_at,
      'idempotent',true
    );
  end if;

  raise exception 'ILLUSTRATION_PROVIDER_COMPLETE_STATE_INVALID' using errcode='22023';
end
$function$;

create or replace function public.archive_illustration_review_decide_v3(p_review jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','survival_ops'
as $function$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_token uuid;
  v_decision text:=p_review->>'decision';
  v_target_status text;
begin
  begin
    v_token:=(p_review->>'lease_token')::uuid;
  exception when others then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end;

  perform public.archive_illustration_assert_job_lease(
    p_review->>'job_id',
    v_token,
    array['INGESTING']
  );

  select * into v_job
  from survival_ops.illustration_render_jobs
  where job_id=p_review->>'job_id'
  for update;

  if not found then
    raise exception 'ILLUSTRATION_RENDER_JOB_NOT_FOUND' using errcode='22023';
  end if;

  if v_job.review_context_sha256 is not null
     and p_review->>'review_context_sha256' is distinct from v_job.review_context_sha256 then
    raise exception 'ILLUSTRATION_REVIEW_CONTEXT_MISMATCH' using errcode='22023';
  end if;

  if v_decision not in ('PASS','REJECT','HUMAN_REVIEW')
     or coalesce(p_review->>'review_provider','')=''
     or coalesce(p_review->>'provider_asset_id','')=''
     or jsonb_typeof(coalesce(p_review->'rejection_codes','[]'::jsonb))<>'array' then
    raise exception 'INVALID_ILLUSTRATION_REVIEW' using errcode='22023';
  end if;

  v_target_status:=case
    when v_decision='PASS' then 'REVIEW_PASS_STAGED'
    when v_decision='REJECT' then 'REVIEW_REJECTED'
    else 'HUMAN_REVIEW'
  end;

  update survival_ops.illustration_render_jobs
  set review_provider=p_review->>'review_provider',
      review_decision=v_decision,
      review_summary=nullif(p_review->>'review_summary',''),
      rejection_codes=coalesce(p_review->'rejection_codes','[]'::jsonb),
      provider_asset_id=p_review->>'provider_asset_id',
      reviewed_at=coalesce(reviewed_at,clock_timestamp()),
      status=v_target_status,
      lease_owner=case when v_decision='PASS' then lease_owner else null end,
      lease_token=case when v_decision='PASS' then lease_token else null end,
      lease_until=case
        when v_decision='PASS' then clock_timestamp()+interval '10 minutes'
        when v_decision='HUMAN_REVIEW' then clock_timestamp()+interval '7 days'
        else null
      end,
      last_heartbeat_at=clock_timestamp(),
      last_error_code=null,
      last_error_stage=null,
      blocker_code=null,
      blocker_stage=null,
      updated_at=clock_timestamp()
  where job_id=v_job.job_id
    and lease_token=v_token
    and status='INGESTING';

  if not found then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;

  return jsonb_build_object(
    'status',v_target_status,
    'job_id',v_job.job_id,
    'decision',v_decision,
    'review_recorded',true,
    'transfer_required',(v_decision='PASS')
  );
end
$function$;

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
     or coalesce((p_meta->>'width')::integer,0)<>512
     or coalesce((p_meta->>'height')::integer,0)<>512
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
       or v_row.width<>512
       or v_row.height<>512
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
      p_meta->>'source_sha256',(p_meta->>'byte_count')::integer,512,512,'image/png',
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

create or replace function public.archive_illustration_review_staging_chunk_put(
  p_job_id text,
  p_lease_token uuid,
  p_staging_id text,
  p_chunk_index integer,
  p_chunk_b64 text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','survival_ops'
as $function$
declare
  v_staging_job text;
  v_result jsonb;
  v_expected integer;
  v_stored integer;
begin
  perform public.archive_illustration_assert_job_lease(
    p_job_id,
    p_lease_token,
    array['PREPARED','INGESTING','READY_FOR_REVIEW','REVIEW_PASS_STAGED']
  );

  select job_id,chunk_count into v_staging_job,v_expected
  from survival_ops.illustration_review_staging
  where staging_id=p_staging_id;

  if v_staging_job is distinct from p_job_id then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;

  v_result:=public.archive_illustration_review_staging_chunk_put_unleased_internal(
    p_staging_id,p_chunk_index,p_chunk_b64
  );

  update survival_ops.illustration_review_staging
  set updated_at=clock_timestamp()
  where staging_id=p_staging_id;

  select count(*)::integer into v_stored
  from survival_ops.illustration_review_staging_chunks
  where staging_id=p_staging_id;

  update survival_ops.illustration_render_jobs
  set ingest_expected_chunk_count=v_expected::smallint,
      ingest_uploaded_chunk_count=least(v_stored,128)::smallint,
      updated_at=clock_timestamp()
  where job_id=p_job_id
    and lease_token=p_lease_token;

  if not found then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;

  perform public.archive_illustration_render_job_lease_heartbeat(
    p_job_id,p_lease_token,600
  );

  return v_result || jsonb_build_object(
    'stored_chunk_count',v_stored,
    'expected_chunk_count',v_expected
  );
end
$function$;

create or replace function public.archive_illustration_review_staging_resume(
  p_job_id text,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','survival_ops'
as $function$
declare
  v_staging survival_ops.illustration_review_staging%rowtype;
  v_chunk_indexes jsonb;
begin
  perform public.archive_illustration_assert_job_lease(
    p_job_id,
    p_lease_token,
    array['PREPARED','INGESTING','READY_FOR_REVIEW','REVIEW_PASS_STAGED']
  );

  select * into v_staging
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
     or v_staging.width<>512
     or v_staging.height<>512
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

create or replace function public.archive_illustration_render_jobs_sweep_stale()
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_count integer:=0;
  v_finalizer_dispatch integer:=0;
  v_request bigint;
  v_stage text;
  v_code text;
begin
  for v_job in
    select * from survival_ops.illustration_render_jobs
    where status in (
      'PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW',
      'REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING'
    )
      and lease_until is not null
      and lease_until<=clock_timestamp()
    order by lease_until
    for update skip locked
  loop
    if v_job.status='HUMAN_REVIEW' then
      update survival_ops.illustration_render_jobs
      set status='BLOCKED',
          lease_owner=null,
          lease_token=null,
          lease_until=null,
          last_error_code='HUMAN_REVIEW_SLA_EXPIRED',
          last_error_stage='HUMAN_REVIEW',
          blocker_code='HUMAN_REVIEW_SLA_EXPIRED',
          blocker_stage='HUMAN_REVIEW',
          updated_at=clock_timestamp()
      where job_id=v_job.job_id;

    elsif v_job.status='INGESTING' then
      update survival_ops.illustration_render_jobs
      set status='INGESTING',
          review_failure_count=review_failure_count+case when review_failure_count<3 then 1 else 0 end,
          lease_owner=null,
          lease_token=null,
          lease_until=null,
          last_error_code='REVIEW_LEASE_EXPIRED',
          last_error_stage='REVIEW',
          blocker_code=null,
          blocker_stage=null,
          updated_at=clock_timestamp()
      where job_id=v_job.job_id;

    elsif v_job.status='REVIEW_PASS_STAGED' then
      update survival_ops.illustration_render_jobs
      set status='REVIEW_PASS_STAGED',
          ingest_failure_count=ingest_failure_count+case when ingest_failure_count<3 then 1 else 0 end,
          lease_owner=null,
          lease_token=null,
          lease_until=null,
          last_error_code='PASS_ASSET_TRANSFER_LEASE_EXPIRED',
          last_error_stage='TRANSFER',
          last_ingest_error_code='PASS_ASSET_TRANSFER_LEASE_EXPIRED',
          last_ingest_error_at=clock_timestamp(),
          blocker_code=null,
          blocker_stage=null,
          updated_at=clock_timestamp()
      where job_id=v_job.job_id;

    elsif v_job.status in ('FINALIZE_QUEUED','FINALIZING')
      and v_job.finalizer_failure_count<5 then
      v_request:=public.archive_illustration_finalizer_dispatch_guarded(v_job.job_id);

      update survival_ops.illustration_render_jobs
      set status='FINALIZE_QUEUED',
          finalizer_failure_count=finalizer_failure_count
            +case when v_job.status='FINALIZING' then 1 else 0 end,
          lease_owner=null,
          lease_token=null,
          lease_until=null,
          last_error_code=case when v_job.status='FINALIZING'
            then 'FINALIZER_LEASE_EXPIRED' else last_error_code end,
          last_error_stage=case when v_job.status='FINALIZING'
            then 'FINALIZER' else last_error_stage end,
          finalizer_dispatch_request_id=v_request,
          finalizer_dispatch_at=clock_timestamp(),
          blocker_code=null,
          blocker_stage=null,
          updated_at=clock_timestamp()
      where job_id=v_job.job_id;

      v_finalizer_dispatch:=v_finalizer_dispatch+1;

    else
      v_stage:=case v_job.status
        when 'PREPARED' then 'PROVIDER'
        when 'READY_FOR_REVIEW' then 'REVIEW_LEGACY'
        else 'FINALIZER'
      end;
      v_code:='JOB_LEASE_EXPIRED';

      update survival_ops.illustration_render_jobs
      set status='BLOCKED',
          provider_failure_count=provider_failure_count
            +case when v_stage='PROVIDER' and provider_failure_count<3 then 1 else 0 end,
          review_failure_count=review_failure_count
            +case when v_stage='REVIEW_LEGACY' and review_failure_count<3 then 1 else 0 end,
          finalizer_failure_count=finalizer_failure_count
            +case when v_stage='FINALIZER' and finalizer_failure_count<5 then 1 else 0 end,
          lease_owner=null,
          lease_token=null,
          lease_until=null,
          last_error_code=v_code,
          last_error_stage=v_stage,
          blocker_code=v_code,
          blocker_stage=v_stage,
          updated_at=clock_timestamp()
      where job_id=v_job.job_id;
    end if;

    v_count:=v_count+1;
  end loop;

  return jsonb_build_object(
    'expired_jobs',v_count,
    'finalizer_dispatched',v_finalizer_dispatch
  );
end
$function$;
