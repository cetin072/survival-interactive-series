\set ON_ERROR_STOP on
begin;
truncate survival_ops.knowledge_semantic_jobs cascade;

do $verify$
declare
  states text[] := array['HUMAN_REVIEW','HUMAN_REVIEW','PUBLISHED','BLOCKED','BLOCKED','HOLD'];
  ids uuid[] := array[]::uuid[];
  i integer; context jsonb; result jsonb; outcome jsonb; dashboard jsonb;
  original jsonb; prep_id uuid; definition text;
begin
  for i in 1..6 loop
    ids := array_append(ids,gen_random_uuid());
    context := jsonb_build_object('target',jsonb_build_object('brief_id','K-99960'||i));
    result := jsonb_build_object('version','knowledge-semantic-result-v1','job_id',ids[i],
      'decision',case when i in (1,2) then 'HUMAN_REVIEW' when i=6 then 'HOLD' else 'BRIEF_READY' end);
    insert into survival_ops.knowledge_semantic_jobs(job_id,job_type,status,source_kind,
      source_ref,source_sha256,work_key,policy_version,policy_sha256,policy_pin,
      main_sha_at_prepare,semantic_context,semantic_result,semantic_result_sha256,result_decision,
      blocker_code,blocker_stage,prepared_at,updated_at,final_pr_number,final_head_sha,merge_sha,published_at)
    values(ids[i],'BACKFILL_BRIEF',states[i],'PUBLIC_READER','synthetic-operator-'||i,
      repeat('a',64),'synthetic-operator-'||i,'test',repeat('b',64),jsonb_build_object('sha256',repeat('b',64)),
      repeat('c',40),context,result,encode(extensions.digest(convert_to(result::text,'UTF8'),'sha256'),'hex'),result->>'decision',
      case when i in(4,5) then 'KNOWLEDGE_CONTRACT' when i=6 then 'SEMANTIC_DUPLICATE' end,
      case when i in(4,5) then 'FINALIZER' when i=6 then 'SEMANTIC' end,
      clock_timestamp()-interval '10 days'+i*interval '1 hour',clock_timestamp()-interval '9 days',
      case when i=3 then 999603 end,case when i=3 then repeat('d',40) end,
      case when i=3 then repeat('e',40) end,case when i=3 then clock_timestamp()-interval '9 days' end);
  end loop;
  select jsonb_agg(to_jsonb(j) order by job_id) into original from survival_ops.knowledge_semantic_jobs j;
  dashboard := survival_ops.knowledge_operator_status_v2();
  if dashboard->>'machine_active_count'<>'0' or dashboard->>'human_review_count'<>'2'
    or dashboard->>'unresolved_blocked_count'<>'2' or dashboard->>'machine_stalled_count'<>'0'
    or dashboard#>>'{latest_job,brief_id}'<>'K-999606'
    or dashboard#>>'{latest_published_job,brief_id}'<>'K-999603'
    or dashboard#>>'{latest_blocked_job,brief_id}'<>'K-999605'
    or dashboard#>>'{latest_job,disposition_code}'<>'SEMANTIC_DUPLICATE'
    or dashboard#>>'{latest_job,blocker_code}' is not null then
    raise exception 'C_LIVE_COUNTS_OR_LATEST_INVALID: %',dashboard;
  end if;
  if original is distinct from (select jsonb_agg(to_jsonb(j) order by job_id) from survival_ops.knowledge_semantic_jobs j)
    then raise exception 'STATUS_READ_MUTATED_JOBS'; end if;
  definition := pg_get_functiondef('public.archive_operator_system_status()'::regprocedure);
  if position('knowledge_operator_status_v2()' in definition)=0
    or position('KNOWLEDGE_PR_STALLED' in definition)>0 then raise exception 'PUBLIC_C_CONTRACT_NOT_UPGRADED'; end if;
  if has_function_privilege('anon','survival_ops.knowledge_operator_status_v2()','EXECUTE')
    or has_function_privilege('authenticated','survival_ops.knowledge_operator_status_v2()','EXECUTE')
    or has_function_privilege('anon','public.archive_knowledge_semantic_job_submit(uuid,text,text,jsonb)','EXECUTE')
    or not has_function_privilege('service_role','public.archive_knowledge_semantic_job_submit(uuid,text,text,jsonb)','EXECUTE')
    then raise exception 'RPC_ACL_WEAKENED'; end if;

  prep_id := gen_random_uuid();
  context := '{"target":{"brief_id":"K-999607","candidate_id":"KC-test"},"source":{"kind":"PUBLIC_ARCHIVE"},"story_registry_ids":["registered-story"]}';
  insert into survival_ops.knowledge_semantic_jobs(job_id,job_type,status,source_kind,source_ref,source_sha256,work_key,
    policy_version,policy_sha256,policy_pin,main_sha_at_prepare,semantic_context)
  values(prep_id,'FRESH_BRIEF','PREPARED','PUBLIC_ARCHIVE','synthetic-submit',repeat('a',64),'synthetic-submit',
    'test',repeat('b',64),jsonb_build_object('sha256',repeat('b',64)),repeat('c',40),context);
  result := jsonb_build_object('version','knowledge-semantic-result-v1','job_id',prep_id,'decision','BRIEF_READY',
    'candidate',jsonb_build_object('id','KC-test','status','BRIEF_PROPOSED','brief_id','K-999607','topic_id','test',
      'question','test question','source_kind','PUBLIC_ARCHIVE','source_manifest_ref','synthetic-submit','source_manifest_sha256',repeat('a',64)),
    'evidence',jsonb_build_object('brief_id','K-999607','question','test question','claims',jsonb_build_array(jsonb_build_object('id','test'))),
    'brief',jsonb_build_object('id','K-999607','content_type','BRIEF','status','READY','topic_id','test','title','test question',
      'risk_level','LOW','publication_policy','AUTO_LOW_RISK','semantic_qa_status','PASS','story_refs',jsonb_build_array('archive/content/stories/BOOK.json#chapter')));
  outcome := public.archive_knowledge_semantic_job_submit(prep_id,'synthetic-submit',repeat('a',64),result);
  if outcome->>'reason'<>'PACKAGE_STORY_REFS_INVALID' then raise exception 'PATH_ACCEPTED: %',outcome; end if;
  result := jsonb_set(result,'{brief,story_refs}','["unknown-id"]');
  outcome := public.archive_knowledge_semantic_job_submit(prep_id,'synthetic-submit',repeat('a',64),result);
  if outcome->>'reason'<>'PACKAGE_STORY_REFS_INVALID' then raise exception 'UNKNOWN_ID_ACCEPTED'; end if;
  if (select status from survival_ops.knowledge_semantic_jobs where job_id=prep_id)<>'PREPARED'
    or (select semantic_result from survival_ops.knowledge_semantic_jobs where job_id=prep_id) is not null
    then raise exception 'FAILED_SUBMIT_MUTATED_JOB'; end if;
  result := jsonb_set(result,'{brief,story_refs}','["registered-story"]');
  outcome := public.archive_knowledge_semantic_job_submit(prep_id,'synthetic-submit',repeat('a',64),result);
  if outcome->>'status'<>'ACCEPTED' then raise exception 'VALID_REGISTRY_ID_REJECTED: %',outcome; end if;
  outcome := public.archive_knowledge_semantic_job_submit(prep_id,'synthetic-submit',repeat('a',64),result);
  if outcome->>'status'<>'ALREADY_SUBMITTED' then raise exception 'IDEMPOTENCY_LOST'; end if;
  raise notice 'C dashboard counts, old human waiting, live IDs, HOLD, BLOCKED, ACL, submit and digest/idempotency PASS';
end;
$verify$;
rollback;
