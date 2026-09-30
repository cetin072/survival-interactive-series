-- Run after 20260930090001_illustration_retry_leases_v1.sql in a transaction.
-- Synthetic queue rows, RPC effects, and lease transitions are all rolled back.
begin;
do $$
declare
  fixture_id text := 'test-illustration-lease-0001';
  sweep_result jsonb;
  acquired jsonb;
  finished jsonb;
  failure_result jsonb;
  v_row survival_ops.illustration_render_jobs%rowtype;
begin
  if has_function_privilege('anon','public.archive_illustration_render_job_lease_acquire(text,text,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.archive_illustration_render_jobs_sweep_stale()','EXECUTE')
     or has_function_privilege('authenticated','public.archive_illustration_render_job_record_failure(text,uuid,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.archive_illustration_render_job_lease_acquire(text,text,integer)','EXECUTE')
     or not has_function_privilege('service_role','public.archive_illustration_render_jobs_sweep_stale()','EXECUTE')
     or not has_function_privilege('service_role','public.archive_illustration_render_job_record_failure(text,uuid,text,text)','EXECUTE') then
    raise exception 'ILLUSTRATION_RETRY_LEASE_RPC_GRANTS_INVALID';
  end if;

  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,
    prompt_contract,prompt_text,prompt_sha256,attempt_no,status,lease_owner,lease_until,
    created_at,updated_at
  ) values (
    fixture_id,'2098-01-01',repeat('a',40),'point-'||repeat('1',64),
    'generation-'||repeat('2',64),'loc-retry-lease-fixture','Rollback-only lease fixture',
    'native_chatgpt','illustration-image-prompt-v1','A deterministic rollback-only illustration prompt fixture.',
    repeat('3',64),1,'PREPARED','test-worker',clock_timestamp()-interval '1 minute',
    clock_timestamp()-interval '2 hours',clock_timestamp()-interval '2 hours'
  );

  sweep_result := public.archive_illustration_render_jobs_sweep_stale();
  select * into v_row from survival_ops.illustration_render_jobs where job_id=fixture_id;
  if sweep_result->>'expired_jobs' <> '1'
     or v_row.status <> 'BLOCKED'
     or v_row.provider_failure_count <> 1
     or v_row.last_error_code <> 'JOB_LEASE_EXPIRED'
     or v_row.last_error_stage <> 'PROVIDER'
     or v_row.lease_token is not null then
    raise exception 'ILLUSTRATION_STALE_RENDER_LEASE_NOT_BLOCKED';
  end if;

  update survival_ops.illustration_render_jobs
  set status='FINALIZE_QUEUED',lease_until=null,last_error_code=null,last_error_stage=null
  where job_id=fixture_id;
  acquired := public.archive_illustration_render_job_lease_acquire(fixture_id,'test-finalizer',600);
  if acquired->>'status' <> 'LEASE_ACQUIRED'
     or acquired->>'lease_token' !~ '^[0-9a-f-]{36}$' then
    raise exception 'ILLUSTRATION_FINALIZER_LEASE_NOT_ACQUIRED';
  end if;

  finished := public.archive_illustration_render_job_finish(
    fixture_id,'BLOCKED',
    jsonb_build_object('lease_token',acquired->>'lease_token',
      'blocker_code','TEST_FINALIZER_FAILURE','blocker_stage','PROGRAM_FINALIZER')
  );
  select * into v_row from survival_ops.illustration_render_jobs where job_id=fixture_id;
  if finished->>'status' <> 'BLOCKED'
     or v_row.finalizer_failure_count <> 1
     or v_row.lease_token is not null
     or v_row.last_error_stage <> 'PROGRAM_FINALIZER' then
    raise exception 'ILLUSTRATION_FINALIZER_FAILURE_NOT_SEPARATED';
  end if;

  begin
    perform public.archive_illustration_render_job_finish(
      fixture_id,'SUCCEEDED',jsonb_build_object('lease_token',acquired->>'lease_token')
    );
    raise exception 'ILLUSTRATION_STALE_LEASE_TOKEN_ACCEPTED';
  exception when others then
    if sqlerrm='ILLUSTRATION_STALE_LEASE_TOKEN_ACCEPTED' then raise; end if;
  end;

  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,
    prompt_contract,prompt_text,prompt_sha256,attempt_no,status,lease_owner,lease_until
  ) values (
    'test-illustration-failure-0002','2098-01-02',repeat('a',40),'point-'||repeat('4',64),
    'generation-'||repeat('5',64),'loc-retry-failure-fixture','Rollback-only failure fixture',
    'native_chatgpt','illustration-image-prompt-v1','A second deterministic rollback-only fixture for retry separation.',
    repeat('6',64),1,'PREPARED','test-prep',clock_timestamp()+interval '1 hour'
  );
  acquired := public.archive_illustration_render_job_lease_acquire(
    'test-illustration-failure-0002','test-provider',600
  );
  failure_result := public.archive_illustration_render_job_record_failure(
    'test-illustration-failure-0002',(acquired->>'lease_token')::uuid,'PROVIDER','PROVIDER_TIMEOUT'
  );
  select * into v_row from survival_ops.illustration_render_jobs
  where job_id='test-illustration-failure-0002';
  if failure_result->>'status' <> 'RETRY_DEFERRED'
     or v_row.provider_failure_count <> 1
     or v_row.attempt_no <> 1
     or v_row.status <> 'BLOCKED'
     or v_row.last_error_stage <> 'PROVIDER' then
    raise exception 'ILLUSTRATION_INFRA_FAILURE_CONSUMED_SEMANTIC_ATTEMPT';
  end if;
end $$;
rollback;