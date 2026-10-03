\set ON_ERROR_STOP on
begin;

do $verify$
declare
  v_prepared jsonb;
  v_current jsonb;
  v_submit jsonb;
  v_claimed jsonb;
  v_updated jsonb;
  v_inbox jsonb;
  v_detail jsonb;
  v_review jsonb;
  v_decision jsonb;
  v_job_id uuid;
  v_source_ref text := 'synthetic://knowledge-inbox/high-risk';
  v_result jsonb;
begin
  if has_function_privilege('anon','public.archive_operator_knowledge_inbox()','EXECUTE')
     or has_function_privilege('anon','public.archive_operator_knowledge_job_detail(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.archive_operator_knowledge_inbox()','EXECUTE')
     or not has_function_privilege('authenticated','public.archive_operator_knowledge_job_detail(uuid)','EXECUTE') then
    raise exception 'Knowledge Inbox RPC grants are incorrect';
  end if;

  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000004"}',true);
  begin
    perform public.archive_operator_knowledge_inbox();
    raise exception 'non-operator unexpectedly accessed Knowledge Inbox';
  exception when insufficient_privilege then
    if sqlerrm <> 'SURVIVAL_ARCHIVE_OPERATOR_FORBIDDEN' then raise; end if;
  end;

  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',true);
  v_inbox := public.archive_operator_knowledge_inbox();
  if (v_inbox->>'total_count')::integer <> 0 then
    raise exception 'empty Knowledge Inbox was not empty: %', v_inbox;
  end if;

  v_prepared := public.archive_knowledge_semantic_job_prepare(
    'FRESH_BRIEF','PUBLIC_ARCHIVE',v_source_ref,repeat('a',64),
    'knowledge-inbox-high-risk','c3-inbox-test-v1',repeat('b',64),
    '{"synthetic":true}'::jsonb,repeat('1',40),
    '{"source":{"kind":"PUBLIC_ARCHIVE"},"target":{"brief_id":"K-999","candidate_id":"KC-inbox-high-risk"}}'::jsonb,
    'PREPARED',null
  );
  v_job_id := (v_prepared->>'job_id')::uuid;

  v_inbox := public.archive_operator_knowledge_inbox();
  if (v_inbox->>'working_count')::integer <> 1
     or v_inbox->'items'->0->>'job_id' <> v_job_id::text
     or v_inbox->'items'->0->>'brief_id' <> 'K-999' then
    raise exception 'PREPARED item was not visible in Knowledge Inbox: %', v_inbox;
  end if;

  v_result := jsonb_build_object(
    'version','knowledge-semantic-result-v1',
    'job_id',v_job_id::text,
    'decision','HUMAN_REVIEW',
    'code','HIGH_RISK_MEDICAL',
    'note','Strong question retained for human review.',
    'candidate',jsonb_build_object(
      'id','KC-inbox-high-risk',
      'brief_id','K-999',
      'topic_id','T-INBOX',
      'status','BRIEF_PROPOSED',
      'question','고위험 질문',
      'source_kind','PUBLIC_ARCHIVE',
      'source_manifest_ref',v_source_ref,
      'source_manifest_sha256',repeat('a',64)
    ),
    'evidence',jsonb_build_object(
      'brief_id','K-999',
      'question','고위험 질문',
      'claims',jsonb_build_array(jsonb_build_object(
        'claim','Synthetic high-risk claim',
        'source_ids',jsonb_build_array('S1'),
        'context','Synthetic context',
        'limitation','Synthetic limitation'
      ))
    ),
    'brief',jsonb_build_object(
      'id','K-999',
      'topic_id','T-INBOX',
      'title','고위험 질문',
      'content_type','BRIEF',
      'status','READY',
      'risk_level','HIGH',
      'publication_policy','HUMAN_APPROVED',
      'semantic_qa_status','REVIEW'
    )
  );
  v_submit := public.archive_knowledge_semantic_job_submit(v_job_id,v_source_ref,repeat('a',64),v_result);
  if v_submit->>'status' <> 'ACCEPTED' then
    raise exception 'HUMAN_REVIEW submit failed: %', v_submit;
  end if;

  v_claimed := public.archive_knowledge_semantic_job_claim_finalizer();
  if v_claimed->>'job_id' <> v_job_id::text then
    raise exception 'finalizer claim missed Knowledge Inbox job: %', v_claimed;
  end if;
  v_updated := public.archive_knowledge_semantic_job_update(
    v_job_id,'FINALIZING','HUMAN_REVIEW',null,null,999,
    'knowledge/worker/semantic-' || v_job_id::text,repeat('c',40),null
  );
  if v_updated->>'status' <> 'HUMAN_REVIEW' then
    raise exception 'HUMAN_REVIEW transition failed: %', v_updated;
  end if;

  v_inbox := public.archive_operator_knowledge_inbox();
  if (v_inbox->>'review_count')::integer <> 1
     or v_inbox->'items'->0->>'title' <> '고위험 질문'
     or v_inbox->'items'->0->>'risk_level' <> 'HIGH'
     or v_inbox->'items'->0->>'code' <> 'HIGH_RISK_MEDICAL' then
    raise exception 'HUMAN_REVIEW package was not retained in Knowledge Inbox: %', v_inbox;
  end if;

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_review := public.archive_worker_enqueue_review_item(
    'C_KNOWLEDGE:K-999:' || repeat('c',40),
    'C_KNOWLEDGE','KNOWLEDGE',null,'P1',
    '고위험 질문','Synthetic high-risk review item.','HIGH',
    'https://github.com/cetin072/survival-interactive-series/blob/' || repeat('c',40) || '/knowledge/content/briefs/K-999.json',
    jsonb_build_object(
      'brief_id','K-999',
      'head_sha',repeat('c',40),
      'decision','HUMAN_REVIEW',
      'reason_codes',jsonb_build_array('HIGH_RISK_MEDICAL'),
      'pr_number',999,
      'head_ref','knowledge/worker/semantic-' || v_job_id::text
    )
  );
  if v_review->>'status' <> 'PENDING' then
    raise exception 'review queue item was not created: %', v_review;
  end if;

  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',true);
  v_inbox := public.archive_operator_knowledge_inbox();
  if v_inbox->'items'->0->>'review_item_id' <> v_review->>'id'
     or v_inbox->'items'->0->>'review_status' <> 'PENDING' then
    raise exception 'Knowledge Inbox did not link existing human review: %', v_inbox;
  end if;

  v_detail := public.archive_operator_knowledge_job_detail(v_job_id);
  if v_detail->'result'->>'decision' <> 'HUMAN_REVIEW'
     or v_detail->'result'->'candidate'->>'id' <> 'KC-inbox-high-risk'
     or v_detail->'result'->'brief'->>'id' <> 'K-999'
     or v_detail->>'review_item_id' <> v_review->>'id'
     or v_detail->>'review_status' <> 'PENDING' then
    raise exception 'Knowledge Inbox detail did not preserve/link the full package: %', v_detail;
  end if;

  v_decision := public.archive_operator_decide_review_item(
    (v_review->>'id')::uuid,'APPROVED','Approved from Knowledge Inbox test.'
  );
  if v_decision->>'status' <> 'APPROVED' then
    raise exception 'Knowledge Inbox approval reuse failed: %', v_decision;
  end if;
  v_detail := public.archive_operator_knowledge_job_detail(v_job_id);
  if v_detail->>'review_status' <> 'APPROVED'
     or v_detail->>'review_decision_note' <> 'Approved from Knowledge Inbox test.' then
    raise exception 'Knowledge Inbox did not reflect review decision: %', v_detail;
  end if;

  v_updated := public.archive_knowledge_semantic_job_update(
    v_job_id,'HUMAN_REVIEW','PUBLISHED',null,null,999,
    'knowledge/worker/semantic-' || v_job_id::text,repeat('c',40),repeat('d',40)
  );
  if v_updated->>'status' <> 'PUBLISHED' then
    raise exception 'PUBLISHED promotion failed: %', v_updated;
  end if;
  v_inbox := public.archive_operator_knowledge_inbox();
  if (v_inbox->>'published_count')::integer <> 1
     or (v_inbox->>'review_count')::integer <> 0 then
    raise exception 'published item did not remain as Inbox history: %', v_inbox;
  end if;

  v_source_ref := 'synthetic://knowledge-inbox/duplicate';
  v_prepared := public.archive_knowledge_semantic_job_prepare(
    'FRESH_BRIEF','PUBLIC_ARCHIVE',v_source_ref,repeat('e',64),
    'knowledge-inbox-hold','c3-inbox-test-v1',repeat('b',64),
    '{"synthetic":true}'::jsonb,repeat('1',40),
    '{"source":{"kind":"PUBLIC_ARCHIVE"},"target":{"brief_id":"K-1000","candidate_id":"KC-inbox-hold"}}'::jsonb,
    'PREPARED',null
  );
  v_job_id := (v_prepared->>'job_id')::uuid;
  v_result := jsonb_build_object(
    'version','knowledge-semantic-result-v1',
    'job_id',v_job_id::text,
    'decision','HOLD',
    'code','SEMANTIC_DUPLICATE',
    'note','Duplicate idea retained as history.'
  );
  v_submit := public.archive_knowledge_semantic_job_submit(v_job_id,v_source_ref,repeat('e',64),v_result);
  v_claimed := public.archive_knowledge_semantic_job_claim_finalizer();
  v_updated := public.archive_knowledge_semantic_job_update(v_job_id,'FINALIZING','HOLD','SEMANTIC_DUPLICATE','SEMANTIC');

  v_inbox := public.archive_operator_knowledge_inbox();
  if (v_inbox->>'total_count')::integer <> 2
     or (v_inbox->>'held_count')::integer <> 1
     or (v_inbox->>'published_count')::integer <> 1 then
    raise exception 'HOLD/PUBLISHED history counts are incorrect: %', v_inbox;
  end if;
end
$verify$;

rollback;
