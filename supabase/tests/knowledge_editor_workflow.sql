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
  v_receipt_id uuid;
  v_decided_at timestamptz;
  v_collision uuid; v_restored jsonb; v_next jsonb; v_second jsonb; v_request jsonb; v_lease uuid; v_review_copy jsonb; v_old_sha text;
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


  if has_function_privilege('anon','public.archive_operator_knowledge_editor_get(uuid)','EXECUTE')
   or has_function_privilege('authenticated','public.archive_worker_knowledge_editor_request(uuid,text,uuid,jsonb)','EXECUTE')
   or has_table_privilege('authenticated','survival_ops.knowledge_editor_versions','SELECT') then raise exception 'editor access boundary incorrect'; end if;
  v_draft:=v_get->'brief';
  v_saved:=public.archive_operator_knowledge_draft_save(v_job_id,0,v_draft);
  v_old_sha:=v_saved->>'draft_sha256';
  v_review_copy:=jsonb_build_object('claims',v_result->'evidence'->'claims','resolutions','[]'::jsonb);
  v_draft:=jsonb_set(v_draft,'{title}','"사람이 바꾼 질문 제목"');
  v_draft:=jsonb_set(v_draft,'{summary}','"사람이 직접 수정한 요약"');
  v_saved:=public.archive_operator_knowledge_editor_save(v_job_id,1,v_draft,v_review_copy);
  if (v_saved->>'revision')::integer<>2 then raise exception 'editor revision not advanced'; end if;
  if not exists(select 1 from survival_ops.knowledge_editor_versions where job_id=v_job_id and revision=1 and draft_sha256=v_old_sha) then raise exception 'revision one was lost'; end if;
  if (select semantic_result_sha256 from survival_ops.knowledge_semantic_jobs where job_id=v_job_id)<>v_original_sha then raise exception 'original result was changed'; end if;
  begin
   perform public.archive_operator_knowledge_editor_save(v_job_id,1,v_draft,v_review_copy);
   raise exception 'stale save unexpectedly accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
   perform public.archive_operator_knowledge_editor_save(v_job_id,2,jsonb_set(v_draft,'{semantic_qa_status}','"PASS"'),v_review_copy);
   raise exception 'client unexpectedly asserted machine PASS';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_MACHINE_QA_LOCKED' then raise; end if; end;
  perform public.archive_operator_knowledge_editor_action(v_job_id,'ARCHIVE');
  begin
   perform public.archive_operator_knowledge_editor_save(v_job_id,2,v_draft,v_review_copy);
   raise exception 'archived save unexpectedly accepted';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_RESTORE_REQUIRED' then raise; end if; end;
  perform public.archive_operator_knowledge_editor_action(v_job_id,'RESTORE');
  insert into vault.decrypted_secrets(name,decrypted_secret,created_at) values('archive_github_dispatch_token',repeat('t',40),clock_timestamp());
  v_request:=public.archive_operator_knowledge_editor_request(v_job_id,2,false);
  if v_request->>'status'<>'QUEUED' or (v_request->>'publish_requested')::boolean is not false then raise exception 'check request implied approval'; end if;
  if public.archive_operator_knowledge_editor_request(v_job_id,2,false)->>'request_id'<>v_request->>'request_id' then raise exception 'duplicate request created'; end if;
  begin
   perform public.archive_operator_knowledge_editor_save(v_job_id,2,v_draft,v_review_copy);
   raise exception 'in-flight snapshot unexpectedly edited';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_PUBLICATION_ACTIVE' then raise; end if; end;
  v_worker:=public.archive_worker_knowledge_editor_request((v_request->>'request_id')::uuid,'CLAIM');
  v_lease:=(v_worker->>'lease_token')::uuid;
  if public.archive_worker_knowledge_editor_request((v_request->>'request_id')::uuid,'CLAIM')->>'status'<>'BUSY' then raise exception 'double worker claimed'; end if;
  begin
   perform public.archive_worker_knowledge_editor_request((v_request->>'request_id')::uuid,'PUBLISHING',v_lease,'{}');
   raise exception 'check-only request unexpectedly publishing';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_APPROVAL_REQUIRED' then raise; end if; end;
  perform public.archive_worker_knowledge_editor_request((v_request->>'request_id')::uuid,'FAILED',v_lease,'{"reason":"SOURCE_UNAVAILABLE"}');
  v_request:=public.archive_operator_knowledge_editor_request(v_job_id,2,false);
  v_worker:=public.archive_worker_knowledge_editor_request((v_request->>'request_id')::uuid,'CLAIM');
  begin
   perform public.archive_worker_knowledge_editor_request((v_request->>'request_id')::uuid,'CHECKED',v_lease,'{}');
   raise exception 'stale lease unexpectedly accepted';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_LEASE_INVALID' then raise; end if; end;
  v_lease:=(v_worker->>'lease_token')::uuid;
  perform public.archive_worker_knowledge_editor_request((v_request->>'request_id')::uuid,'CHECKED',v_lease,'{"issues":[]}');
  v_request:=public.archive_operator_knowledge_editor_request(v_job_id,2,true);
  v_worker:=public.archive_worker_knowledge_editor_request((v_request->>'request_id')::uuid,'CLAIM');
  v_lease:=(v_worker->>'lease_token')::uuid;
  perform public.archive_worker_knowledge_editor_request((v_request->>'request_id')::uuid,'PUBLISHING',v_lease,'{}');
  begin
   perform public.archive_operator_knowledge_editor_cancel((v_request->>'request_id')::uuid);
   raise exception 'merged-stage request cancellation accepted';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_CANCEL_TOO_LATE' then raise; end if; end;
  begin
   perform public.archive_worker_knowledge_editor_request((v_request->>'request_id')::uuid,'PUBLISHED',v_lease,'{"status":"LIVE_VERIFIED","verified_at":"2026-10-23T00:00:00Z"}');
   raise exception 'missing public proof accepted';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_PUBLIC_PROOF_REQUIRED' then raise; end if; end;
  if (select count(*) from survival_ops.knowledge_editor_events where job_id=v_job_id and event='FAILED')<>1 then raise exception 'failure history lost'; end if;
  if (select semantic_result from survival_ops.knowledge_semantic_jobs where job_id=v_job_id)<>v_result then raise exception 'immutable AI result changed'; end if;
  -- Restore a stale identity without changing either immutable origin or public URL.
  perform public.archive_worker_knowledge_editor_request((v_request->>'request_id')::uuid,'FAILED',v_lease,'{"reason":"SYNTHETIC_STOP"}');
  insert into survival_ops.knowledge_semantic_jobs(job_type,status,source_kind,source_ref,source_sha256,work_key,policy_version,policy_sha256,policy_pin,main_sha_at_prepare,semantic_context,semantic_result,semantic_result_sha256,result_decision,final_pr_number,final_head_sha,merge_sha,published_at)
  select job_type,'PUBLISHED',source_kind,'synthetic://published-collision',source_sha256,'published-collision',policy_version,policy_sha256,policy_pin,main_sha_at_prepare,jsonb_set(semantic_context,'{target,brief_id}','"K-1001"'),jsonb_set(semantic_result,'{brief,id}','"K-1001"'),semantic_result_sha256,result_decision,999,repeat('c',40),repeat('d',40),clock_timestamp()
  from survival_ops.knowledge_semantic_jobs where job_id=v_job_id returning job_id into v_collision;
  v_restored:=public.archive_operator_knowledge_editor_action(v_job_id,'RESTORE');
  if v_restored->>'brief_slug' is distinct from v_restored->'brief'->>'slug' then raise exception 'restored slug missing from envelope'; end if;
  if v_restored->>'brief_id'='K-998' or v_restored->'brief'->>'slug'='operator-editor-fixture' then raise exception 'restoration retained conflicting identity'; end if;
  if v_restored->'original'->'brief'->>'slug'<>'operator-editor-fixture' then raise exception 'restoration changed immutable origin'; end if;
  v_restored:=public.archive_operator_knowledge_editor_save(v_job_id,2,v_restored->'brief',v_review_copy);
  if (v_restored->>'revision')::integer<>3 or (select brief_id from survival_ops.knowledge_operator_drafts where job_id=v_job_id)='K-998' then raise exception 'reidentified working copy not saved'; end if;
  if (select semantic_result->'brief'->>'slug' from survival_ops.knowledge_semantic_jobs where job_id=v_collision)<>'operator-editor-fixture' then raise exception 'existing public URL changed'; end if;
  -- A body-free held idea uses the same restore and versioned-save path.
  insert into survival_ops.knowledge_semantic_jobs(job_type,status,source_kind,source_ref,source_sha256,work_key,policy_version,policy_sha256,policy_pin,main_sha_at_prepare,semantic_context,semantic_result,semantic_result_sha256,result_decision)
  select job_type,'HOLD',source_kind,'synthetic://empty-idea',source_sha256,'empty-idea',policy_version,policy_sha256,policy_pin,main_sha_at_prepare,jsonb_set(semantic_context,'{target,brief_id}','"K-1000"'),'{"decision":"HOLD","note":"중복 질문 검토"}',repeat('e',64),'HOLD'
  from survival_ops.knowledge_semantic_jobs where job_id=v_job_id returning job_id into v_collision;
  v_restored:=public.archive_operator_knowledge_editor_action(v_collision,'RESTORE');
  if v_restored->'brief' is distinct from 'null'::jsonb or (v_restored->>'archived')::boolean then raise exception 'empty idea restoration failed'; end if;
  v_draft:=jsonb_set(v_draft,'{id}','"K-1000"');
  v_draft:=v_draft||'{"risk_domains":["OTHER_SEVERE_HARM"],"risk_level":"HIGH","semantic_qa_status":"REVIEW","publication_policy":"HUMAN_APPROVED"}';
  v_restored:=public.archive_operator_knowledge_editor_save(v_collision,0,v_draft,v_review_copy);
  if (v_restored->>'revision')::integer<>1 or v_restored->'request' is distinct from 'null'::jsonb then raise exception 'empty idea save implied approval'; end if;
  v_next:=public.archive_operator_knowledge_editor_request(v_collision,1,false);
  v_second:=public.archive_operator_knowledge_editor_request(v_job_id,3,false);
  if v_next->>'request_id'=v_second->>'request_id' then raise exception 'different documents shared request identity'; end if;
  if public.archive_worker_next_knowledge_editor_request()->>'request_id'<>v_next->>'request_id' then raise exception 'persisted queue lost oldest request'; end if;
  if (select count(*) from survival_ops.knowledge_editor_requests where status='QUEUED' and job_id in (v_job_id,v_collision))<>2 then raise exception 'concurrent document intents lost'; end if;
  v_worker:=public.archive_worker_knowledge_editor_request((v_next->>'request_id')::uuid,'CLAIM');
  v_lease:=(v_worker->>'lease_token')::uuid;
  perform public.archive_operator_knowledge_editor_cancel((v_next->>'request_id')::uuid);
  begin
   perform public.archive_worker_knowledge_editor_request((v_next->>'request_id')::uuid,'CHECKED',v_lease,'{}');
   raise exception 'cancelled worker retained a valid lease';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_LEASE_INVALID' then raise; end if; end;
  v_request:=public.archive_operator_knowledge_editor_request(v_collision,1,false);
  if v_request->>'request_id'=v_next->>'request_id' then raise exception 'new approval overwrote cancelled history'; end if;
  if (select status from survival_ops.knowledge_editor_requests where request_id=(v_next->>'request_id')::uuid)<>'CANCELLED' then raise exception 'cancellation history lost'; end if;
  -- A synthetic, server-verified publication supplies the next revision's
  -- baseline without rewriting the original HOLD job or its historical SHA.
  perform public.archive_operator_knowledge_editor_cancel((v_request->>'request_id')::uuid);
  insert into survival_ops.knowledge_editor_requests(job_id,revision,draft_sha256,snapshot,publish_requested,approved_by,status,result)
  values(v_collision,1,v_restored->>'draft_sha256',jsonb_build_object('brief',v_restored->'brief'),true,'00000000-0000-4000-8000-000000000002','PUBLISHED',jsonb_build_object('status','LIVE_VERIFIED','merge_sha',repeat('f',40),'public_url','https://survival-diary-archive.netlify.app/knowledge/operator-editor-fixture/'));
  v_restored:=public.archive_operator_knowledge_editor_action(v_collision,'RESTORE');
  if v_restored->>'brief_id'<>'K-1000' or v_restored->'brief'->>'slug'<>'operator-editor-fixture' then raise exception 'restoration reassigned an editorial public identity'; end if;
  v_draft:=jsonb_set(v_restored->'brief','{title}','"다음 수정본 검증"');
  v_restored:=public.archive_operator_knowledge_editor_save(v_collision,1,v_draft,v_review_copy);
  v_request:=public.archive_operator_knowledge_editor_request(v_collision,2,false);
  v_worker:=public.archive_worker_knowledge_editor_request((v_request->>'request_id')::uuid,'GET');
  if v_worker->'snapshot'->'public_baseline'->>'merge_sha'<>repeat('f',40) or v_worker->'snapshot'->'public_baseline'->>'brief_id'<>'K-1000' then raise exception 'request did not bind latest verified public baseline'; end if;
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000004"}',true);
  begin
   perform public.archive_operator_knowledge_editor_get(v_job_id);
   raise exception 'viewer accessed editor';
  exception when insufficient_privilege then
   if sqlerrm<>'SURVIVAL_ARCHIVE_OPERATOR_FORBIDDEN' then raise; end if;
  end;
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',true);
  begin
   update survival_ops.knowledge_editor_versions set brief='{}' where job_id=v_job_id and revision=1;
   raise exception 'history overwritten';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_HISTORY_IMMUTABLE' then raise; end if; end;
end;
$verify$;
rollback;
