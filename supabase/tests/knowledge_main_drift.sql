\set ON_ERROR_STOP on
-- Isolated CI only. All synthetic data is rolled back.
begin;
truncate survival_ops.knowledge_semantic_jobs cascade;
do $verify$
declare
  j uuid:=gen_random_uuid(); r uuid:=gen_random_uuid();
  result jsonb:='{"brief":{"id":"K-999"}}'; digest text;
  outcome jsonb; approved_at timestamptz;
begin
  digest:=encode(extensions.digest(convert_to(result::text,'UTF8'),'sha256'),'hex');
  if has_function_privilege('service_role','survival_ops.recover_knowledge_main_drift(uuid,uuid,text,text,text,integer,text,text,text,boolean)','execute')
    or has_function_privilege('anon','public.archive_knowledge_review_package(uuid,timestamptz)','execute') then
    raise exception 'recovery/package grants widened';
  end if;
  insert into survival_ops.knowledge_semantic_jobs(job_id,job_type,status,source_kind,source_ref,source_sha256,work_key,
    policy_version,policy_sha256,policy_pin,main_sha_at_prepare,semantic_context,semantic_result,semantic_result_sha256,
    result_decision,blocker_code,blocker_stage,submitted_at,final_pr_number,final_head_ref,final_head_sha)
  values(j,'FRESH_BRIEF','BLOCKED','PUBLIC_ARCHIVE','synthetic://source',repeat('d',64),'main-drift-ci','ci',repeat('e',64),'{}',repeat('1',40),'{}',result,digest,
    'HUMAN_REVIEW','MAIN_MOVED_REVALIDATION_REQUIRED','PR_RECONCILE',clock_timestamp(),999,'knowledge/worker/semantic-fixture',repeat('a',40));
  insert into survival_ops.archive_review_items(id,idempotency_key,source_worker,item_type,priority,title,summary,risk_level,source_ref,payload,status)
  values(r,'C_KNOWLEDGE:K-999:'||repeat('a',40),'C_KNOWLEDGE','KNOWLEDGE','P1','Synthetic main drift','CI only','HIGH',
    'https://github.com/cetin072/survival-interactive-series/blob/'||repeat('a',40)||'/knowledge/content/briefs/K-999.json',
    jsonb_build_object('brief_id','K-999','head_sha',repeat('a',40),'pr_number',999,'head_ref','knowledge/worker/semantic-fixture'),'PENDING');
  outcome:=public.archive_knowledge_semantic_job_prepare('FRESH_BRIEF','PUBLIC_ARCHIVE','synthetic://other',repeat('f',64),'other','ci',repeat('e',64),'{}',repeat('2',40),'{}');
  if outcome->>'status'<>'ACTIVE_RECOVERABLE_JOB_EXISTS' or (select count(*) from survival_ops.knowledge_semantic_jobs)<>1
    or jsonb_array_length(public.archive_knowledge_semantic_job_list_active())<>1 then raise exception 'recoverable package lost reservation'; end if;
  begin
    update survival_ops.knowledge_semantic_jobs set status='HUMAN_REVIEW' where job_id=j;
    raise exception 'terminal guard bypass';
  exception when others then if sqlerrm<>'KNOWLEDGE_SEMANTIC_TERMINAL_IMMUTABLE' then raise; end if; end;
  -- Every identity and current-main target attestation is mandatory.
  for outcome in select survival_ops.recover_knowledge_main_drift(j,r,v.result,v.source,v.policy,999,'knowledge/worker/semantic-fixture',v.head,repeat('2',40),v.absent)
    from (values(repeat('f',64),repeat('d',64),repeat('e',64),repeat('a',40),true),
      (digest,repeat('f',64),repeat('e',64),repeat('a',40),true),
      (digest,repeat('d',64),repeat('f',64),repeat('a',40),true),
      (digest,repeat('d',64),repeat('e',64),repeat('b',40),true),
      (digest,repeat('d',64),repeat('e',64),repeat('a',40),false)) v(result,source,policy,head,absent)
  loop if outcome->>'status'<>'REJECTED' then raise exception 'invalid recovery accepted'; end if; end loop;
  outcome:=survival_ops.recover_knowledge_main_drift(j,r,digest,repeat('d',64),repeat('e',64),999,'knowledge/worker/semantic-fixture',repeat('a',40),repeat('2',40),true);
  if outcome->>'status'<>'HUMAN_REVIEW' then raise exception 'generic recovery failed: %',outcome; end if;
  if not exists(select 1 from survival_ops.knowledge_semantic_jobs where job_id=j and status='HUMAN_REVIEW' and blocker_code is null
    and semantic_result=result and semantic_result_sha256=digest and final_head_sha=repeat('a',40))
    or not exists(select 1 from survival_ops.archive_review_items where id=r and status='PENDING' and decided_at is null)
    or not exists(select 1 from survival_ops.knowledge_main_drift_recoveries where job_id=j and previous_blocker->>'code'='MAIN_MOVED_REVALIDATION_REQUIRED') then
    raise exception 'package/review/audit not preserved'; end if;
  if jsonb_array_length(public.archive_knowledge_semantic_job_list_reconcile())<>0
    or jsonb_array_length(public.archive_knowledge_semantic_job_list_reconcile_v2())<>1
    or public.archive_knowledge_semantic_job_list_reconcile_v2()->0->>'result_digest_verified'<>'true' then
    raise exception 'legacy compatibility protection failed'; end if;
  -- Exercise the existing operator approval, without inventing a second decision path.
  perform public.archive_operator_decide_review_item(r,'APPROVED','Synthetic CI approval');
  select decided_at into approved_at from survival_ops.archive_review_items where id=r;
  if public.archive_knowledge_review_package(r,approved_at)->>'status'<>'C3' then raise exception 'approved package unavailable'; end if;
  begin
    perform public.archive_knowledge_review_record_preparation(r,approved_at,digest,repeat('f',64),repeat('e',64),repeat('2',40),repeat('b',40));
    raise exception 'wrong source pin accepted';
  exception when others then if sqlerrm<>'SEMANTIC_PREPARATION_BINDING_MISMATCH' then raise; end if; end;
  begin
    update survival_ops.knowledge_semantic_jobs set final_head_sha=repeat('b',40) where job_id=j;
    raise exception 'unregistered head accepted';
  exception when others then if sqlerrm<>'SEMANTIC_TRANSPORT_NOT_REGISTERED' then raise; end if; end;
  perform public.archive_knowledge_review_record_preparation(r,approved_at,digest,repeat('d',64),repeat('e',64),repeat('2',40),repeat('b',40));
  update survival_ops.knowledge_semantic_jobs set final_head_sha=repeat('b',40) where job_id=j;
  if public.archive_knowledge_review_package(r,approved_at)->>'status'<>'C3' then raise exception 'registered transport lost approval'; end if;
end;
$verify$;
rollback;
