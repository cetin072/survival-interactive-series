-- Recover an Automation B PASS asset only after a FINALIZER lease-cap stall.
-- GitHub PR/check/request identity is fail-closed validated by the current-main
-- Program Finalizer before this service-role-only state transition is called.

create or replace function public.archive_illustration_finalizer_recover_lease_cap(
  p_job_id text,
  p_expected_output_sha256 text,
  p_expected_provider_asset_id text,
  p_expected_review_staging_id text,
  p_expected_identity_path text,
  p_expected_source_commit text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path='pg_catalog','survival_ops'
as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
begin
  if coalesce(p_job_id,'') !~ '^[a-z0-9][a-z0-9-]{7,119}$'
     or coalesce(p_expected_output_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_expected_provider_asset_id,'') = ''
     or coalesce(p_expected_review_staging_id,'') = ''
     or coalesce(p_expected_identity_path,'') !~ '^archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_[A-Z0-9_]+[.]json$'
     or coalesce(p_expected_source_commit,'') !~ '^[a-f0-9]{40}$' then
    raise exception 'ILLUSTRATION_FINALIZER_LEASE_CAP_RECOVERY_ARGUMENT_INVALID'
      using errcode='22023';
  end if;

  select * into v_job
  from survival_ops.illustration_render_jobs
  where job_id=p_job_id
  for update;

  if not found then
    raise exception 'ILLUSTRATION_RENDER_JOB_NOT_FOUND' using errcode='22023';
  end if;

  if v_job.status <> 'BLOCKED'
     or v_job.blocker_code <> 'JOB_LEASE_EXPIRED'
     or v_job.blocker_stage <> 'FINALIZER'
     or v_job.review_decision <> 'PASS'
     or v_job.finalizer_failure_count < 5
     or v_job.output_sha256 is distinct from p_expected_output_sha256
     or v_job.provider_asset_id is distinct from p_expected_provider_asset_id
     or v_job.review_staging_id is distinct from p_expected_review_staging_id
     or v_job.identity_path is distinct from p_expected_identity_path
     or v_job.source_commit is distinct from p_expected_source_commit
     or coalesce(v_job.output_width,0) not between 1 and 512
     or coalesce(v_job.output_height,0) not between 1 and 512
     or greatest(v_job.output_width,v_job.output_height) <> 512
     or coalesce(v_job.output_bytes,0) <= 0
     or (v_job.lease_token is not null and v_job.lease_until > clock_timestamp()) then
    raise exception 'ILLUSTRATION_FINALIZER_LEASE_CAP_RECOVERY_NOT_ELIGIBLE'
      using errcode='22023';
  end if;

  update survival_ops.illustration_render_jobs
  set
    status='FINALIZE_QUEUED',
    finalized_at=null,
    blocker_code=null,
    blocker_stage=null,
    last_error_code=null,
    last_error_stage=null,
    lease_owner=null,
    lease_token=null,
    lease_until=null,
    updated_at=clock_timestamp(),
    last_heartbeat_at=clock_timestamp()
  where job_id=p_job_id
  returning * into v_job;

  return jsonb_build_object(
    'status',v_job.status,
    'job_id',v_job.job_id,
    'recovered_from','JOB_LEASE_EXPIRED',
    'finalizer_failure_count',v_job.finalizer_failure_count,
    'output_sha256',v_job.output_sha256,
    'identity_path',v_job.identity_path
  );
end
$$;

revoke all on function public.archive_illustration_finalizer_recover_lease_cap(
  text,text,text,text,text,text
) from public;
revoke all on function public.archive_illustration_finalizer_recover_lease_cap(
  text,text,text,text,text,text
) from anon;
revoke all on function public.archive_illustration_finalizer_recover_lease_cap(
  text,text,text,text,text,text
) from authenticated;
grant execute on function public.archive_illustration_finalizer_recover_lease_cap(
  text,text,text,text,text,text
) to service_role;

notify pgrst,'reload schema';
