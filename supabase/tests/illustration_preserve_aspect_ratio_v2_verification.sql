begin;

do $$
declare
  v_begin text;
  v_finalize text;
  v_recover text;
begin
  select pg_get_functiondef(
    'public.archive_illustration_site_staging_begin(jsonb)'::regprocedure
  ) into v_begin;
  if position('greatest(v_width,v_height)<>512' in replace(v_begin,' ',''))=0
     or position('v_row.width<>v_width' in replace(v_begin,' ',''))=0
     or position('v_row.height<>v_height' in replace(v_begin,' ',''))=0 then
    raise exception 'ILLUSTRATION_ASPECT_RATIO_BEGIN_CONTRACT_INVALID';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_site_staging_finalize(text,uuid,text)'::regprocedure
  ) into v_finalize;
  if position('greatest(v_staging.width,v_staging.height)<>512' in replace(v_finalize,' ',''))=0 then
    raise exception 'ILLUSTRATION_ASPECT_RATIO_FINALIZE_CONTRACT_INVALID';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_finalizer_recover_check_timeout(text,text,text,text)'::regprocedure
  ) into v_recover;
  if position('greatest(v_job.output_width,v_job.output_height)<>512' in replace(v_recover,' ',''))=0 then
    raise exception 'ILLUSTRATION_ASPECT_RATIO_RECOVERY_CONTRACT_INVALID';
  end if;
end
$$;

insert into survival_ops.illustration_render_jobs(
  job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,
  active_provider,prompt_contract,prompt_text,prompt_sha256,attempt_no,status,
  review_provider,review_decision,provider_asset_id,
  lease_owner,lease_token,lease_until,last_heartbeat_at
) values (
  'illustration-event-aspect-test-0001',
  current_date,
  repeat('a',40),
  'point-'||repeat('b',64),
  'generation-'||repeat('c',64),
  'event-aspect-test',
  'Aspect ratio test',
  'native_chatgpt',
  'illustration-image-prompt-v1',
  'test prompt',
  repeat('d',64),
  1,
  'REVIEW_PASS_STAGED',
  'native_chatgpt_vision',
  'PASS',
  'chatgpt-library:file-aspect-test',
  'aspect-test-owner',
  '00000000-0000-0000-0000-000000000001'::uuid,
  clock_timestamp()+interval '10 minutes',
  clock_timestamp()
);

do $$
declare
  v_result jsonb;
begin
  v_result:=public.archive_illustration_site_staging_begin(
    jsonb_build_object(
      'job_id','illustration-event-aspect-test-0001',
      'lease_token','00000000-0000-0000-0000-000000000001',
      'staging_id','site-aspect-test-0001',
      'point_id','point-'||repeat('b',64),
      'generation_key','generation-'||repeat('c',64),
      'subject_id','event-aspect-test',
      'source_sha256',repeat('e',64),
      'byte_count',100,
      'width',512,
      'height',256,
      'mime_type','image/png',
      'chunk_count',1,
      'provider_asset_id','chatgpt-library:file-aspect-test'
    )
  );

  if v_result->>'status'<>'UPLOADING'
     or (v_result->>'width')::integer<>512
     or (v_result->>'height')::integer<>256 then
    raise exception 'ILLUSTRATION_ASPECT_RATIO_BEGIN_REJECTED';
  end if;

  if not exists(
    select 1
    from survival_ops.illustration_review_staging
    where job_id='illustration-event-aspect-test-0001'
      and width=512
      and height=256
  ) then
    raise exception 'ILLUSTRATION_ASPECT_RATIO_STAGING_NOT_PRESERVED';
  end if;
end
$$;

rollback;
