\set ON_ERROR_STOP on

do $test$
declare
  v_point text := 'point-' || repeat('a',64);
  v_generation text := 'generation-' || repeat('b',64);
  v_result jsonb;
  v_job jsonb;
begin
  insert into survival_rpg.visual_assets(status,source,object_path,generation_meta)
  values (
    'READY',
    jsonb_build_object(
      'point_id',v_point,
      'generation_key',v_generation,
      'subject_id','loc-registry-test',
      'source_sha256',repeat('9',64)
    ),
    'survival-archive-originals/AFTERFALL/test.png',
    jsonb_build_object('storage_verified',true)
  );

  v_job := jsonb_build_object(
    'job_id','illustration-loc-registry-test-bbbbbbbbbbbb-20261002',
    'main_sha',repeat('c',40),
    'point_id',v_point,
    'generation_key',v_generation,
    'subject_id','loc-registry-test',
    'title','Registry test',
    'active_provider','native_chatgpt',
    'prompt_contract','illustration-image-prompt-v1',
    'prompt_text','registry duplicate verification prompt text',
    'prompt_sha256',repeat('d',64),
    'review_context_version','illustration-review-context-v1',
    'review_context_sha256',repeat('e',64),
    'review_context',jsonb_build_object(
      'version','illustration-review-context-v1',
      'point_id',v_point,
      'generation_key',v_generation,
      'subject_id','loc-registry-test',
      'point_type','LOCATION',
      'visual_brief','{}'::jsonb,
      'visual_profile',jsonb_build_object(
        'node_id','loc-registry-test',
        'type','location',
        'render_cues','[]'::jsonb
      ),
      'cue_semantics',jsonb_build_object(
        'render_cues','ALLOWED_NOT_REQUIRED_NOT_NEW_CANON'
      )
    )
  );

  v_result := public.archive_illustration_render_job_enqueue(v_job);
  if v_result->>'status' <> 'ILLUSTRATION_ALREADY_REGISTERED' then
    raise exception 'expected ILLUSTRATION_ALREADY_REGISTERED, got %', v_result;
  end if;
  if exists(
    select 1 from survival_ops.illustration_render_jobs
    where point_id=v_point and generation_key=v_generation
  ) then
    raise exception 'duplicate Registry asset unexpectedly created a render job';
  end if;
end
$test$;
