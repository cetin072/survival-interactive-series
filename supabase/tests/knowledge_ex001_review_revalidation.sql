\set ON_ERROR_STOP on
begin;
do $verify$
declare
  v_job uuid := pg_catalog.gen_random_uuid();
  v_review uuid := pg_catalog.gen_random_uuid();
  v_old_sha text := repeat('a',40);
  v_new_sha text := repeat('b',40);
  v_result jsonb;
begin
  if has_function_privilege('authenticated',
    'survival_ops.revalidate_ex001_human_review(uuid,uuid,integer,text,integer,text,text,text)','EXECUTE') then
    raise exception 'EX-001 revalidation grant widened';
  end if;

  insert into survival_ops.knowledge_semantic_jobs (
    job_id,job_type,status,source_kind,source_ref,source_sha256,work_key,
    policy_version,policy_sha256,policy_pin,main_sha_at_prepare,semantic_context,
    semantic_result,semantic_result_sha256,result_decision,blocker_code,blocker_stage,
    submitted_at,final_pr_number,final_head_ref,final_head_sha
  ) values (
    v_job,'FRESH_BRIEF','BLOCKED','USER_REPORTED_EXPERIENCE',
    'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json',
    repeat('d',64),'ex001-revalidation-ci','c3-test-v1',repeat('e',64),'{}'::jsonb,
    repeat('1',40),'{}'::jsonb,
    pg_catalog.jsonb_build_object('brief',pg_catalog.jsonb_build_object('id','K-014')),
    repeat('f',64),'HUMAN_REVIEW','MAIN_MOVED_REVALIDATION_REQUIRED','PR_RECONCILE',
    clock_timestamp(),403,'knowledge/worker/semantic-old',v_old_sha
  );
  insert into survival_ops.archive_review_items (
    id,idempotency_key,source_worker,item_type,priority,title,summary,risk_level,
    source_ref,payload,status
  ) values (
    v_review,'C_KNOWLEDGE:K-014:'||v_old_sha,'C_KNOWLEDGE','KNOWLEDGE','P1',
    'EX-001 review','Human review required','HIGH',
    'https://github.com/cetin072/survival-interactive-series/blob/'||v_old_sha||'/knowledge/content/briefs/K-014.json',
    pg_catalog.jsonb_build_object('brief_id','K-014','head_sha',v_old_sha,'pr_number',403,
      'head_ref','knowledge/worker/semantic-old'),'PENDING'
  );

  begin
    update survival_ops.knowledge_semantic_jobs set status='HUMAN_REVIEW' where job_id=v_job;
    raise exception 'terminal guard bypassed';
  exception when others then
    if sqlerrm <> 'KNOWLEDGE_SEMANTIC_TERMINAL_IMMUTABLE' then raise; end if;
  end;

  v_result := survival_ops.revalidate_ex001_human_review(
    v_job,v_review,403,repeat('9',40),404,
    'knowledge/worker/semantic-revalidated-test',v_new_sha,repeat('2',40));
  if v_result->>'status' <> 'REJECTED' or v_result->>'reason' <> 'EX001_REVALIDATION_JOB_MISMATCH' then
    raise exception 'wrong old head accepted: %',v_result;
  end if;

  v_result := survival_ops.revalidate_ex001_human_review(
    v_job,v_review,403,v_old_sha,404,
    'knowledge/worker/semantic-revalidated-test',v_new_sha,repeat('2',40));
  if v_result->>'status' <> 'HUMAN_REVIEW' then
    raise exception 'EX-001 revalidation failed: %',v_result;
  end if;
  if not exists (
    select 1 from survival_ops.knowledge_semantic_jobs
    where job_id=v_job and status='HUMAN_REVIEW' and final_pr_number=404
      and final_head_sha=v_new_sha and blocker_code is null
      and main_sha_at_prepare=repeat('1',40) and semantic_result_sha256=repeat('f',64)
  ) then raise exception 'source or result pin changed'; end if;
  if not exists (
    select 1 from survival_ops.archive_review_items
    where id=v_review and status='PENDING'
      and payload->>'head_sha'=v_new_sha
      and payload->>'pr_number'='404'
      and idempotency_key='C_KNOWLEDGE:K-014:'||v_new_sha
  ) then raise exception 'review binding not updated'; end if;
  if not exists (
    select 1 from survival_ops.knowledge_ex001_review_revalidations
    where job_id=v_job and old_pr_number=403 and old_head_sha=v_old_sha
      and new_pr_number=404 and new_head_sha=v_new_sha
      and revalidated_main_sha=repeat('2',40)
  ) then raise exception 'revalidation audit missing'; end if;
end;
$verify$;
rollback;
