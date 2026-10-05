\set ON_ERROR_STOP on
begin;
do $verify$
declare
  v_job uuid := gen_random_uuid();
  v_old uuid := gen_random_uuid();
  v_approved uuid := gen_random_uuid();
  v_unrelated uuid := gen_random_uuid();
  v_visual uuid := gen_random_uuid();
  v_actor uuid := '00000000-0000-4000-8000-000000000002'; -- isolated CI fixture
  v_old_sha text := repeat('a',40);
  v_new_sha text := repeat('b',40);
  v_prepared_sha text := repeat('c',40);
  v_merge_sha text := repeat('d',40);
  v_result jsonb;
  v_original jsonb;
begin
  if has_function_privilege('anon','survival_ops.supersede_knowledge_revalidated_reviews(uuid,uuid)','execute')
    or has_function_privilege('authenticated','survival_ops.supersede_knowledge_revalidated_reviews(uuid,uuid)','execute')
    or has_function_privilege('service_role','survival_ops.supersede_knowledge_revalidated_reviews(uuid,uuid)','execute') then
    raise exception 'supersession must remain admin only';
  end if;
  insert into survival_ops.knowledge_semantic_jobs (
    job_id,job_type,status,source_kind,source_ref,source_sha256,work_key,policy_version,
    policy_sha256,policy_pin,main_sha_at_prepare,semantic_context,semantic_result,
    semantic_result_sha256,result_decision,final_pr_number,final_head_ref,final_head_sha,merge_sha,published_at
  ) values (v_job,'FRESH_BRIEF','PUBLISHED','USER_REPORTED_EXPERIENCE',
    'knowledge/content/experience-seeds/EX-002-supersession.json',repeat('e',64),'supersession-test','test',
    repeat('f',64),'{}',repeat('1',40),'{}','{"brief":{"id":"K-999"}}',repeat('2',64),
    'HUMAN_REVIEW',999,'knowledge/worker/supersession-new',v_prepared_sha,v_merge_sha,clock_timestamp());
  insert into survival_ops.archive_review_items (
    id,idempotency_key,source_worker,item_type,priority,title,summary,risk_level,source_ref,payload,
    status,created_at,decided_at,decided_by
  ) values
    (v_old,'C_KNOWLEDGE:K-999:'||v_old_sha,'C_KNOWLEDGE','KNOWLEDGE','P1','Original review','Preserve me','HIGH',
     'https://github.com/cetin072/survival-interactive-series/blob/'||v_old_sha||'/knowledge/content/briefs/K-999.json',
     jsonb_build_object('brief_id','K-999','head_sha',v_old_sha,'pr_number',998,'head_ref','knowledge/worker/supersession-old'),
     'PENDING',clock_timestamp()-interval '1 day',null,null),
    (v_approved,'C_KNOWLEDGE:K-999:'||v_new_sha,'C_KNOWLEDGE','KNOWLEDGE','P1','Approved review','Approved package','HIGH',
     'https://github.com/cetin072/survival-interactive-series/blob/'||v_new_sha||'/knowledge/content/briefs/K-999.json',
     jsonb_build_object('brief_id','K-999','head_sha',v_new_sha,'pr_number',999,'head_ref','knowledge/worker/supersession-new'),
     'APPROVED',clock_timestamp(),clock_timestamp(),v_actor),
    (v_unrelated,'C_KNOWLEDGE:K-998:'||v_old_sha,'C_KNOWLEDGE','KNOWLEDGE','P1','Unrelated review','Keep pending','HIGH',
     'synthetic://unrelated','{"brief_id":"K-998"}','PENDING',clock_timestamp()-interval '1 day',null,null),
    (v_visual,'B_VISUAL:supersession-test','B_VISUAL','VISUAL','P1','Unrelated visual','Keep pending','LOW',
     'synthetic://visual','{}','PENDING',clock_timestamp()-interval '1 day',null,null);
  select payload into v_original from survival_ops.archive_review_items where id=v_old;
  v_result := survival_ops.supersede_knowledge_revalidated_reviews(v_job,v_approved);
  if v_result->>'status' <> 'REJECTED' then raise exception 'missing approval audit accepted'; end if;
  insert into survival_ops.archive_review_decisions(item_id,decision,actor_profile_id)
    values(v_approved,'APPROVED',v_actor);
  insert into survival_ops.archive_review_consumption_receipts(item_id,outcome,result)
    values(v_approved,'CONSUMED',jsonb_build_object('brief_id','K-999','merge_sha',repeat('9',40),'prepared_sha',v_prepared_sha));
  insert into survival_ops.knowledge_ex001_review_revalidations (
    job_id,review_item_id,old_pr_number,old_head_ref,old_head_sha,new_pr_number,new_head_ref,new_head_sha,
    revalidated_main_sha,source_sha256,new_review_item_id
  ) values(v_job,v_old,998,'knowledge/worker/supersession-old',v_old_sha,999,'knowledge/worker/supersession-new',
    v_new_sha,repeat('1',40),repeat('e',64),v_approved);
  v_result := survival_ops.supersede_knowledge_revalidated_reviews(v_job,v_approved);
  if v_result->>'status' <> 'REJECTED' then raise exception 'wrong merge receipt accepted'; end if;
  update survival_ops.archive_review_consumption_receipts
    set result=jsonb_build_object('brief_id','K-999','merge_sha',v_merge_sha,'prepared_sha',v_prepared_sha)
    where item_id=v_approved;
  v_result := survival_ops.supersede_knowledge_revalidated_reviews(v_job,v_approved);
  if v_result->>'count' <> '1' then raise exception 'bound supersession failed: %',v_result; end if;
  if not exists(select 1 from survival_ops.archive_review_items where id=v_old and status='SUPERSEDED'
      and superseded_by=v_approved and decided_by is null and decided_at is null and payload=v_original)
    or (select count(*) from survival_ops.archive_review_items where id in(v_unrelated,v_visual) and status='PENDING') <> 2
    or (select status from survival_ops.knowledge_semantic_jobs where job_id=v_job) <> 'PUBLISHED' then
    raise exception 'history, unrelated reviews, or publication changed';
  end if;
  v_result := survival_ops.supersede_knowledge_revalidated_reviews(v_job,v_approved);
  if v_result->>'count' <> '0' then raise exception 'replay must be idempotent'; end if;
end;
$verify$;
rollback;
