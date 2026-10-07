-- Isolated CI database only. Never run fixtures/dispatcher replacement on live DB.
begin;
create or replace function archive_ops.dispatch_afterfall_illustration_finalize(text)
returns bigint language sql as $$ select -999::bigint $$;
create function pg_temp.expect_denied(s jsonb,w jsonb,idle boolean) returns void language plpgsql as $$
begin
  begin
    perform public.archive_illustration_recover_preserved_shelter(s,w,idle);
  exception when sqlstate '22023' then return;
  end;
  raise exception 'RECOVERY_SHOULD_HAVE_BEEN_DENIED';
end $$;
do $$
declare
  sid text:='illustration-event-shelter-22e758f3837c-20261007-37526903478';
  wid text:='illustration-event-wide-area-248abb2775d8-20261007-37560662605';
  tid text:='site-'||sid;
  sh text:=encode(extensions.digest(convert_to(repeat('a',72),'UTF8'),'sha256'),'hex');
  s jsonb; w jsonb; r jsonb; k text; before_count integer;
begin
  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,
    prompt_contract,prompt_text,prompt_sha256,attempt_no,status,review_decision,
    blocker_code,blocker_stage,last_error_stage,output_sha256,output_bytes,output_width,
    output_height,provider_asset_id,review_staging_id,review_context_version,review_context_sha256,review_context,
    finalizer_failure_count,lease_until
  ) values (
    sid,(clock_timestamp() at time zone 'Asia/Seoul')::date,repeat('a',40),'point-'||repeat('b',64),
    'generation-'||repeat('c',64),'event-shelter','Shelter','native_chatgpt',
    'illustration-image-prompt-v1','A deterministic visual prompt for isolated recovery tests.',repeat('d',64),1,
    'BLOCKED','PASS','FINALIZER_IDENTITY_EXISTING_CONFLICT','PROGRAM_FINALIZER','PROGRAM_FINALIZER',
    sh,72,512,512,'chatgpt-library:file_fixture',tid,'illustration-review-context-v1',repeat('e',64),
    jsonb_build_object('version','illustration-review-context-v1','point_id','point-'||repeat('b',64),
      'generation_key','generation-'||repeat('c',64),'subject_id','event-shelter','point_type','EVENT',
      'visual_brief','{}'::jsonb,'visual_profile',jsonb_build_object('node_id','event-shelter','type','event','render_cues','[]'::jsonb),
      'cue_semantics',jsonb_build_object('render_cues','ALLOWED_NOT_REQUIRED_NOT_NEW_CANON')),1,null
  ), (
    wid,(clock_timestamp() at time zone 'Asia/Seoul')::date,repeat('a',40),'point-'||repeat('f',64),
    'generation-'||repeat('1',64),'event-wide-area','Wide area','native_chatgpt',
    'illustration-image-prompt-v1','A different preserved candidate visual prompt.',repeat('2',64),1,
    'PREPARED',null,null,null,null,null,null,null,null,null,null,null,null,null,0,clock_timestamp()+interval '12 hours'
  );
  insert into survival_ops.illustration_review_staging(staging_id,job_id,point_id,generation_key,subject_id,
    source_sha256,byte_count,width,height,mime_type,chunk_count,provider_asset_id,status)
  values(tid,sid,'point-'||repeat('b',64),'generation-'||repeat('c',64),'event-shelter',sh,72,512,512,'image/png',2,'chatgpt-library:file_fixture','READY');
  insert into survival_ops.illustration_review_staging_chunks(staging_id,chunk_index,chunk_b64)
  values(tid,0,encode(convert_to(repeat('a',36),'UTF8'),'base64')),(tid,1,encode(convert_to(repeat('a',36),'UTF8'),'base64'));
  select to_jsonb(j) into s from survival_ops.illustration_render_jobs j where job_id=sid;
  select to_jsonb(j) into w from survival_ops.illustration_render_jobs j where job_id=wid;
  -- Reproduce active-slot wait with the actual existing admission function.
  r:=public.archive_illustration_render_job_enqueue(s);
  if r->>'status'<>'WAITING_EXISTING_JOB' then raise exception 'MUTUAL_WAIT_NOT_REPRODUCED'; end if;
  perform pg_temp.expect_denied(s,w,false);
  foreach k in array array['job_id','output_sha256','provider_asset_id','review_staging_id','point_id','generation_key','prompt_sha256'] loop
    perform pg_temp.expect_denied(jsonb_set(s,array[k],'"mismatch"'::jsonb),w,true);
  end loop;
  update survival_ops.illustration_render_jobs set lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '1 hour' where job_id=wid;
  perform pg_temp.expect_denied(s,(select to_jsonb(j) from survival_ops.illustration_render_jobs j where job_id=wid),true);
  update survival_ops.illustration_render_jobs set lease_token=null,lease_until=(w->>'lease_until')::timestamptz where job_id=wid;
  update survival_ops.illustration_render_jobs set status='INGESTING' where job_id=wid;
  perform pg_temp.expect_denied(s,(select to_jsonb(j) from survival_ops.illustration_render_jobs j where job_id=wid),true);
  update survival_ops.illustration_render_jobs set status='PREPARED' where job_id=wid;
  update survival_ops.illustration_review_staging set provider_asset_id='wrong' where staging_id=tid;
  perform pg_temp.expect_denied(s,w,true);
  update survival_ops.illustration_review_staging set provider_asset_id='chatgpt-library:file_fixture' where staging_id=tid;
  update survival_ops.illustration_review_staging_chunks set chunk_b64='YmFk' where staging_id=tid and chunk_index=1;
  perform pg_temp.expect_denied(s,w,true);
  update survival_ops.illustration_review_staging_chunks set chunk_b64=encode(convert_to(repeat('a',36),'UTF8'),'base64') where staging_id=tid and chunk_index=1;
  perform set_config('role','anon',true);
  begin
    perform public.archive_illustration_recover_preserved_shelter(s,w,true);
    raise exception 'ANON_WAS_ALLOWED';
  exception when insufficient_privilege then null; end;
  perform set_config('role','authenticated',true);
  begin
    perform public.archive_illustration_recover_preserved_shelter(s,w,true);
    raise exception 'AUTH_WAS_ALLOWED';
  exception when insufficient_privilege then null; end;
  perform set_config('role','service_role',true);
  r:=public.archive_illustration_recover_preserved_shelter(s,w,true);
  if r->>'status'<>'FINALIZE_QUEUED' then raise exception 'RECOVERY_FAILED'; end if;
  r:=public.archive_illustration_recover_preserved_shelter(s,w,true);
  if r->>'status'<>'ALREADY_RECOVERED' then raise exception 'NOT_IDEMPOTENT'; end if;
  perform set_config('role','postgres',true);
  if (select to_jsonb(j)-array['status','blocker_code','blocker_stage','last_error_code','last_error_stage','lease_owner','lease_token','lease_until','updated_at'] from survival_ops.illustration_render_jobs j where job_id=wid)
    is distinct from w-array['status','blocker_code','blocker_stage','last_error_code','last_error_stage','lease_owner','lease_token','lease_until','updated_at'] then
    raise exception 'CANDIDATE_OR_HISTORY_CHANGED';
  end if;
  if (select count(*) from survival_ops.illustration_review_staging_chunks where staging_id=tid)<>2
    or (select finalizer_failure_count from survival_ops.illustration_render_jobs where job_id=sid)<>1
    or (select count(*) from survival_ops.illustration_render_jobs where job_id in(sid,wid))<>2 then raise exception 'PRESERVATION_FAILED'; end if;
end $$;
rollback;
