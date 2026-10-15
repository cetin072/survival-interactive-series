\set ON_ERROR_STOP on
begin;

do $$
begin
  if has_function_privilege('anon','public.archive_illustration_finalizer_recover_check_timeout(text,text,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.archive_illustration_finalizer_recover_check_timeout(text,text,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.archive_illustration_finalizer_recover_check_timeout(text,text,text,text)','EXECUTE') then
    raise exception 'TIMEOUT_RECOVERY_ROLE_BOUNDARY_INVALID';
  end if;
end $$;

insert into survival_ops.illustration_render_jobs(
  job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,
  active_provider,prompt_contract,prompt_text,prompt_sha256,attempt_no,status,
  review_provider,review_decision,provider_asset_id,review_staging_id,
  output_sha256,output_bytes,output_width,output_height,
  identity_path,source_commit,finalizer_failure_count,
  blocker_code,blocker_stage,last_error_code,last_error_stage,last_heartbeat_at
) values (
  'illustration-char-reported-timeout-test',current_date-3,repeat('a',40),
  'point-'||repeat('b',64),'generation-'||repeat('c',64),'char-reported-timeout','Timeout test',
  'native_chatgpt','illustration-image-prompt-v1','isolated timeout recovery prompt',repeat('d',64),1,'BLOCKED',
  'native_chatgpt_vision','PASS','chatgpt-library:file_timeout_test','site-timeout-test',
  repeat('e',64),119272,341,512,
  'archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_CHAR_REPORTED_TIMEOUT.json',repeat('f',40),2,
  'FINALIZER_PR_CHECKS_TIMEOUT','PROGRAM_FINALIZER','FINALIZER_PR_CHECKS_TIMEOUT','PROGRAM_FINALIZER',clock_timestamp()
);

set role service_role;
do $$
declare
  before_row jsonb;
  after_row jsonb;
  reply jsonb;
begin
  select to_jsonb(j) into before_row from survival_ops.illustration_render_jobs j
  where job_id='illustration-char-reported-timeout-test';
  begin
    perform public.archive_illustration_finalizer_recover_check_timeout(
      'illustration-char-reported-timeout-test',repeat('0',64),'chatgpt-library:file_timeout_test','site-timeout-test');
    raise exception 'WRONG_BINDING_WAS_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  select to_jsonb(j) into after_row from survival_ops.illustration_render_jobs j
  where job_id='illustration-char-reported-timeout-test';
  if before_row is distinct from after_row then raise exception 'FAILED_RETRY_CHANGED_RECORD'; end if;

  reply := public.archive_illustration_finalizer_recover_check_timeout(
    'illustration-char-reported-timeout-test',repeat('e',64),'chatgpt-library:file_timeout_test','site-timeout-test');
  if reply->>'status' <> 'FINALIZE_QUEUED' or reply->>'recovered_from' <> 'FINALIZER_PR_CHECKS_TIMEOUT'
     or (reply->>'finalizer_failure_count')::integer <> 2 then
    raise exception 'REPORTED_TIMEOUT_NOT_RECOVERED';
  end if;
  select to_jsonb(j) into after_row from survival_ops.illustration_render_jobs j
  where job_id='illustration-char-reported-timeout-test';
  if (before_row - array['status','finalized_at','blocker_code','blocker_stage','last_error_code','last_error_stage','lease_owner','lease_token','lease_until','updated_at','last_heartbeat_at'])
     is distinct from
     (after_row - array['status','finalized_at','blocker_code','blocker_stage','last_error_code','last_error_stage','lease_owner','lease_token','lease_until','updated_at','last_heartbeat_at']) then
    raise exception 'RECOVERY_CHANGED_IMMUTABLE_EVIDENCE';
  end if;
  begin
    perform public.archive_illustration_finalizer_recover_check_timeout(
      'illustration-char-reported-timeout-test',repeat('e',64),'chatgpt-library:file_timeout_test','site-timeout-test');
    raise exception 'DUPLICATE_RETRY_WAS_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset role;

-- Missing review, live lease, unrelated failure and exhausted budget remain blocked.
do $$
declare
  scenario integer;
begin
  for scenario in 1..4 loop
    update survival_ops.illustration_render_jobs
    set status='BLOCKED', blocker_code=case when scenario=3 then 'FINALIZER_PR_CHECK_FAILED' else 'FINALIZER_PR_CHECKS_TIMEOUT' end,
        blocker_stage='PROGRAM_FINALIZER', review_decision=case when scenario=1 then null else 'PASS' end,
        finalizer_failure_count=case when scenario=4 then 5 else 2 end,
        lease_token=case when scenario=2 then gen_random_uuid() else null end,
        lease_until=case when scenario=2 then clock_timestamp()+interval '5 minutes' else null end
    where job_id='illustration-char-reported-timeout-test';
    begin
      perform public.archive_illustration_finalizer_recover_check_timeout(
        'illustration-char-reported-timeout-test',repeat('e',64),'chatgpt-library:file_timeout_test','site-timeout-test');
      raise exception 'UNSAFE_RECOVERY_ACCEPTED scenario %', scenario;
    exception when sqlstate '22023' then null;
    end;
  end loop;
end $$;
rollback;
