-- Apply the candidate migration in this transaction before running this test.
-- No HTTP, workflow dispatch, image generation, real approval or persistent row changes.
begin;
create or replace function survival_ops.dispatch_knowledge_workflow(p_workflow text,p_origin text)
returns bigint language plpgsql security definer set search_path='' as $$ begin return -999; end $$;
do $test$
declare human survival_ops.knowledge_semantic_jobs%rowtype; before_job jsonb; before_inbox jsonb;
  active jsonb; handled jsonb; outcome jsonb; prepared uuid; fixture uuid := gen_random_uuid();
  review uuid; actor uuid; approval timestamptz; payload jsonb; receipt jsonb; published_at_once timestamptz;
begin
  select * into strict human from survival_ops.knowledge_semantic_jobs
    where job_id='c8da8c82-c60c-4dd9-9556-b3f0d08c9507';
  if human.status <> 'HUMAN_REVIEW' then raise exception 'K015_NOT_HUMAN_REVIEW'; end if;
  if has_function_privilege('anon','public.archive_worker_record_review_consumption(uuid,timestamptz,text,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.archive_worker_record_review_consumption(uuid,timestamptz,text,jsonb)','EXECUTE')
    or not has_function_privilege('service_role','public.archive_worker_record_review_consumption(uuid,timestamptz,text,jsonb)','EXECUTE')
    or has_function_privilege('service_role','public.archive_worker_record_review_consumption_v1(uuid,timestamptz,text,jsonb)','EXECUTE')
    then raise exception 'CONSUMER_GRANTS_INVALID'; end if;
  before_job := to_jsonb(human);
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into before_inbox
    from survival_ops.archive_review_items r where r.payload->>'brief_id'='K-015';
  active := public.archive_knowledge_semantic_job_list_active();
  handled := public.archive_knowledge_semantic_job_list_handled();
  if exists(select 1 from jsonb_array_elements(active) j where j->>'status'='HUMAN_REVIEW')
    or not exists(select 1 from jsonb_array_elements(handled) j where j->>'brief_id'='K-015' and j->>'status'='HUMAN_REVIEW')
    then raise exception 'HUMAN_SLOT_OR_RESERVATION_INVALID'; end if;
  if survival_ops.dispatch_knowledge_semantic_finalizer() is not null then raise exception 'HUMAN_DISPATCHED'; end if;
  outcome := public.archive_knowledge_semantic_job_prepare(human.job_type,human.source_kind,human.source_ref,
    human.source_sha256,human.work_key,human.policy_version,human.policy_sha256,human.policy_pin,
    human.main_sha_at_prepare,human.semantic_context);
  if outcome->>'status' <> 'EXISTING_JOB' or outcome->>'job_id' <> human.job_id::text then raise exception 'SOURCE_DEDUPE_FAILED'; end if;
  outcome := public.archive_knowledge_semantic_job_prepare('FRESH_BRIEF','PUBLIC_ARCHIVE','test://human-slot/fresh',
    repeat('a',64),'test-human-slot-other',human.policy_version,human.policy_sha256,human.policy_pin,
    human.main_sha_at_prepare,human.semantic_context);
  if outcome->>'status' <> 'BRIEF_RESERVED' then raise exception 'BRIEF_DEDUPE_FAILED'; end if;
  for payload in select jsonb_build_object('kind',kind,'type',typ) from (values
    ('PUBLIC_ARCHIVE','FRESH_BRIEF'),('PUBLIC_READER','BACKFILL_BRIEF')) v(kind,typ)
  loop
    outcome := public.archive_knowledge_semantic_job_prepare(payload->>'type',payload->>'kind',
      'test://human-slot/'||(payload->>'kind'),repeat('a',64),'test-human-slot-'||(payload->>'kind'),
      human.policy_version,human.policy_sha256,human.policy_pin,human.main_sha_at_prepare,
      jsonb_set(human.semantic_context,'{target,brief_id}','"K-999991"'));
    if outcome->>'status' <> 'PREPARED' then raise exception 'HUMAN_PREP_FAILED:%',outcome; end if;
    prepared := (outcome->>'job_id')::uuid;
    outcome := public.archive_knowledge_semantic_job_prepare('FRESH_BRIEF','PUBLIC_ARCHIVE','test://human-slot/concurrent',
      repeat('b',64),'test-human-slot-concurrent',human.policy_version,human.policy_sha256,human.policy_pin,
      human.main_sha_at_prepare,jsonb_set(human.semantic_context,'{target,brief_id}','"K-999992"'));
    if outcome->>'status' <> 'ACTIVE_JOB_EXISTS' then raise exception 'MACHINE_SLOT_FAILED:%',outcome; end if;
    delete from survival_ops.knowledge_semantic_jobs where job_id=prepared;
  end loop;

  -- Synthetic approval follows the existing operator and consumer contracts.
  select profile.id into strict actor from public.profiles profile
    join public.profile_roles membership on membership.profile_id=profile.id and membership.revoked_at is null
    join public.roles role on role.id=membership.role_id and role.code='super_admin' and role.active
    where profile.account_status='active' limit 1;
  insert into survival_ops.knowledge_semantic_jobs
    select (jsonb_populate_record(null::survival_ops.knowledge_semantic_jobs,to_jsonb(human)||jsonb_build_object(
      'job_id',fixture,'source_ref','test://human-slot/approved','work_key','test-human-slot-approved',
      'semantic_context',jsonb_set(human.semantic_context,'{target,brief_id}','"K-999993"'),
      'final_pr_number',999993,'final_head_ref','knowledge/worker/semantic-test-human-slot',
      'final_head_sha',repeat('c',40)))).*;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  outcome := public.archive_worker_enqueue_review_item('TEST:human-slot:approval','C_KNOWLEDGE','KNOWLEDGE',
    null,'P1','Rollback-only approval fixture','Synthetic contract verification','HIGH',
    'https://github.com/cetin072/survival-interactive-series/blob/'||repeat('c',40)||'/knowledge/content/briefs/K-999993.json',
    jsonb_build_object('brief_id','K-999993','pr_number',999993,'head_ref','knowledge/worker/semantic-test-human-slot','head_sha',repeat('c',40)));
  review := (outcome->>'id')::uuid;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
  outcome := public.archive_operator_decide_review_item(review,'APPROVED','Rollback-only contract test');
  select decided_at into approval from survival_ops.archive_review_items where id=review;
  insert into survival_ops.knowledge_review_publication_attempts(job_id,review_item_id,decided_at,approved_head_sha,
    semantic_result_sha256,source_sha256,policy_sha256,validated_main_sha,prepared_head_sha)
    values(fixture,review,approval,repeat('c',40),human.semantic_result_sha256,human.source_sha256,
      human.policy_sha256,human.main_sha_at_prepare,repeat('d',40));
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  payload := jsonb_build_object('brief_id','K-999993','prepared_sha',repeat('d',40),'merge_sha',repeat('e',40));
  receipt := public.archive_worker_record_review_consumption(review,approval,'CONSUMED',payload);
  select published_at into published_at_once from survival_ops.knowledge_semantic_jobs where job_id=fixture and status='PUBLISHED';
  if published_at_once is null then raise exception 'CONSUMER_DID_NOT_RESUME'; end if;
  outcome := public.archive_worker_record_review_consumption(review,approval,'CONSUMED',payload);
  if outcome is distinct from receipt or (select published_at from survival_ops.knowledge_semantic_jobs where job_id=fixture)
    is distinct from published_at_once then raise exception 'CONSUMER_RESUMED_MORE_THAN_ONCE'; end if;
  if exists(select 1 from public.archive_worker_list_approved_reviews(1) r(value) where r.value->>'id'=review::text)
    then raise exception 'CONSUMED_STILL_ELIGIBLE'; end if;
  if (select to_jsonb(j) from survival_ops.knowledge_semantic_jobs j where job_id=human.job_id) is distinct from before_job
    or (select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from survival_ops.archive_review_items r where r.payload->>'brief_id'='K-015')
      is distinct from before_inbox then raise exception 'REAL_K015_CHANGED'; end if;
end;
$test$;
select 'PASS: human-slot, source/work-key/brief dedupe, fresh/backfill admission, machine exclusion, no human dispatch, exact-once approval consumer, real K015 preserved' result;
rollback;
