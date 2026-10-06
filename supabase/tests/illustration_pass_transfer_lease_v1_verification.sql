-- PASS transfer lease regression; fixture and dispatch stub roll back.
begin;
-- Serialize this rollback-only fixture against Prep/worker writes. Existing
-- active rows are hidden only within this transaction, never committed.
lock table survival_ops.illustration_render_jobs in share row exclusive mode;
update survival_ops.illustration_render_jobs set status='BLOCKED'
where status in ('PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW',
  'REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING');
create or replace function archive_ops.dispatch_afterfall_illustration_finalize(p_job_id text)
returns bigint language sql volatile security definer set search_path=pg_catalog as $$
  select -999::bigint
$$;
do $$
declare
  v_job text:='test-pass-transfer-lease-0001';
  v_stage text:='test-pass-transfer-lease-stage-0001';
  v_png_b64 text:='iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAgeSURBVHhe7dYxAQAgDMAwZHFzzr+fIaQ54iHnvlkAoEUAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBIAAAgSAAAIEgAACBn9gMFf2m1ul45PQAAAABJRU5ErkJggg==';
  v_png bytea;
  v_sha text;
  v_lease jsonb;
  v_token uuid;
  v_result jsonb;
  v_status text;
  v_state text;
begin
  v_png:=decode(v_png_b64,'base64');
  v_sha:=encode(extensions.digest(v_png,'sha256'),'hex');
  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,
    active_provider,prompt_contract,prompt_text,prompt_sha256,attempt_no,
    status,review_decision,review_provider,reviewed_at,provider_asset_id
  ) values (
    v_job,date '2098-01-01',repeat('a',40),'point-'||repeat('1',64),
    'generation-'||repeat('2',64),'loc-pass-lease-fixture','PASS lease fixture',
    'native_chatgpt','illustration-image-prompt-v1','Rollback-only PASS transfer lease fixture.',
    repeat('3',64),1,'REVIEW_PASS_STAGED','PASS','native_chatgpt_vision',
    clock_timestamp(),'chatgpt-library:test-pass-transfer-lease'
  );
  v_lease:=public.archive_illustration_render_job_lease_acquire(v_job,'test-native-transfer',600);
  v_token:=(v_lease->>'lease_token')::uuid;
  select status into v_status from survival_ops.illustration_render_jobs where job_id=v_job;
  if v_lease->>'status'<>'LEASE_ACQUIRED' or v_status<>'REVIEW_PASS_STAGED' then
    raise exception 'PASS_TRANSFER_LEASE_CHANGED_JOB_STATE';
  end if;
  v_result:=public.archive_illustration_review_staging_resume(v_job,v_token);
  if v_result->>'status'<>'NO_STAGING' then raise exception 'PASS_TRANSFER_RESUME_NOT_EMPTY'; end if;
  v_result:=public.archive_illustration_site_staging_begin(jsonb_build_object(
    'job_id',v_job,'lease_token',v_token,'staging_id',v_stage,
    'point_id','point-'||repeat('1',64),'generation_key','generation-'||repeat('2',64),
    'subject_id','loc-pass-lease-fixture','source_sha256',v_sha,
    'byte_count',octet_length(v_png),'width',512,'height',512,
    'mime_type','image/png','chunk_count',1,
    'provider_asset_id','chatgpt-library:test-pass-transfer-lease'
  ));
  if v_result->>'status'<>'UPLOADING' then raise exception 'PASS_TRANSFER_STAGING_BEGIN_FAILED'; end if;
  perform public.archive_illustration_review_staging_chunk_put(v_job,v_token,v_stage,0,v_png_b64);
  -- Preserve exact partial staging across lease expiry, then send no duplicate
  -- chunks after a fresh lease. Never regenerate or change the PASS decision.
  update survival_ops.illustration_render_jobs
  set lease_until=clock_timestamp()-interval '1 second' where job_id=v_job;
  begin
    perform public.archive_illustration_review_staging_resume(v_job,v_token);
    raise exception 'EXPIRED_TRANSFER_LEASE_ACCEPTED';
  exception when sqlstate '22023' then
    if sqlerrm not like 'ILLUSTRATION_LEASE_%' then raise; end if;
  end;
  v_lease:=public.archive_illustration_render_job_lease_acquire(v_job,'test-native-transfer-resume',600);
  v_token:=(v_lease->>'lease_token')::uuid;
  v_result:=public.archive_illustration_review_staging_resume(v_job,v_token);
  if v_lease->>'status'<>'LEASE_ACQUIRED'
     or v_result->>'staging_id'<>v_stage
     or v_result->>'source_sha256'<>v_sha
     or v_result->'stored_chunk_indexes'<>'[0]'::jsonb
     or v_result->>'point_id'<>'point-'||repeat('1',64)
     or v_result->>'generation_key'<>'generation-'||repeat('2',64)
     or v_result->>'subject_id'<>'loc-pass-lease-fixture' then
    raise exception 'PASS_TRANSFER_EXACT_STAGING_NOT_RESUMED';
  end if;
  v_result:=public.archive_illustration_site_staging_finalize(v_job,v_token,v_stage);
  select status into v_status from survival_ops.illustration_render_jobs where job_id=v_job;
  if v_result->>'status'<>'FINALIZE_QUEUED' or v_status<>'FINALIZE_QUEUED'
     or v_result->>'dispatch_request_id'<>'-999' then
    raise exception 'PASS_TRANSFER_DID_NOT_QUEUE_FINALIZER';
  end if;
  v_lease:=public.archive_illustration_render_job_lease_acquire(v_job,'test-finalizer',600);
  select status into v_status from survival_ops.illustration_render_jobs where job_id=v_job;
  if v_lease->>'status'<>'LEASE_ACQUIRED' or v_status<>'FINALIZING' then
    raise exception 'FINALIZER_QUEUED_LEASE_STATE_INVALID';
  end if;
  update survival_ops.illustration_render_jobs set lease_owner=null,lease_token=null,lease_until=null where job_id=v_job;
  v_lease:=public.archive_illustration_render_job_lease_acquire(v_job,'test-finalizer',600);
  select status into v_status from survival_ops.illustration_render_jobs where job_id=v_job;
  if v_lease->>'status'<>'LEASE_ACQUIRED' or v_status<>'FINALIZING' then
    raise exception 'FINALIZER_REACQUIRE_STATE_INVALID';
  end if;
  foreach v_state in array array['PREPARED','INGESTING','READY_FOR_REVIEW'] loop
    update survival_ops.illustration_render_jobs
    set status=v_state,lease_owner=null,lease_token=null,lease_until=null where job_id=v_job;
    v_lease:=public.archive_illustration_render_job_lease_acquire(v_job,'test-existing-worker',600);
    select status into v_status from survival_ops.illustration_render_jobs where job_id=v_job;
    if v_lease->>'status'<>'LEASE_ACQUIRED' or v_status<>v_state then
      raise exception 'EXISTING_LEASE_STATE_CHANGED:%',v_state;
    end if;
  end loop;
  foreach v_state in array array['REVIEW_REJECTED','HUMAN_REVIEW'] loop
    update survival_ops.illustration_render_jobs
    set status=v_state,lease_owner=null,lease_token=null,lease_until=null where job_id=v_job;
    begin
      perform public.archive_illustration_render_job_lease_acquire(v_job,'test-existing-worker',600);
      raise exception 'TERMINAL_REVIEW_LEASE_ACCEPTED:%',v_state;
    exception when sqlstate '22023' then
      if sqlerrm<>'ILLUSTRATION_LEASE_STATE_INVALID' then raise; end if;
    end;
  end loop;
end $$;
rollback;
