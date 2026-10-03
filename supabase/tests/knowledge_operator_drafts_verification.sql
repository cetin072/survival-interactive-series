\set ON_ERROR_STOP on
begin;

do $verify$
declare
  v_prepared jsonb;
  v_submit jsonb;
  v_claimed jsonb;
  v_updated jsonb;
  v_review jsonb;
  v_get jsonb;
  v_saved jsonb;
  v_published jsonb;
  v_worker jsonb;
  v_job_id uuid;
  v_source_ref text := 'synthetic://knowledge-operator-draft/source';
  v_head_sha text := repeat('c',40);
  v_result jsonb;
  v_draft jsonb;
  v_original_sha text;
begin
  if has_function_privilege('anon','public.archive_operator_knowledge_draft_get(uuid)','EXECUTE')
     or has_function_privilege('anon','public.archive_operator_knowledge_draft_save(uuid,integer,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.archive_operator_knowledge_publish(uuid,integer,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.archive_operator_knowledge_draft_get(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.archive_operator_knowledge_draft_save(uuid,integer,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.archive_operator_knowledge_publish(uuid,integer,text)','EXECUTE')
     or has_function_privilege('authenticated','public.archive_worker_knowledge_operator_draft(uuid,integer,text)','EXECUTE')
     or not has_function_privilege('service_role','public.archive_worker_knowledge_operator_draft(uuid,integer,text)','EXECUTE') then
    raise exception 'Knowledge operator draft RPC grants are incorrect';
  end if;

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_prepared := public.archive_knowledge_semantic_job_prepare(
    'BACKFILL_BRIEF','PUBLIC_ARCHIVE',v_source_ref,repeat('a',64),
    'knowledge-operator-draft-fixture','c3-editor-test-v1',repeat('b',64),
    '{"test":true}'::jsonb,repeat('1',40),
    jsonb_build_object(
      'source',jsonb_build_object('kind','PUBLIC_ARCHIVE'),
      'target',jsonb_build_object('brief_id','K-998','candidate_id','KC-operator-editor')
    ),
    'PREPARED',null
  );
  v_job_id := (v_prepared->>'job_id')::uuid;

  v_result := jsonb_build_object(
    'version','knowledge-semantic-result-v1',
    'job_id',v_job_id::text,
    'decision','HUMAN_REVIEW',
    'code','HIGH_RISK_REVIEW',
    'note','Complete draft retained for operator review.',
    'candidate',jsonb_build_object(
      'id','KC-operator-editor','brief_id','K-998','topic_id','T-EDITOR',
      'status','BRIEF_PROPOSED','question','고위험 완성 초안 질문',
      'source_kind','PUBLIC_ARCHIVE','source_manifest_ref',v_source_ref,'source_manifest_sha256',repeat('a',64)
    ),
    'evidence',jsonb_build_object(
      'brief_id','K-998','question','고위험 완성 초안 질문',
      'claims',jsonb_build_array(jsonb_build_object(
        'claim','Synthetic claim','source_ids',jsonb_build_array('S1'),
        'context','Synthetic context','limitation','Synthetic limitation'
      ))
    ),
    'brief',jsonb_build_object(
      'id','K-998','slug','operator-editor-fixture','topic_id','T-EDITOR',
      'content_type','BRIEF','status','READY','risk_level','HIGH',
      'publication_policy','HUMAN_APPROVED','semantic_qa_status','REVIEW',
      'risk_domains',jsonb_build_array('MEDICAL'),
      'source_checked_at','2026-10-04','published_at','2026-10-04','updated_at','2026-10-04',
      'title','고위험 완성 초안 질문','label','테스트','summary','초기 요약',
      'meta_description','초기 검색 설명','lead','초기 도입','scope','초기 범위',
      'basis','초기 근거','footer','초기 주의문','editorial_note','초기 편집 메모',
      'sections',jsonb_build_array(jsonb_build_object(
        'heading','초기 섹션',
        'blocks',jsonb_build_array(jsonb_build_object('type','prose','text','초기 본문'))
      )),
      'sources',jsonb_build_array(jsonb_build_object(
        'id','S1','url','https://example.gov/test','title','공식 테스트 자료',
        'note','테스트','checked_at','2026-10-04'
      )),
      'tools','[]'::jsonb,'story_refs','[]'::jsonb,'related_brief_ids','[]'::jsonb,
      'guide_id',null,'ai_assisted',true
    )
  );

  v_submit := public.archive_knowledge_semantic_job_submit(v_job_id,v_source_ref,repeat('a',64),v_result);
  if v_submit->>'status' <> 'ACCEPTED' then raise exception 'semantic submit failed: %', v_submit; end if;
  select semantic_result_sha256 into v_original_sha from survival_ops.knowledge_semantic_jobs where job_id=v_job_id;

  v_claimed := public.archive_knowledge_semantic_job_claim_finalizer();
  if v_claimed->>'job_id' <> v_job_id::text then raise exception 'finalizer claim failed: %', v_claimed; end if;
  v_updated := public.archive_knowledge_semantic_job_update(
    v_job_id,'FINALIZING','HUMAN_REVIEW',null,null,998,'knowledge/worker/semantic-editor-fixture',v_head_sha,null
  );
  if v_updated->>'status' <> 'HUMAN_REVIEW' then raise exception 'human review transition failed: %', v_updated; end if;

  v_review := public.archive_worker_enqueue_review_item(
    'TEST:knowledge-operator-editor:'||v_job_id::text,
    'C_KNOWLEDGE','KNOWLEDGE',null,'P1','고위험 완성 초안 질문',
    'Operator draft fixture','HIGH',
    'https://github.com/cetin072/survival-interactive-series/blob/'||v_head_sha||'/knowledge/content/briefs/K-998.json',
    jsonb_build_object('brief_id','K-998','head_sha',v_head_sha,'pr_number',998,'head_ref','knowledge/worker/semantic-editor-fixture')
  );
  if v_review->>'status' <> 'PENDING' then raise exception 'review queue fixture failed: %', v_review; end if;

  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000004"}',true);
  begin
    perform public.archive_operator_knowledge_draft_get(v_job_id);
    raise exception 'viewer unexpectedly accessed draft editor';
  exception when insufficient_privilege then
    if sqlerrm <> 'SURVIVAL_ARCHIVE_OPERATOR_FORBIDDEN' then raise; end if;
  end;

  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',true);
  v_get := public.archive_operator_knowledge_draft_get(v_job_id);
  if (v_get->>'editable')::boolean is not true or (v_get->>'revision')::integer <> 0
     or v_get->'brief'->>'title' <> '고위험 완성 초안 질문' then
    raise exception 'initial operator draft view invalid: %', v_get;
  end if;

  v_draft := v_get->'brief';
  v_draft := jsonb_set(v_draft,'{summary}',to_jsonb('사람이 수정한 요약'::text),false);
  v_draft := jsonb_set(
    v_draft,'{sections}',
    jsonb_build_array(jsonb_build_object(
      'heading','사람이 편집한 섹션',
      'blocks',jsonb_build_array(
        jsonb_build_object('type','prose','text','사람이 작성한 본문'),
        jsonb_build_object('type','image','src','https://example.gov/image.webp','alt','테스트 이미지','caption','이미지 캡션'),
        jsonb_build_object('type','youtube','url','https://youtu.be/dQw4w9WgXcQ','title','테스트 영상')
      )
    )),false
  );

  v_saved := public.archive_operator_knowledge_draft_save(v_job_id,0,v_draft);
  if (v_saved->>'revision')::integer <> 1 or v_saved->'brief'->>'summary' <> '사람이 수정한 요약' then
    raise exception 'operator draft save failed: %', v_saved;
  end if;
  if (select semantic_result_sha256 from survival_ops.knowledge_semantic_jobs where job_id=v_job_id) <> v_original_sha then
    raise exception 'immutable semantic result changed during operator edit';
  end if;

  begin
    perform public.archive_operator_knowledge_draft_save(v_job_id,0,v_draft);
    raise exception 'stale draft revision unexpectedly saved';
  exception when serialization_failure then
    if sqlerrm <> 'KNOWLEDGE_OPERATOR_DRAFT_REVISION_CONFLICT' then raise; end if;
  end;

  v_published := public.archive_operator_knowledge_publish(v_job_id,1,'사람이 확인한 공개 승인');
  if v_published->>'status' <> 'APPROVED' then
    raise exception 'operator publish approval failed: %', v_published;
  end if;

  if not exists (
    select 1 from survival_ops.archive_review_items
    where id=(v_review->>'id')::uuid
      and status='APPROVED'
      and payload->>'operator_job_id'=v_job_id::text
      and (payload->>'operator_draft_revision')::integer=1
      and payload->>'operator_draft_sha256'=v_saved->>'draft_sha256'
  ) then
    raise exception 'review approval was not bound to exact operator draft';
  end if;

  begin
    perform public.archive_operator_knowledge_draft_save(v_job_id,1,v_draft);
    raise exception 'approved draft unexpectedly remained editable';
  exception when serialization_failure then
    if sqlerrm <> 'KNOWLEDGE_OPERATOR_DRAFT_ALREADY_APPROVED' then raise; end if;
  end;

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_worker := public.archive_worker_knowledge_operator_draft(v_job_id,1,v_saved->>'draft_sha256');
  if v_worker->>'brief_id' <> 'K-998'
     or v_worker->'brief'->>'summary' <> '사람이 수정한 요약'
     or v_worker->>'draft_sha256' <> v_saved->>'draft_sha256' then
    raise exception 'worker exact draft readback failed: %', v_worker;
  end if;

  begin
    perform public.archive_worker_knowledge_operator_draft(v_job_id,1,repeat('f',64));
    raise exception 'wrong draft hash unexpectedly read';
  exception when no_data_found then
    if sqlerrm <> 'KNOWLEDGE_OPERATOR_DRAFT_BINDING_NOT_FOUND' then raise; end if;
  end;
end
$verify$;

rollback;
