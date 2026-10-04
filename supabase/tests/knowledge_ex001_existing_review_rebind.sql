\set ON_ERROR_STOP on
begin;
do $verify$
declare
  v_job uuid := pg_catalog.gen_random_uuid();
  v_old_review uuid := pg_catalog.gen_random_uuid();
  v_new_review uuid := pg_catalog.gen_random_uuid();
  v_old_sha text := repeat('a',40);
  v_new_sha text := repeat('b',40);
  v_new_ref text := 'knowledge/worker/semantic-revalidated-test';
  v_result jsonb;
begin
  insert into survival_ops.knowledge_semantic_jobs (
    job_id,job_type,status,source_kind,source_ref,source_sha256,work_key,
    policy_version,policy_sha256,policy_pin,main_sha_at_prepare,semantic_context,
    semantic_result,semantic_result_sha256,result_decision,blocker_code,blocker_stage,
    submitted_at,final_pr_number,final_head_ref,final_head_sha
  ) values (
    v_job,'FRESH_BRIEF','BLOCKED','USER_REPORTED_EXPERIENCE',
    'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json',
    repeat('d',64),'ex001-review-rebind-ci','c3-test-v1',repeat('e',64),'{}'::jsonb,
    repeat('1',40),'{}'::jsonb,
    pg_catalog.jsonb_build_object('brief',pg_catalog.jsonb_build_object('id','K-014')),
    repeat('f',64),'HUMAN_REVIEW','MAIN_MOVED_REVALIDATION_REQUIRED','PR_RECONCILE',
    clock_timestamp(),403,'knowledge/worker/semantic-old',v_old_sha
  );
  insert into survival_ops.archive_review_items (
    id,idempotency_key,source_worker,item_type,priority,title,summary,risk_level,
    source_ref,payload,status
  ) values (
    v_old_review,'C_KNOWLEDGE:K-014:'||v_old_sha,'C_KNOWLEDGE','KNOWLEDGE','P1',
    'EX-001 old review','Human review required','HIGH',
    'https://github.com/cetin072/survival-interactive-series/blob/'||v_old_sha||'/knowledge/content/briefs/K-014.json',
    pg_catalog.jsonb_build_object('brief_id','K-014','head_sha',v_old_sha,'pr_number',403,
      'head_ref','knowledge/worker/semantic-old'),'PENDING'
  );
  insert into survival_ops.archive_review_items (
    id,idempotency_key,source_worker,item_type,priority,title,summary,risk_level,
    source_ref,payload,status
  ) values (
    v_new_review,'C_KNOWLEDGE:K-014:'||v_new_sha,'C_KNOWLEDGE','KNOWLEDGE','P1',
    'EX-001 new review','Human review required','HIGH',
    'https://github.com/cetin072/survival-interactive-series/blob/'||v_new_sha||'/knowledge/content/briefs/K-014.json',
    pg_catalog.jsonb_build_object('brief_id','K-014','head_sha',v_new_sha,'pr_number',404,
      'head_ref',v_new_ref),'PENDING'
  );

  v_result := survival_ops.revalidate_ex001_human_review(
    v_job,v_old_review,403,v_old_sha,405,v_new_ref,v_new_sha,repeat('2',40));
  if v_result->>'status' <> 'REJECTED'
     or v_result->>'reason' <> 'EX001_REVALIDATION_NEW_REVIEW_MISMATCH' then
    raise exception 'wrong new PR accepted: %',v_result;
  end if;

  v_result := survival_ops.revalidate_ex001_human_review(
    v_job,v_old_review,403,v_old_sha,404,v_new_ref,v_new_sha,repeat('2',40));
  if v_result->>'status' <> 'HUMAN_REVIEW'
     or v_result->>'review_item_id' <> v_new_review::text then
    raise exception 'existing review item rebind failed: %',v_result;
  end if;
  if not exists (
    select 1 from survival_ops.knowledge_semantic_jobs
    where job_id=v_job and status='HUMAN_REVIEW' and final_pr_number=404
      and final_head_sha=v_new_sha and blocker_code is null
      and main_sha_at_prepare=repeat('1',40) and semantic_result_sha256=repeat('f',64)
  ) then raise exception 'job source or result changed'; end if;
  if not exists (
    select 1 from survival_ops.archive_review_items
    where id=v_old_review and status='PENDING' and payload->>'head_sha'=v_old_sha
  ) then raise exception 'old review record was changed'; end if;
  if not exists (
    select 1 from survival_ops.knowledge_ex001_review_revalidations
    where job_id=v_job and review_item_id=v_old_review and new_review_item_id=v_new_review
      and old_head_sha=v_old_sha and new_head_sha=v_new_sha
  ) then raise exception 'review rebind audit missing'; end if;
end;
$verify$;
rollback;
