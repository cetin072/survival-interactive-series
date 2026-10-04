-- Keep PASS transfer in REVIEW_PASS_STAGED until site staging is finalized.
-- FINALIZE_QUEUED and FINALIZING still enter FINALIZING on finalizer lease.
create or replace function public.archive_illustration_render_job_lease_acquire(
  p_job_id text,p_owner text,p_lease_seconds integer default 7200
)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_job survival_ops.illustration_render_jobs%rowtype; v_token uuid; v_until timestamptz;
begin
  if coalesce(p_owner,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,99}$'
     or p_lease_seconds is null or p_lease_seconds not between 60 and 7200 then
    raise exception 'ILLUSTRATION_LEASE_ARGUMENT_INVALID' using errcode='22023';
  end if;
  select * into v_job from survival_ops.illustration_render_jobs where job_id=p_job_id for update;
  if not found then raise exception 'ILLUSTRATION_RENDER_JOB_NOT_FOUND' using errcode='22023'; end if;
  if v_job.status not in ('PREPARED','INGESTING','READY_FOR_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING') then
    raise exception 'ILLUSTRATION_LEASE_STATE_INVALID' using errcode='22023';
  end if;
  if v_job.lease_token is not null and v_job.lease_until>clock_timestamp() then
    return jsonb_build_object('status','LEASE_HELD','job_id',p_job_id,'lease_until',v_job.lease_until);
  end if;
  v_token:=pg_catalog.gen_random_uuid(); v_until:=clock_timestamp()+make_interval(secs=>p_lease_seconds);
  update survival_ops.illustration_render_jobs set
    status=case when status in ('FINALIZE_QUEUED','FINALIZING') then 'FINALIZING' else status end,
    lease_owner=p_owner,lease_token=v_token,lease_until=v_until,last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
  where job_id=p_job_id;
  return jsonb_build_object('status','LEASE_ACQUIRED','job_id',p_job_id,'lease_token',v_token,'lease_until',v_until);
end $$;
