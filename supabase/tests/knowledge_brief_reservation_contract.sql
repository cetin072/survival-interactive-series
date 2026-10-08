-- Run only in the isolated CI database. All fixtures roll back.
begin;
do $test$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  states text[] := array['HUMAN_REVIEW','BLOCKED','HOLD','BLOCKED','PREPARED'];
  decisions text[] := array['HUMAN_REVIEW','BRIEF_READY','HOLD','HUMAN_REVIEW',null];
  brief text; context jsonb; result jsonb; outcome jsonb; i integer;
begin
  -- Isolated fixtures also prove human review does not consume a machine slot.
  truncate survival_ops.knowledge_semantic_jobs cascade;
  for i in 1..5 loop
    brief := 'K-9990'||(14+i)::text;
    context := jsonb_build_object('target',jsonb_build_object('brief_id',brief,'candidate_id','KC-'||brief),
      'source',jsonb_build_object('ref','test/reservation/'||i,'sha256',repeat('a',64)));
    result := case when i=5 then null else jsonb_build_object('job_id',ids[i],'decision',decisions[i],
      'brief',jsonb_build_object('id',brief),'candidate',jsonb_build_object('brief_id',brief),
      'evidence',jsonb_build_object('brief_id',brief)) end;
    insert into survival_ops.knowledge_semantic_jobs(job_id,job_type,status,source_kind,source_ref,source_sha256,
      work_key,policy_version,policy_sha256,policy_pin,main_sha_at_prepare,semantic_context,
      semantic_result,semantic_result_sha256,result_decision,blocker_code,blocker_stage)
    values(ids[i],'FRESH_BRIEF',states[i],'PUBLIC_ARCHIVE','test/reservation/'||i,repeat('a',64),
      'test/reservation/'||i,'fixture',repeat('b',64),jsonb_build_object('sha256',repeat('b',64)),
      repeat('c',40),context,result,case when result is null then null else
      encode(extensions.digest(convert_to(result::text,'UTF8'),'sha256'),'hex') end,decisions[i],
      case when i in(2,4) then 'SEMANTIC_TARGET_BRIEF_STALE' when i=3 then 'SEMANTIC_DUPLICATE' end,
      case when i in(2,4) then 'FINALIZER' when i=3 then 'SEMANTIC' end);
  end loop;
  if (select count(distinct semantic_context->'target'->>'brief_id') from survival_ops.knowledge_semantic_jobs)<>5 then
    raise exception 'RESERVATION_IDENTITIES_LOST'; end if;
  for i in 2..4 by 2 loop
    select public.archive_knowledge_semantic_job_verify_reservation(job_id,semantic_context->'target'->>'brief_id',
      source_ref,source_sha256,policy_sha256,semantic_result_sha256) into outcome
      from survival_ops.knowledge_semantic_jobs where job_id=ids[i];
    if outcome->>'status'<>'VALID' then raise exception 'RESERVATION_INVALID:%',outcome; end if;
    select public.archive_knowledge_semantic_job_verify_reservation(job_id,'K-999019',
      source_ref,source_sha256,policy_sha256,semantic_result_sha256) into outcome
      from survival_ops.knowledge_semantic_jobs where job_id=ids[i];
    if outcome->>'code'<>'SEMANTIC_TARGET_BRIEF_STALE' then raise exception 'WRONG_ID_ACCEPTED'; end if;
    begin
      perform survival_ops.retry_knowledge_semantic_blocked_finalizer(ids[i],
        (select semantic_result_sha256 from survival_ops.knowledge_semantic_jobs where job_id=ids[i]),
        'SEMANTIC_TARGET_BRIEF_STALE');
      raise exception 'ACTIVE_SLOT_BYPASSED';
    exception when unique_violation then null; end;
  end loop;
  begin
    insert into survival_ops.knowledge_semantic_jobs
      select (jsonb_populate_record(null::survival_ops.knowledge_semantic_jobs,to_jsonb(j)||
        jsonb_build_object('job_id',gen_random_uuid(),'source_ref','other/job','work_key','other/job'))).*
      from survival_ops.knowledge_semantic_jobs j where job_id=ids[4];
    raise exception 'DUPLICATE_ACCEPTED';
  exception when raise_exception then
    if sqlerrm<>'KNOWLEDGE_SEMANTIC_BRIEF_RESERVED' then raise; end if;
  end;
  begin
    update survival_ops.knowledge_semantic_jobs set semantic_context=jsonb_set(semantic_context,'{target,brief_id}','"K-999020"') where job_id=ids[5];
    raise exception 'RESERVATION_CHANGED';
  exception when raise_exception then
    if sqlerrm<>'KNOWLEDGE_SEMANTIC_RESERVATION_IMMUTABLE' then raise; end if;
  end;
  if has_function_privilege('anon','public.archive_knowledge_semantic_job_verify_reservation(uuid,text,text,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.archive_knowledge_semantic_job_verify_reservation(uuid,text,text,text,text,text)','EXECUTE') then
    raise exception 'PUBLIC_RESERVATION_ACCESS'; end if;
end;
$test$;
select 'PASS: reservation history, collision, identity, retry slot, restricted grants' result;
rollback;
