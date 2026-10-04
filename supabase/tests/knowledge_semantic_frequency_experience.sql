\set ON_ERROR_STOP on
begin;

do $verify$
declare
  prepared jsonb;
  index integer;
begin
  if (select schedule from cron.job where jobname='afterfall-knowledge-semantic-prep-am') <> '45 20,2 * * *'
     or (select schedule from cron.job where jobname='afterfall-knowledge-semantic-prep-pm') <> '45 8,14 * * *'
     or (select count(*) from cron.job where jobname like 'afterfall-knowledge-semantic-%') <> 3 then
    raise exception 'C-PREP schedule not updated in place';
  end if;

  prepared := public.archive_knowledge_semantic_job_prepare(
    'FRESH_BRIEF','EXPERIENCE_SEED',
    'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json',
    repeat('a',64),'EXPERIENCE_SEED:EX-001','c3-test-v1',repeat('b',64),
    '{"synthetic":true}'::jsonb,repeat('1',40),
    '{"source":{"kind":"EXPERIENCE_SEED"},"target":{"brief_id":"K-999","candidate_id":"KC-synthetic"}}'::jsonb,
    'BLOCKED','SYNTHETIC_TEST'
  );
  if prepared->>'status' <> 'BLOCKED' or prepared->>'created' <> 'true' then
    raise exception 'Experience Seed source kind rejected: %', prepared;
  end if;

  for index in 1..4 loop
    insert into survival_ops.knowledge_semantic_jobs (
      job_type,status,source_kind,source_ref,source_sha256,work_key,
      policy_version,policy_sha256,policy_pin,main_sha_at_prepare,semantic_context,
      semantic_result,semantic_result_sha256,result_decision
    ) values (
      'FRESH_BRIEF','HOLD','PUBLIC_ARCHIVE','synthetic://daily-cap/' || index,
      repeat('c',64),'synthetic-daily-cap-' || index,
      'c3-test-v1',repeat('b',64),'{}'::jsonb,repeat('1',40),'{}'::jsonb,
      '{"decision":"HOLD"}'::jsonb,repeat('d',64),'HOLD'
    );
  end loop;
  prepared := public.archive_knowledge_semantic_job_prepare(
    'FRESH_BRIEF','PUBLIC_ARCHIVE','synthetic://daily-cap/fifth',
    repeat('a',64),'synthetic-fifth','c3-test-v1',repeat('b',64),
    '{}'::jsonb,repeat('1',40),'{}'::jsonb,'PREPARED',null
  );
  if prepared->>'status' <> 'DAILY_LIMIT_REACHED' then
    raise exception 'KST daily cap failed: %', prepared;
  end if;
end;
$verify$;

rollback;
