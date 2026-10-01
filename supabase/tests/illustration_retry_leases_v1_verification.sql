-- Run after 20260930090001_illustration_retry_leases_v1.sql in a transaction.
-- Synthetic queue rows, RPC effects, and lease transitions are all rolled back.
begin;
-- Transaction-local network sink: even if this database contains a Vault token,
-- the prep entrypoint cannot send an HTTP request during this verifier.
create schema if not exists net;
create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000
)
returns bigint language sql volatile set search_path=pg_catalog as $$
  select -998::bigint
$$;
create schema if not exists vault;
create table if not exists vault.decrypted_secrets(
  name text, decrypted_secret text, created_at timestamptz
);
insert into vault.decrypted_secrets(name,decrypted_secret,created_at)
values('archive_github_dispatch_token',repeat('test-token-',4),clock_timestamp());
-- Transaction-local safe finalizer dispatch sink: restored by ROLLBACK.
create or replace function archive_ops.dispatch_afterfall_illustration_finalize(p_job_id text)
returns bigint language sql volatile security definer set search_path=pg_catalog as $$
  select -999::bigint
$$;
do $$
declare
  fixture_id text := 'test-illustration-lease-0001';
  sweep_result jsonb;
  acquired jsonb;
  finished jsonb;
  failure_result jsonb;
  v_kind text;
  v_row survival_ops.illustration_render_jobs%rowtype;
  prep_request bigint;
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

  foreach v_kind in array array['PROVIDER','INGEST','REVIEW','FINALIZER'] loop
    insert into survival_ops.illustration_render_jobs(
      job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,
      prompt_contract,prompt_text,prompt_sha256,attempt_no,status,lease_owner,lease_until
    ) values (
      'test-infrastructure-'||lower(v_kind),date '2098-01-03'+array_position(array['PROVIDER','INGEST','REVIEW','FINALIZER'],v_kind)-1,repeat('a',40),
      'point-'||repeat('5',64),'generation-'||repeat('6',64),'loc-infra-'||lower(v_kind),
      'Rollback-only infrastructure failure fixture','native_chatgpt','illustration-image-prompt-v1',
      'A deterministic rollback-only infrastructure retry fixture.',repeat('7',64),1,'PREPARED',
      'test-infra',clock_timestamp()+interval '1 hour'
    );
    acquired:=public.archive_illustration_render_job_lease_acquire('test-infrastructure-'||lower(v_kind),'test-infra',600);
    perform public.archive_illustration_render_job_record_failure(
      'test-infrastructure-'||lower(v_kind),(acquired->>'lease_token')::uuid,v_kind,'TEST_INFRA_FAILURE'
    );
    if (select attempt_no from survival_ops.illustration_render_jobs where job_id='test-infrastructure-'||lower(v_kind))<>1 then
      raise exception 'ILLUSTRATION_INFRA_FAILURE_CONSUMED_SEMANTIC_ATTEMPT:%',v_kind;
    end if;
  end loop;

  -- A semantic REJECT is the only event that consumes attempt_no.
  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,
    prompt_contract,prompt_text,prompt_sha256,attempt_no,status,lease_owner,lease_until
  ) values (
    'test-illustration-semantic-0003','2098-01-08',repeat('a',40),
    'point-'||repeat('7',64),'generation-'||repeat('8',64),'loc-semantic-fixture','Semantic reject fixture',
    'native_chatgpt','illustration-image-prompt-v1','A deterministic rollback-only semantic reject fixture.',
    repeat('9',64),1,'PREPARED','test-review',clock_timestamp()+interval '1 hour'
  );
  acquired:=public.archive_illustration_render_job_lease_acquire('test-illustration-semantic-0003','test-review',600);
  perform public.archive_illustration_review_complete(jsonb_build_object(
    'job_id','test-illustration-semantic-0003','lease_token',acquired->>'lease_token',
    'decision','REJECT','review_provider','native_chatgpt_vision','output_sha256',repeat('b',64),
    'output_bytes',100,'output_width',10,'output_height',10,'rejection_codes',jsonb_build_array('COMPOSITION_MISMATCH')
  ));
  select * into v_row from survival_ops.illustration_render_jobs where job_id='test-illustration-semantic-0003';
  if v_row.review_decision<>'REJECT' or v_row.attempt_no<>1 then
    raise exception 'ILLUSTRATION_SEMANTIC_REJECT_ATTEMPT_ACCOUNTING_INVALID';
  end if;

  -- Stale/wrong/replayed tokens cannot mutate reviewer state; a valid token can.
  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,
    prompt_contract,prompt_text,prompt_sha256,attempt_no,status,lease_owner,lease_until
  ) values (
    'test-illustration-token-0004','2098-01-09',repeat('a',40),
    'point-'||repeat('c',64),'generation-'||repeat('d',64),'loc-token-fixture','Token fixture',
    'native_chatgpt','illustration-image-prompt-v1','A deterministic rollback-only lease token fixture.',
    repeat('e',64),1,'PREPARED','test-review',clock_timestamp()+interval '1 hour'
  );
  acquired:=public.archive_illustration_render_job_lease_acquire('test-illustration-token-0004','test-review',600);
  update survival_ops.illustration_render_jobs set lease_until=clock_timestamp()-interval '1 second'
    where job_id='test-illustration-token-0004';
  begin
    perform public.archive_illustration_review_complete(jsonb_build_object(
      'job_id','test-illustration-token-0004','lease_token',acquired->>'lease_token','decision','REJECT',
      'review_provider','native_chatgpt_vision','output_sha256',repeat('f',64),'output_bytes',100,
      'output_width',10,'output_height',10,'rejection_codes',jsonb_build_array('TEST')
    ));
    raise exception 'ILLUSTRATION_EXPIRED_REVIEW_LEASE_ACCEPTED';
  exception when others then
    if sqlerrm='ILLUSTRATION_EXPIRED_REVIEW_LEASE_ACCEPTED' then raise; end if;
  end;
  acquired:=public.archive_illustration_render_job_lease_acquire('test-illustration-token-0004','test-review',600);
  begin
    perform public.archive_illustration_review_complete(jsonb_build_object(
      'job_id','test-illustration-token-0004','lease_token','00000000-0000-0000-0000-000000000000','decision','REJECT',
      'review_provider','native_chatgpt_vision','output_sha256',repeat('f',64),'output_bytes',100,
      'output_width',10,'output_height',10,'rejection_codes',jsonb_build_array('TEST')
    ));
    raise exception 'ILLUSTRATION_WRONG_REVIEW_LEASE_ACCEPTED';
  exception when others then
    if sqlerrm='ILLUSTRATION_WRONG_REVIEW_LEASE_ACCEPTED' then raise; end if;
  end;
  perform public.archive_illustration_review_complete(jsonb_build_object(
    'job_id','test-illustration-token-0004','lease_token',acquired->>'lease_token','decision','REJECT',
    'review_provider','native_chatgpt_vision','output_sha256',repeat('f',64),'output_bytes',100,
    'output_width',10,'output_height',10,'rejection_codes',jsonb_build_array('TEST')
  ));
  begin
    perform public.archive_illustration_review_complete(jsonb_build_object(
      'job_id','test-illustration-token-0004','lease_token',acquired->>'lease_token','decision','REJECT',
      'review_provider','native_chatgpt_vision','output_sha256',repeat('f',64),'output_bytes',100,
      'output_width',10,'output_height',10,'rejection_codes',jsonb_build_array('TEST')
    ));
    raise exception 'ILLUSTRATION_REPLAY_REVIEW_LEASE_ACCEPTED';
  exception when others then
    if sqlerrm='ILLUSTRATION_REPLAY_REVIEW_LEASE_ACCEPTED' then raise; end if;
  end;

  -- HUMAN_REVIEW owns a fixed 7-day SLA, with no worker lease to inherit.
  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,
    prompt_contract,prompt_text,prompt_sha256,attempt_no,status,lease_owner,lease_until
  ) values (
    'test-illustration-human-0005','2098-01-10',repeat('a',40),
    'point-'||repeat('a',64),'generation-'||repeat('b',64),'loc-human-fixture','Human SLA fixture',
    'native_chatgpt','illustration-image-prompt-v1','A deterministic rollback-only human review fixture.',
    repeat('c',64),1,'PREPARED','test-review',clock_timestamp()+interval '1 hour'
  );
  acquired:=public.archive_illustration_render_job_lease_acquire('test-illustration-human-0005','test-review',600);
  perform public.archive_illustration_review_complete(jsonb_build_object(
    'job_id','test-illustration-human-0005','lease_token',acquired->>'lease_token','decision','HUMAN_REVIEW',
    'review_provider','native_chatgpt_vision','output_sha256',repeat('d',64),'output_bytes',100,
    'output_width',10,'output_height',10,'rejection_codes',jsonb_build_array()
  ));
  select * into v_row from survival_ops.illustration_render_jobs where job_id='test-illustration-human-0005';
  if v_row.status<>'HUMAN_REVIEW' or v_row.lease_owner is not null or v_row.lease_token is not null
     or v_row.lease_until not between clock_timestamp()+interval '6 days 23 hours 59 minutes'
       and clock_timestamp()+interval '7 days 1 minute' then
    raise exception 'ILLUSTRATION_HUMAN_REVIEW_SLA_NOT_SET';
  end if;
  update survival_ops.illustration_render_jobs set lease_until=clock_timestamp()+interval '1 hour'
    where job_id='test-illustration-human-0005';
  perform public.archive_illustration_render_jobs_sweep_stale();
  if (select status from survival_ops.illustration_render_jobs where job_id='test-illustration-human-0005')<>'HUMAN_REVIEW' then
    raise exception 'ILLUSTRATION_HUMAN_REVIEW_EXPIRED_EARLY';
  end if;
  update survival_ops.illustration_render_jobs set lease_until=clock_timestamp()-interval '1 second'
    where job_id='test-illustration-human-0005';
  perform public.archive_illustration_render_jobs_sweep_stale();
  if (select last_error_code from survival_ops.illustration_render_jobs where job_id='test-illustration-human-0005')<>'HUMAN_REVIEW_SLA_EXPIRED' then
    raise exception 'ILLUSTRATION_HUMAN_REVIEW_SLA_NOT_FAILED_CLOSED';
  end if;

  -- KST calendar-day identity switches exactly at midnight, not UTC midnight.
  if public.archive_illustration_kst_date(timestamp with time zone '2026-09-30 14:59:00+00')<>
       date '2026-09-30'
     or public.archive_illustration_kst_date(timestamp with time zone '2026-09-30 15:01:00+00')<>
       date '2026-10-01' then
    raise exception 'ILLUSTRATION_KST_DAILY_BOUNDARY_INVALID';
  end if;

  -- Invalid enqueue must fail before the sweeper can mutate an expired row.
  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,
    prompt_contract,prompt_text,prompt_sha256,attempt_no,status,lease_owner,lease_until
  ) values (
    'test-illustration-invalid-enqueue-0006','2098-01-11',repeat('a',40),'point-'||repeat('2',64),
    'generation-'||repeat('3',64),'loc-invalid-enqueue','Invalid enqueue ordering fixture','native_chatgpt',
    'illustration-image-prompt-v1','A deterministic rollback-only invalid enqueue fixture.',repeat('4',64),
    1,'PREPARED','test-expired',clock_timestamp()-interval '1 hour'
  );
  begin
    perform public.archive_illustration_render_job_enqueue(jsonb_build_object('job_id','invalid'));
    raise exception 'ILLUSTRATION_INVALID_ENQUEUE_ACCEPTED';
  exception when others then
    if sqlerrm='ILLUSTRATION_INVALID_ENQUEUE_ACCEPTED' then raise; end if;
  end;
  if (select status from survival_ops.illustration_render_jobs where job_id='test-illustration-invalid-enqueue-0006')<>'PREPARED' then
    raise exception 'ILLUSTRATION_INVALID_ENQUEUE_TRIGGERED_STALE_SWEEP';
  end if;
  update survival_ops.illustration_render_jobs set status='BLOCKED',lease_until=null,lease_owner=null
    where job_id='test-illustration-invalid-enqueue-0006';

  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,
    prompt_contract,prompt_text,prompt_sha256,attempt_no,status,lease_owner,lease_token,lease_until
  ) values (
    'test-illustration-stale-dispatch-0007','2098-01-07',repeat('a',40),'point-'||repeat('8',64),
    'generation-'||repeat('9',64),'loc-stale-dispatch','Rollback-only dispatch fixture','native_chatgpt',
    'illustration-image-prompt-v1','A deterministic rollback-only stale dispatch fixture.',repeat('a',64),
    1,'FINALIZE_QUEUED','test-expired','00000000-0000-0000-0000-000000000007',clock_timestamp()-interval '1 second'
  );
  -- Anon/authenticated cannot invoke the guarded dispatcher, even when the
  -- request claim and database role agree with their own low-privilege role.
  foreach v_kind in array array['anon','authenticated'] loop
    perform set_config('request.jwt.claim.role',v_kind,true);
    perform set_config('role',v_kind,true);
    begin
      perform public.archive_illustration_finalizer_dispatch_guarded('missing-job');
      raise exception 'ILLUSTRATION_LOW_PRIVILEGE_DISPATCH_ACCEPTED:%',v_kind;
    exception when insufficient_privilege then
      null;
    end;
    perform set_config('role','none',true);
  end loop;

  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('role','service_role',true);
  sweep_result:=public.archive_illustration_render_jobs_sweep_stale();
  perform set_config('role','none',true);
  select * into v_row from survival_ops.illustration_render_jobs where job_id='test-illustration-stale-dispatch-0007';
  if sweep_result->>'finalizer_dispatched'<>'1' or v_row.finalizer_dispatch_request_id<>-999
     or v_row.status<>'FINALIZE_QUEUED' then
    raise exception 'ILLUSTRATION_SERVICE_ROLE_GUARDED_DISPATCH_FAILED';
  end if;

  update survival_ops.illustration_render_jobs set lease_token='00000000-0000-0000-0000-000000000008',
    lease_until=clock_timestamp()+interval '1 hour' where job_id='test-illustration-stale-dispatch-0007';
  begin
    perform public.archive_illustration_finalizer_dispatch_guarded('test-illustration-stale-dispatch-0007');
    raise exception 'ILLUSTRATION_NONEXPIRED_DISPATCH_ACCEPTED';
  exception when others then
      if sqlerrm='ILLUSTRATION_NONEXPIRED_DISPATCH_ACCEPTED' then raise; end if;
  end;
  update survival_ops.illustration_render_jobs set status='PREPARED',lease_until=clock_timestamp()-interval '1 second'
    where job_id='test-illustration-stale-dispatch-0007';
  begin
    perform public.archive_illustration_finalizer_dispatch_guarded('test-illustration-stale-dispatch-0007');
    raise exception 'ILLUSTRATION_WRONG_STATUS_DISPATCH_ACCEPTED';
  exception when others then
    if sqlerrm='ILLUSTRATION_WRONG_STATUS_DISPATCH_ACCEPTED' then raise; end if;
  end;

  -- Invoke the actual postgres-owned pg_cron entrypoint. Its stale sweep must
  -- run before Vault/GitHub dispatch; the net.http_post stub above keeps this
  -- rollback-only verifier offline, and all test objects roll back below.
  update survival_ops.illustration_render_jobs set status='BLOCKED',lease_token=null,
    lease_until=null,lease_owner=null where job_id='test-illustration-stale-dispatch-0007';
  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,
    prompt_contract,prompt_text,prompt_sha256,attempt_no,status,lease_owner,lease_token,lease_until
  ) values (
    'test-illustration-cron-dispatch-0008','2098-01-12',repeat('a',40),'point-'||repeat('b',64),
    'generation-'||repeat('c',64),'loc-cron-dispatch','Rollback-only cron dispatch fixture','native_chatgpt',
    'illustration-image-prompt-v1','A deterministic rollback-only cron dispatch fixture.',repeat('d',64),
    1,'FINALIZING','test-cron','00000000-0000-0000-0000-000000000009',clock_timestamp()-interval '1 second'
  );
  perform set_config('request.jwt.claim.role','',true);
  perform set_config('role','none',true);
  if position('dispatch_afterfall_illustration_sweep' in pg_get_functiondef(
       'archive_ops.dispatch_afterfall_illustration_prep()'::regprocedure))=0 then
    raise exception 'ILLUSTRATION_PREP_CRON_SWEEP_PATH_MISSING';
  end if;
  prep_request:=archive_ops.dispatch_afterfall_illustration_prep();
  select * into v_row from survival_ops.illustration_render_jobs
    where job_id='test-illustration-cron-dispatch-0008';
  if v_row.finalizer_dispatch_request_id<>-999
     or v_row.status<>'FINALIZE_QUEUED'
     or (prep_request is not null and prep_request<>-998) then
    raise exception 'ILLUSTRATION_PGCRON_POSTGRES_DISPATCH_FAILED';
  end if;

  if has_function_privilege('anon','public.archive_illustration_finalizer_dispatch_guarded(text)','EXECUTE')
     or has_function_privilege('authenticated','public.archive_illustration_finalizer_dispatch_guarded(text)','EXECUTE')
     or has_function_privilege('service_role','archive_ops.dispatch_afterfall_illustration_finalize(text)','EXECUTE')
     or has_function_privilege('anon','archive_ops.dispatch_afterfall_illustration_prep()','EXECUTE')
     or has_function_privilege('authenticated','archive_ops.dispatch_afterfall_illustration_prep()','EXECUTE')
     or has_function_privilege('service_role','archive_ops.dispatch_afterfall_illustration_prep()','EXECUTE')
     or has_function_privilege('service_role','archive_ops.dispatch_afterfall_illustration_sweep()','EXECUTE')
     or not has_function_privilege('postgres','archive_ops.dispatch_afterfall_illustration_sweep()','EXECUTE')
     or not has_function_privilege('service_role','public.archive_illustration_finalizer_dispatch_guarded(text)','EXECUTE') then
    raise exception 'ILLUSTRATION_GUARDED_DISPATCH_GRANTS_INVALID';
  end if;
end $$;
rollback;
