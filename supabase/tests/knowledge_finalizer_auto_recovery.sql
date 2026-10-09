\set ON_ERROR_STOP on
begin;

truncate survival_ops.knowledge_semantic_jobs cascade;
create temp table dispatch_calls(workflow text, origin text);

-- Keep this test offline and deterministic; rollback restores the real dispatcher.
create or replace function survival_ops.dispatch_knowledge_workflow(p_workflow text, p_origin text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into pg_temp.dispatch_calls(workflow,origin) values (p_workflow,p_origin);
  return 777;
end;
$$;

do $verify$
declare
  j16 uuid := '11111111-1111-4111-8111-111111111116';
  j18 uuid := '11111111-1111-4111-8111-111111111118';
  j19 uuid := '11111111-1111-4111-8111-111111111119';
  bad uuid := '11111111-1111-4111-8111-111111111120';
  r16 jsonb;
  r18 jsonb;
  rbad jsonb;
  h16 text;
  h18 text;
  hbad text;
  dispatched bigint;
begin
  r16 := jsonb_build_object(
    'version','knowledge-semantic-result-v1','job_id',j16::text,'decision','BRIEF_READY',
    'candidate',jsonb_build_object('id','KC-auto-016','brief_id','K-016','topic_id','T-AUTO','status','BRIEF_PROPOSED',
      'source_kind','PUBLIC_ARCHIVE','source_manifest_ref','synthetic://016','source_manifest_sha256',repeat('a',64),'question','Auto recovery 016?'),
    'evidence',jsonb_build_object('brief_id','K-016','question','Auto recovery 016?','claims',jsonb_build_array()),
    'brief',jsonb_build_object('id','K-016','title','Auto recovery 016?','topic_id','T-AUTO','content_type','BRIEF',
      'status','READY','risk_level','LOW','publication_policy','AUTO_LOW_RISK','semantic_qa_status','PASS')
  );
  r18 := jsonb_build_object(
    'version','knowledge-semantic-result-v1','job_id',j18::text,'decision','HUMAN_REVIEW','code','MATERIAL_UNKNOWNS','note','Review.',
    'candidate',jsonb_build_object('id','KC-auto-018','brief_id','K-018','topic_id','T-AUTO','status','BRIEF_PROPOSED',
      'source_kind','PUBLIC_ARCHIVE','source_manifest_ref','synthetic://018','source_manifest_sha256',repeat('b',64),'question','Auto recovery 018?'),
    'evidence',jsonb_build_object('brief_id','K-018','question','Auto recovery 018?','claims',jsonb_build_array()),
    'brief',jsonb_build_object('id','K-018','title','Auto recovery 018?','topic_id','T-AUTO','content_type','BRIEF',
      'status','READY','risk_level','HIGH','publication_policy','HUMAN_APPROVED','semantic_qa_status','REVIEW')
  );
  rbad := jsonb_build_object(
    'version','knowledge-semantic-result-v1','job_id',bad::text,'decision','BRIEF_READY',
    'candidate',jsonb_build_object('id','KC-auto-bad','brief_id','K-020','topic_id','T-AUTO','status','BRIEF_PROPOSED',
      'source_kind','PUBLIC_ARCHIVE','source_manifest_ref','synthetic://bad','source_manifest_sha256',repeat('c',64),'question','Bad recovery?'),
    'evidence',jsonb_build_object('brief_id','K-020','question','Bad recovery?','claims',jsonb_build_array()),
    'brief',jsonb_build_object('id','K-020','title','Bad recovery?','topic_id','T-AUTO','content_type','BRIEF',
      'status','READY','risk_level','LOW','publication_policy','AUTO_LOW_RISK','semantic_qa_status','PASS')
  );
  h16 := encode(extensions.digest(convert_to(r16::text,'UTF8'),'sha256'),'hex');
  h18 := encode(extensions.digest(convert_to(r18::text,'UTF8'),'sha256'),'hex');
  hbad := encode(extensions.digest(convert_to(rbad::text,'UTF8'),'sha256'),'hex');

  insert into survival_ops.knowledge_semantic_jobs(
    job_id,job_type,status,source_kind,source_ref,source_sha256,work_key,
    policy_version,policy_sha256,policy_pin,main_sha_at_prepare,semantic_context,
    semantic_result,semantic_result_sha256,result_decision,blocker_code,blocker_stage,
    submitted_at,prepared_at
  ) values
  (j16,'BACKFILL_BRIEF','BLOCKED','PUBLIC_ARCHIVE','synthetic://016',repeat('a',64),'auto-016',
    'ci',repeat('d',64),jsonb_build_object('sha256',repeat('d',64)),repeat('1',40),
    jsonb_build_object('source',jsonb_build_object('kind','PUBLIC_ARCHIVE','ref','synthetic://016','sha256',repeat('a',64)),
      'target',jsonb_build_object('brief_id','K-016','candidate_id','KC-auto-016')),
    r16,h16,'BRIEF_READY','SEMANTIC_TARGET_BRIEF_STALE','FINALIZER',clock_timestamp(),clock_timestamp()-interval '3 hours'),
  (j18,'BACKFILL_BRIEF','BLOCKED','PUBLIC_ARCHIVE','synthetic://018',repeat('b',64),'auto-018',
    'ci',repeat('d',64),jsonb_build_object('sha256',repeat('d',64)),repeat('1',40),
    jsonb_build_object('source',jsonb_build_object('kind','PUBLIC_ARCHIVE','ref','synthetic://018','sha256',repeat('b',64)),
      'target',jsonb_build_object('brief_id','K-018','candidate_id','KC-auto-018')),
    r18,h18,'HUMAN_REVIEW','SEMANTIC_TARGET_BRIEF_STALE','FINALIZER',clock_timestamp(),clock_timestamp()-interval '2 hours');

  -- A live PREPARED job owns the slot, so historical recovery must do nothing.
  insert into survival_ops.knowledge_semantic_jobs(
    job_id,job_type,status,source_kind,source_ref,source_sha256,work_key,
    policy_version,policy_sha256,policy_pin,main_sha_at_prepare,semantic_context,prepared_at
  ) values (
    j19,'FRESH_BRIEF','PREPARED','PUBLIC_ARCHIVE','synthetic://019',repeat('e',64),'auto-019',
    'ci',repeat('d',64),jsonb_build_object('sha256',repeat('d',64)),repeat('1',40),
    jsonb_build_object('source',jsonb_build_object('kind','PUBLIC_ARCHIVE','ref','synthetic://019','sha256',repeat('e',64)),
      'target',jsonb_build_object('brief_id','K-019','candidate_id','KC-auto-019')),
    clock_timestamp()
  );

  dispatched := survival_ops.dispatch_knowledge_semantic_finalizer();
  if dispatched is not null
    or (select status from survival_ops.knowledge_semantic_jobs where job_id=j16) <> 'BLOCKED'
    or exists(select 1 from pg_temp.dispatch_calls) then
    raise exception 'occupied machine slot allowed historical recovery';
  end if;

  delete from survival_ops.knowledge_semantic_jobs where job_id=j19;

  -- Slot is empty: exactly the oldest verified stale Finalizer result is retried
  -- and the existing workflow is dispatched.
  dispatched := survival_ops.dispatch_knowledge_semantic_finalizer();
  if dispatched <> 777
    or (select status from survival_ops.knowledge_semantic_jobs where job_id=j16) <> 'SUBMITTED'
    or (select status from survival_ops.knowledge_semantic_jobs where job_id=j18) <> 'BLOCKED'
    or (select count(*) from pg_temp.dispatch_calls) <> 1 then
    raise exception 'oldest eligible recovery did not dispatch exactly once';
  end if;

  -- Simulate K-016 leaving the machine slot. The next pulse recovers K-018.
  perform public.archive_knowledge_semantic_job_update(j16,'SUBMITTED','HOLD','CI_COMPLETE','SEMANTIC');
  dispatched := survival_ops.dispatch_knowledge_semantic_finalizer();
  if dispatched <> 777
    or (select status from survival_ops.knowledge_semantic_jobs where job_id=j18) <> 'SUBMITTED'
    or (select count(*) from pg_temp.dispatch_calls) <> 2 then
    raise exception 'second eligible recovery did not wait for slot release';
  end if;

  perform public.archive_knowledge_semantic_job_update(j18,'SUBMITTED','HOLD','CI_COMPLETE','SEMANTIC');

  -- A stale blocker with a changed immutable result digest is not retried and
  -- cannot trigger the Finalizer workflow.
  insert into survival_ops.knowledge_semantic_jobs(
    job_id,job_type,status,source_kind,source_ref,source_sha256,work_key,
    policy_version,policy_sha256,policy_pin,main_sha_at_prepare,semantic_context,
    semantic_result,semantic_result_sha256,result_decision,blocker_code,blocker_stage,
    submitted_at,prepared_at
  ) values (
    bad,'BACKFILL_BRIEF','BLOCKED','PUBLIC_ARCHIVE','synthetic://bad',repeat('c',64),'auto-bad',
    'ci',repeat('d',64),jsonb_build_object('sha256',repeat('d',64)),repeat('1',40),
    jsonb_build_object('source',jsonb_build_object('kind','PUBLIC_ARCHIVE','ref','synthetic://bad','sha256',repeat('c',64)),
      'target',jsonb_build_object('brief_id','K-020','candidate_id','KC-auto-bad')),
    rbad,repeat('f',64),'BRIEF_READY','SEMANTIC_TARGET_BRIEF_STALE','FINALIZER',
    clock_timestamp(),clock_timestamp()
  );

  dispatched := survival_ops.dispatch_knowledge_semantic_finalizer();
  if dispatched is not null
    or (select status from survival_ops.knowledge_semantic_jobs where job_id=bad) <> 'BLOCKED'
    or (select count(*) from pg_temp.dispatch_calls) <> 2 then
    raise exception 'invalid result identity was auto-retried';
  end if;

  update survival_ops.knowledge_semantic_jobs
    set semantic_result_sha256=hbad, blocker_code='KNOWLEDGE_CONTRACT'
  where job_id=bad;
  dispatched := survival_ops.dispatch_knowledge_semantic_finalizer();
  if dispatched is not null
    or (select status from survival_ops.knowledge_semantic_jobs where job_id=bad) <> 'BLOCKED'
    or (select count(*) from pg_temp.dispatch_calls) <> 2 then
    raise exception 'non-allowlisted blocker was auto-retried';
  end if;
end
$verify$;

rollback;
