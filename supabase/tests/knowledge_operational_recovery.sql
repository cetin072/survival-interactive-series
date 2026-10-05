\set ON_ERROR_STOP on
-- Isolated CI database only; all fixture rows roll back.
begin;
-- Earlier crash-recovery tests retain a fixture row. Establish a clean budget
-- only in this isolated CI transaction; rollback restores those earlier fixtures.
truncate survival_ops.knowledge_semantic_jobs cascade;
do $verify$
declare
  v_result jsonb;
  v_existing uuid;
  v_index integer;
  v_today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
begin
  if (select schedule from cron.job where jobname='afterfall-knowledge-semantic-prep-am') <> '45 20,2 * * *'
    or (select schedule from cron.job where jobname='afterfall-knowledge-semantic-prep-pm') <> '45 8,14 * * *'
    or (select count(*) from cron.job where jobname like 'afterfall-knowledge-semantic-%') <> 3 then
    raise exception 'existing schedules were not updated in place';
  end if;
  if has_function_privilege('anon','public.archive_knowledge_semantic_job_prepare(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text)','execute')
    or has_function_privilege('authenticated','public.archive_knowledge_semantic_job_prepare(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text)','execute') then
    raise exception 'prepare grant widened';
  end if;
  -- An older KST day does not consume today's budget, even when UTC dates overlap.
  insert into survival_ops.knowledge_semantic_jobs (
    job_type,status,source_kind,source_ref,source_sha256,work_key,policy_version,
    policy_sha256,policy_pin,main_sha_at_prepare,semantic_context,created_at
  ) values ('FRESH_BRIEF','BLOCKED','PUBLIC_ARCHIVE','synthetic://prior-kst-day',repeat('a',64),
    'recovery-prior-day','test',repeat('b',64),'{}',repeat('1',40),'{}',
    (v_today::timestamp at time zone 'Asia/Seoul') - interval '1 second');
  for v_index in 1..4 loop
    v_result := public.archive_knowledge_semantic_job_prepare(
      'FRESH_BRIEF','USER_REPORTED_EXPERIENCE',
      'knowledge/content/experience-seeds/EX-002-recovery-'||v_index||'.json',repeat('a',64),
      'recovery-cap-'||v_index,'test',repeat('b',64),'{}',repeat('1',40),'{}','BLOCKED','SYNTHETIC');
    if v_result->>'created' <> 'true' then raise exception 'admission % failed: %',v_index,v_result; end if;
    if v_index=1 then v_existing := (v_result->>'job_id')::uuid; end if;
  end loop;
  v_result := public.archive_knowledge_semantic_job_prepare(
    'FRESH_BRIEF','USER_REPORTED_EXPERIENCE','knowledge/content/experience-seeds/EX-002-recovery-1.json',
    repeat('a',64),'recovery-cap-1','test',repeat('b',64),'{}',repeat('1',40),'{}','BLOCKED','SYNTHETIC');
  if v_result->>'status' <> 'EXISTING_JOB' or v_result->>'job_id' <> v_existing::text then
    raise exception 'retry was counted as new: %',v_result;
  end if;
  v_result := public.archive_knowledge_semantic_job_prepare(
    'FRESH_BRIEF','PUBLIC_ARCHIVE','synthetic://fifth',repeat('a',64),'recovery-fifth',
    'test',repeat('b',64),'{}',repeat('1',40),'{}','PREPARED',null);
  if v_result->>'status' <> 'DAILY_LIMIT_REACHED'
    or (select count(*) from survival_ops.knowledge_semantic_jobs where work_key like 'recovery-cap-%') <> 4 then
    raise exception 'BLOCKED jobs escaped KST cap: %',v_result;
  end if;
end;
$verify$;
rollback;
