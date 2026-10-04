\set ON_ERROR_STOP on
begin;
do $verify$
declare
  v_ref text := 'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json';
  v_sha text := repeat('a',64);
  v_prepared jsonb;
  v_job_id uuid;
  v_result jsonb;
  v_submitted jsonb;
begin
  if has_function_privilege('anon','public.archive_knowledge_semantic_job_prepare(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.archive_knowledge_semantic_job_submit(uuid,text,text,jsonb)','EXECUTE') then
    raise exception 'EX-001 RPC grants widened';
  end if;
  begin
    perform public.archive_knowledge_semantic_job_prepare(
      'FRESH_BRIEF','USER_REPORTED_EXPERIENCE','knowledge/content/experience-seeds/EX-002.json',v_sha,
      'invalid-experience','c3-test-v1',repeat('b',64),'{}'::jsonb,repeat('1',40),'{}'::jsonb,'PREPARED',null
    );
    raise exception 'unapproved experience source was accepted';
  exception when others then
    if sqlerrm <> 'KNOWLEDGE_SEMANTIC_PREPARE_INVALID' then raise; end if;
  end;
  v_prepared := public.archive_knowledge_semantic_job_prepare(
    'FRESH_BRIEF','USER_REPORTED_EXPERIENCE',v_ref,v_sha,
    'ex001-ci','c3-test-v1',repeat('b',64),'{}'::jsonb,repeat('1',40),
    jsonb_build_object('source',jsonb_build_object('kind','USER_REPORTED_EXPERIENCE','ref',v_ref,'sha256',v_sha,'refs','[]'::jsonb,'hashes','[]'::jsonb),
      'target',jsonb_build_object('brief_id','K-999','candidate_id','KC-ex001-ci')),
    'PREPARED',null
  );
  if v_prepared->>'status' <> 'PREPARED' then raise exception 'EX-001 prepare failed: %',v_prepared; end if;
  v_job_id := (v_prepared->>'job_id')::uuid;
  v_result := jsonb_build_object(
    'version','knowledge-semantic-result-v1','job_id',v_job_id::text,'decision','BRIEF_READY',
    'candidate',jsonb_build_object('id','KC-ex001-ci','brief_id','K-999','topic_id','T-EX001','status','BRIEF_PROPOSED','question','EX-001 question','source_kind','USER_REPORTED_EXPERIENCE','source_ref',v_ref,'source_sha256',v_sha),
    'evidence',jsonb_build_object('brief_id','K-999','question','EX-001 question','story_source_status','USER_REPORTED_EXPERIENCE','claims',jsonb_build_array(jsonb_build_object('claim','test'))),
    'brief',jsonb_build_object('id','K-999','topic_id','T-EX001','content_type','BRIEF','status','READY','title','EX-001 question','risk_level','LOW','publication_policy','AUTO_LOW_RISK','semantic_qa_status','PASS')
  );
  v_submitted := public.archive_knowledge_semantic_job_submit(v_job_id,v_ref,v_sha,v_result);
  if v_submitted->>'status' <> 'REJECTED' or v_submitted->>'reason' <> 'PACKAGE_EXPERIENCE_SOURCE_INVALID' then
    raise exception 'EX-001 auto publication was not blocked: %',v_submitted;
  end if;
  v_result := (v_result - 'decision') || jsonb_build_object('decision','HUMAN_REVIEW','code','EX001_FIRST_PILOT','note','operator review required');
  v_result := jsonb_set(v_result,'{brief,publication_policy}','"HUMAN_APPROVED"'::jsonb);
  v_submitted := public.archive_knowledge_semantic_job_submit(v_job_id,v_ref,v_sha,v_result);
  if v_submitted->>'status' <> 'ACCEPTED' then raise exception 'EX-001 review submit failed: %',v_submitted; end if;
end;
$verify$;
rollback;
