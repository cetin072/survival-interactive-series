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
  'illustration-char-published-recovery-0001',
  current_date-1,
  repeat('a',40),
  'point-'||repeat('b',64),
  'generation-'||repeat('c',64),
  'char-published-recovery',
  'Published recovery test',
  'native_chatgpt',
  'illustration-image-prompt-v1',
  'published recovery finalizer test prompt',
  repeat('d',64),
  1,
  'BLOCKED',
  'native_chatgpt_vision',
  'PASS',
  'chatgpt-library:file_published_recovery',
  'site-char-published-recovery-abc123',
  repeat('e',64),
  119272,
  341,
  512,
  'archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_CHAR_PUBLISHED_RECOVERY.json',
  repeat('f',40),
  5,
  'FINALIZER_PR_CHECK_FAILED',
  'PROGRAM_FINALIZER',
  'FINALIZER_PR_CHECK_FAILED',
  'PROGRAM_FINALIZER',
  clock_timestamp()
);

set role service_role;
select public.archive_illustration_finalizer_recover_lease_cap(
  'illustration-char-published-recovery-0001',
  repeat('e',64),
  'chatgpt-library:file_published_recovery',
  'site-char-published-recovery-abc123',
  'archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_CHAR_PUBLISHED_RECOVERY.json',
  repeat('f',40)
);
reset role;

do $$
declare
  v survival_ops.illustration_render_jobs%rowtype;
begin
  select * into v
  from survival_ops.illustration_render_jobs
  where job_id='illustration-char-published-recovery-0001';

  if v.status <> 'FINALIZE_QUEUED'
     or v.finalizer_failure_count <> 5
     or v.blocker_code is not null
     or v.blocker_stage is not null
     or v.last_error_code is not null
     or v.last_error_stage is not null
     or v.output_width <> 341
     or v.output_height <> 512
     or v.output_sha256 <> repeat('e',64) then
    raise exception 'PUBLISHED_ASSET_RECOVERY_READBACK_INVALID';
  end if;
end
$$;

rollback;

-- Continue the existing isolated B recovery suite; never run fixtures on production.
\ir ../migrations/20261015103000_illustration_finalizer_reported_timeout_recovery.sql
\ir illustration_finalizer_reported_timeout_recovery.sql
