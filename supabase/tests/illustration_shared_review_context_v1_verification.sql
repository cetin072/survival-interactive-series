begin;

do $$
declare
  v_context jsonb := jsonb_build_object(
    'version','illustration-review-context-v1',
    'point_id','point-'||repeat('a',64),
    'generation_key','generation-'||repeat('b',64),
    'subject_id','char-context-test',
    'point_type','CHARACTER',
    'visual_brief',jsonb_build_object(
      'version','visual-brief-v1',
      'point_type','CHARACTER',
      'subject',jsonb_build_object('node_id','char-context-test','label','Context Test'),
      'canon_facts',jsonb_build_object('appearance','confirmed'),
      'art_direction',jsonb_build_object('style_version','AFTERFALL_ARCHIVE_V1'),
      'safeguards',jsonb_build_array('Do not invent facts.')
    ),
    'visual_profile',jsonb_build_object(
      'node_id','char-context-test',
      'type','character',
      'label','Context Test',
      'render_cues',jsonb_build_array('natural posture','used everyday clothing'),
      'canon_policy','CONFIRMED_APPEARANCE_PLUS_EDITORIAL_RENDER_CUES',
      'source_note','public editorial visual layer'
    ),
    'cue_semantics',jsonb_build_object(
      'canon_facts','CONFIRMED_PUBLIC_CANON',
      'render_cues','ALLOWED_NOT_REQUIRED_NOT_NEW_CANON'
    )
  );
  v_hash text := repeat('c',64);
  v_enqueue jsonb;
  v_current jsonb;
  v_lease jsonb;
  v_token uuid;
  v_result jsonb;
  v_legacy_token uuid;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='survival_ops' and table_name='illustration_render_jobs'
      and column_name='review_context'
  ) then
    raise exception 'ILLUSTRATION_REVIEW_CONTEXT_COLUMN_MISSING';
  end if;

  perform set_config('role','service_role',true);

  v_enqueue:=public.archive_illustration_render_job_enqueue(jsonb_build_object(
    'job_id','illustration-char-context-test-aaaaaaaaaaaa-20261001',
    'main_sha',repeat('d',40),
    'point_id','point-'||repeat('a',64),
    'generation_key','generation-'||repeat('b',64),
    'subject_id','char-context-test',
    'title','Context Test',
    'active_provider','native_chatgpt',
    'prompt_contract','illustration-image-prompt-v1',
    'prompt_text','A deterministic visual-only renderer prompt for context verification.',
    'prompt_sha256',repeat('e',64),
    'review_context_version','illustration-review-context-v1',
    'review_context_sha256',v_hash,
    'review_context',v_context
  ));

  if v_enqueue->>'status'<>'PREPARED'
     or v_enqueue->>'review_context_sha256'<>v_hash then
    raise exception 'ILLUSTRATION_REVIEW_CONTEXT_ENQUEUE_FAILED:%',v_enqueue;
  end if;

  v_current:=public.archive_illustration_render_job_current();
  if v_current->>'review_context_version'<>'illustration-review-context-v1'
     or v_current->>'review_context_sha256'<>v_hash
     or v_current->'review_context'->>'subject_id'<>'char-context-test'
     or v_current ? 'prompt_text' then
    raise exception 'ILLUSTRATION_REVIEW_CONTEXT_READBACK_FAILED:%',v_current;
  end if;

  v_lease:=public.archive_illustration_render_job_lease_acquire(
    'illustration-char-context-test-aaaaaaaaaaaa-20261001',
    'review-context-test-run',
    600
  );
  if v_lease->>'status'<>'LEASE_ACQUIRED' then
    raise exception 'ILLUSTRATION_REVIEW_CONTEXT_LEASE_FAILED:%',v_lease;
  end if;
  v_token:=(v_lease->>'lease_token')::uuid;

  begin
    perform public.archive_illustration_review_complete(jsonb_build_object(
      'job_id','illustration-char-context-test-aaaaaaaaaaaa-20261001',
      'lease_token',v_token,
      'review_context_sha256',repeat('f',64),
      'decision','REJECT',
      'review_provider','native_chatgpt_vision',
      'output_sha256',repeat('1',64),
      'output_bytes',100,
      'output_width',10,
      'output_height',10,
      'rejection_codes',jsonb_build_array('TEST')
    ));
    raise exception 'ILLUSTRATION_WRONG_CONTEXT_HASH_ACCEPTED';
  exception when sqlstate '22023' then
    if sqlerrm<>'ILLUSTRATION_REVIEW_CONTEXT_MISMATCH' then raise; end if;
  end;

  v_result:=public.archive_illustration_review_complete(jsonb_build_object(
    'job_id','illustration-char-context-test-aaaaaaaaaaaa-20261001',
    'lease_token',v_token,
    'review_context_sha256',v_hash,
    'decision','REJECT',
    'review_provider','native_chatgpt_vision',
    'output_sha256',repeat('1',64),
    'output_bytes',100,
    'output_width',10,
    'output_height',10,
    'rejection_codes',jsonb_build_array('TEST')
  ));
  if v_result->>'status'<>'REJECT' then
    raise exception 'ILLUSTRATION_MATCHING_CONTEXT_HASH_REJECT_FAILED:%',v_result;
  end if;

  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,
    active_provider,prompt_contract,prompt_text,prompt_sha256,attempt_no,status
  ) values (
    'illustration-char-legacy-test-bbbbbbbbbbbb-20260930',
    (clock_timestamp() at time zone 'Asia/Seoul')::date - 1,
    repeat('d',40),
    'point-'||repeat('2',64),
    'generation-'||repeat('3',64),
    'char-legacy-test',
    'Legacy Context Test',
    'native_chatgpt',
    'illustration-image-prompt-v1',
    'Legacy deterministic prompt.',
    repeat('4',64),
    1,
    'PREPARED'
  );

  v_lease:=public.archive_illustration_render_job_lease_acquire(
    'illustration-char-legacy-test-bbbbbbbbbbbb-20260930',
    'review-context-legacy-run',
    600
  );
  v_legacy_token:=(v_lease->>'lease_token')::uuid;

  v_result:=public.archive_illustration_review_complete(jsonb_build_object(
    'job_id','illustration-char-legacy-test-bbbbbbbbbbbb-20260930',
    'lease_token',v_legacy_token,
    'decision','REJECT',
    'review_provider','native_chatgpt_vision',
    'output_sha256',repeat('5',64),
    'output_bytes',100,
    'output_width',10,
    'output_height',10,
    'rejection_codes',jsonb_build_array('LEGACY_TEST')
  ));
  if v_result->>'status'<>'REJECT' then
    raise exception 'ILLUSTRATION_LEGACY_NULL_CONTEXT_PATH_FAILED:%',v_result;
  end if;

  perform set_config('role','none',true);
end
$$;

rollback;
