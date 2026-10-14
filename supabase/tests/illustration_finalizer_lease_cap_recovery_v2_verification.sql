begin;

insert into survival_ops.illustration_render_jobs(
  job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,
  active_provider,prompt_contract,prompt_text,prompt_sha256,attempt_no,status,
  review_provider,review_decision,provider_asset_id,review_staging_id,
  output_sha256,output_bytes,output_width,output_height,
  identity_path,source_commit,
  finalizer_failure_count,blocker_code,blocker_stage,last_error_code,last_error_stage,
  last_heartbeat_at
) values (
  'illustration-char-old-recovery-0001',
  current_date-1,
  repeat('a',40),
  'point-'||repeat('b',64),
  'generation-'||repeat('c',64),
  'char-old-recovery',
  'Old recovery test',
  'native_chatgpt',
  'illustration-image-prompt-v1',
  'old test prompt for finalizer recovery',
  repeat('d',64),
  1,
  'BLOCKED',
  'native_chatgpt_vision',
  'PASS',
  'chatgpt-library:file_old_recovery',
  'site-char-old-recovery-abc123',
  repeat('e',64),
  119272,
  341,
  512,
  'archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_CHAR_OLD_RECOVERY.json',
  repeat('f',40),
  5,
  'JOB_LEASE_EXPIRED',
  'FINALIZER',
  'JOB_LEASE_EXPIRED',
  'FINALIZER',
  clock_timestamp()-interval '1 day'
);

insert into survival_ops.illustration_render_jobs(
  job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,
  active_provider,prompt_contract,prompt_text,prompt_sha256,attempt_no,status,
  lease_owner,lease_until,last_heartbeat_at
) values (
  'illustration-char-successor-0001',
  current_date,
  repeat('1',40),
  'point-'||repeat('2',64),
  'generation-'||repeat('3',64),
  'char-successor',
  'Successor test',
  'native_chatgpt',
  'illustration-image-prompt-v1',
  'successor test prompt before rendering',
  repeat('4',64),
  1,
  'PREPARED',
  'archive-illustration-prep',
  clock_timestamp()+interval '12 hours',
  clock_timestamp()
);

set role service_role;
select public.archive_illustration_finalizer_recover_lease_cap(
  'illustration-char-old-recovery-0001',
  repeat('e',64),
  'chatgpt-library:file_old_recovery',
  'site-char-old-recovery-abc123',
  'archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_CHAR_OLD_RECOVERY.json',
  repeat('f',40)
);
reset role;

do $$
declare
  v_old survival_ops.illustration_render_jobs%rowtype;
  v_next survival_ops.illustration_render_jobs%rowtype;
begin
  select * into v_old
  from survival_ops.illustration_render_jobs
  where job_id='illustration-char-old-recovery-0001';

  select * into v_next
  from survival_ops.illustration_render_jobs
  where job_id='illustration-char-successor-0001';

  if v_old.status <> 'FINALIZE_QUEUED'
     or v_old.finalizer_failure_count <> 5
     or v_old.blocker_code is not null
     or v_old.blocker_stage is not null then
    raise exception 'OLD_FINALIZER_RECOVERY_INVALID';
  end if;

  if v_next.status <> 'BLOCKED'
     or v_next.blocker_code <> 'PREVIOUS_FINALIZER_RECOVERY'
     or v_next.blocker_stage <> 'PREP'
     or v_next.output_sha256 is not null
     or v_next.provider_failure_count <> 0
     or v_next.ingest_failure_count <> 0
     or v_next.review_failure_count <> 0
     or v_next.finalizer_failure_count <> 0 then
    raise exception 'SUCCESSOR_PARK_INVALID';
  end if;
end
$$;

rollback;
