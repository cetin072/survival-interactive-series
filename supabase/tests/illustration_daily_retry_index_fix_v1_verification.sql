-- Verify same-day retry rows are allowed while one-active-job protection remains.
begin;

do $$
declare
  v_today date:=(clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_count integer;
begin
  if exists(
    select 1
    from pg_indexes
    where schemaname='survival_ops'
      and tablename='illustration_render_jobs'
      and indexname='illustration_render_jobs_one_per_kst_day_idx'
  ) then
    raise exception 'OBSOLETE_DAILY_UNIQUE_INDEX_STILL_PRESENT';
  end if;

  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,
    active_provider,prompt_contract,prompt_text,prompt_sha256,attempt_no,
    status,review_decision
  ) values (
    'test-daily-retry-1',v_today,repeat('a',40),
    'point-'||repeat('1',64),'generation-'||repeat('2',64),'loc-retry-test','Retry test 1',
    'native_chatgpt','illustration-image-prompt-v1','visual prompt one',repeat('3',64),1,
    'REVIEW_REJECTED','REJECT'
  );

  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,
    active_provider,prompt_contract,prompt_text,prompt_sha256,attempt_no,
    status
  ) values (
    'test-daily-retry-2',v_today,repeat('b',40),
    'point-'||repeat('4',64),'generation-'||repeat('5',64),'loc-retry-test-2','Retry test 2',
    'native_chatgpt','illustration-image-prompt-v1','visual prompt two',repeat('6',64),1,
    'PREPARED'
  );

  select count(*) into v_count
  from survival_ops.illustration_render_jobs
  where date_kst=v_today
    and job_id in ('test-daily-retry-1','test-daily-retry-2');

  if v_count<>2 then
    raise exception 'SAME_DAY_RETRY_ROWS_NOT_ALLOWED';
  end if;

  begin
    insert into survival_ops.illustration_render_jobs(
      job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,
      active_provider,prompt_contract,prompt_text,prompt_sha256,attempt_no,
      status
    ) values (
      'test-daily-retry-active-conflict',v_today,repeat('c',40),
      'point-'||repeat('7',64),'generation-'||repeat('8',64),'loc-retry-test-3','Retry test active conflict',
      'native_chatgpt','illustration-image-prompt-v1','visual prompt three',repeat('9',64),1,
      'INGESTING'
    );
    raise exception 'ONE_ACTIVE_JOB_GUARD_MISSING';
  exception
    when unique_violation then
      null;
  end;
end
$$;

rollback;
