-- Verify renderer success is no longer misclassified as provider failure.
begin;

do $$
declare
  v_job_id text:='test-render-state-handoff';
  v_prompt_sha text:=repeat('d',64);
  v_point text:='point-'||repeat('a',64);
  v_generation text:='generation-'||repeat('b',64);
  v_png_b64 text:='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';
  v_png bytea;
  v_source_sha text;
  v_provider jsonb;
  v_lease jsonb;
  v_token uuid;
  v_begin jsonb;
  v_final jsonb;
  v_status text;
  v_provider_failures smallint;
  v_ingest_failures smallint;
  v_blocker_stage text;
begin
  v_png:=decode(v_png_b64,'base64');
  v_source_sha:=encode(extensions.digest(v_png,'sha256'),'hex');

  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,
    active_provider,prompt_contract,prompt_text,prompt_sha256,attempt_no,
    status,lease_owner,lease_until,last_heartbeat_at
  ) values (
    v_job_id,(clock_timestamp() at time zone 'Asia/Seoul')::date,repeat('c',40),
    v_point,v_generation,'loc-test','Test location',
    'native_chatgpt','illustration-image-prompt-v1','positive visual prompt',
    v_prompt_sha,1,'PREPARED','archive-illustration-prep',
    clock_timestamp()+interval '12 hours',clock_timestamp()
  );

  begin
    perform public.archive_illustration_render_job_provider_complete(
      v_job_id,repeat('e',64)
    );
    raise exception 'EXPECTED_PROVIDER_BINDING_REJECTION';
  exception
    when sqlstate '22023' then
      if sqlerrm<>'ILLUSTRATION_PROVIDER_COMPLETE_BINDING_INVALID' then
        raise;
      end if;
  end;

  v_provider:=public.archive_illustration_render_job_provider_complete(
    v_job_id,v_prompt_sha
  );
  if v_provider->>'status'<>'INGESTING' then
    raise exception 'PROVIDER_COMPLETE_DID_NOT_ENTER_INGESTING';
  end if;

  select status into v_status
  from survival_ops.illustration_render_jobs
  where job_id=v_job_id;
  if v_status<>'INGESTING' then
    raise exception 'RENDER_JOB_NOT_INGESTING';
  end if;

  v_lease:=public.archive_illustration_render_job_lease_acquire(
    v_job_id,'test-reviewer',600
  );
  if v_lease->>'status'<>'LEASE_ACQUIRED' then
    raise exception 'LEASE_NOT_ACQUIRED';
  end if;
  v_token:=(v_lease->>'lease_token')::uuid;

  v_begin:=public.archive_illustration_review_staging_begin(
    jsonb_build_object(
      'job_id',v_job_id,
      'lease_token',v_token,
      'staging_id','test-render-state-handoff-stage',
      'point_id',v_point,
      'generation_key',v_generation,
      'subject_id','loc-test',
      'source_sha256',v_source_sha,
      'byte_count',octet_length(v_png),
      'width',1,
      'height',1,
      'mime_type','image/png',
      'chunk_count',1,
      'provider_asset_id','chatgpt-library:test-render-state'
    )
  );
  if v_begin->>'status'<>'UPLOADING' then
    raise exception 'STAGING_BEGIN_FAILED';
  end if;

  perform public.archive_illustration_review_staging_chunk_put(
    v_job_id,v_token,'test-render-state-handoff-stage',0,v_png_b64
  );

  v_final:=public.archive_illustration_review_staging_finalize(
    v_job_id,v_token,'test-render-state-handoff-stage'
  );
  if v_final->>'status'<>'READY' then
    raise exception 'STAGING_FINALIZE_FAILED';
  end if;

  select status into v_status
  from survival_ops.illustration_render_jobs
  where job_id=v_job_id;
  if v_status<>'READY_FOR_REVIEW' then
    raise exception 'RENDER_JOB_NOT_READY_FOR_REVIEW';
  end if;

  -- Simulate an interrupted ingest cycle. The stale sweep must charge INGEST,
  -- never PROVIDER, once renderer success has been recorded.
  update survival_ops.illustration_render_jobs
  set status='INGESTING',
      lease_until=clock_timestamp()-interval '1 second'
  where job_id=v_job_id;

  perform public.archive_illustration_render_jobs_sweep_stale();

  select provider_failure_count,ingest_failure_count,blocker_stage
    into v_provider_failures,v_ingest_failures,v_blocker_stage
  from survival_ops.illustration_render_jobs
  where job_id=v_job_id;

  if v_provider_failures<>0
     or v_ingest_failures<>1
     or v_blocker_stage<>'INGEST' then
    raise exception 'INGEST_FAILURE_MISCLASSIFIED';
  end if;
end
$$;

rollback;
