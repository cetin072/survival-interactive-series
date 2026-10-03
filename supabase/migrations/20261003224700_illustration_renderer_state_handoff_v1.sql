-- Automation B renderer -> reviewer state handoff.
-- PREPARED means no confirmed render yet.
-- INGESTING means the renderer produced the bound image and review staging is pending/in progress.
-- READY_FOR_REVIEW means exact private review staging is READY and visual review may proceed.

create or replace function public.archive_illustration_render_job_provider_complete(
  p_job_id text,
  p_prompt_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path='pg_catalog','public','survival_ops'
as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
begin
  if coalesce(p_job_id,'')=''
     or coalesce(p_prompt_sha256,'') !~ '^[a-f0-9]{64}$' then
    raise exception 'ILLUSTRATION_PROVIDER_COMPLETE_ARGUMENT_INVALID' using errcode='22023';
  end if;

  select * into v_job
  from survival_ops.illustration_render_jobs
  where job_id=p_job_id
  for update;

  if not found then
    raise exception 'ILLUSTRATION_RENDER_JOB_NOT_FOUND' using errcode='22023';
  end if;

  if v_job.prompt_sha256<>p_prompt_sha256
     or v_job.active_provider<>'native_chatgpt' then
    raise exception 'ILLUSTRATION_PROVIDER_COMPLETE_BINDING_INVALID' using errcode='22023';
  end if;

  if v_job.status='PREPARED' then
    update survival_ops.illustration_render_jobs
    set status='INGESTING',
        lease_owner=null,
        lease_token=null,
        lease_until=clock_timestamp()+interval '90 minutes',
        last_heartbeat_at=clock_timestamp(),
        last_error_code=null,
        last_error_stage=null,
        blocker_code=null,
        blocker_stage=null,
        updated_at=clock_timestamp()
    where job_id=p_job_id;

    return jsonb_build_object(
      'status','INGESTING',
      'job_id',p_job_id,
      'prompt_sha256',p_prompt_sha256
    );
  end if;

  if v_job.status in ('INGESTING','READY_FOR_REVIEW') then
    return jsonb_build_object(
      'status',v_job.status,
      'job_id',p_job_id,
      'prompt_sha256',p_prompt_sha256,
      'idempotent',true
    );
  end if;

  raise exception 'ILLUSTRATION_PROVIDER_COMPLETE_STATE_INVALID' using errcode='22023';
end
$$;

revoke all on function public.archive_illustration_render_job_provider_complete(text,text)
  from public,anon,authenticated;
grant execute on function public.archive_illustration_render_job_provider_complete(text,text)
  to service_role;

-- Keep legacy internal staging code unchanged; the lease-bound wrapper performs
-- a transaction-local PREPARED compatibility transition and commits as INGESTING.
create or replace function public.archive_illustration_review_staging_begin(p_meta jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path='pg_catalog','public','survival_ops'
as $$
declare
  v_result jsonb;
  v_job_id text:=p_meta->>'job_id';
  v_token uuid;
begin
  begin
    v_token:=(p_meta->>'lease_token')::uuid;
  exception when others then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end;

  perform public.archive_illustration_assert_job_lease(
    v_job_id,
    v_token,
    array['PREPARED','INGESTING']
  );

  update survival_ops.illustration_render_jobs
  set status='PREPARED',updated_at=clock_timestamp()
  where job_id=v_job_id
    and lease_token=v_token
    and status='INGESTING';

  v_result:=public.archive_illustration_review_staging_begin_unleased_internal(
    p_meta-'lease_token'
  );

  update survival_ops.illustration_render_jobs
  set status='INGESTING',updated_at=clock_timestamp()
  where job_id=v_job_id
    and lease_token=v_token
    and status='PREPARED';

  return v_result;
end
$$;

create or replace function public.archive_illustration_review_staging_finalize(
  p_job_id text,
  p_lease_token uuid,
  p_staging_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path='pg_catalog','public','survival_ops'
as $$
declare
  v_staging_job text;
  v_result jsonb;
begin
  perform public.archive_illustration_assert_job_lease(
    p_job_id,
    p_lease_token,
    array['PREPARED','INGESTING','READY_FOR_REVIEW']
  );

  select job_id into v_staging_job
  from survival_ops.illustration_review_staging
  where staging_id=p_staging_id;

  if v_staging_job is distinct from p_job_id then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;

  v_result:=public.archive_illustration_review_staging_finalize_unleased_internal(
    p_staging_id
  );

  if v_result->>'status'<>'READY' then
    raise exception 'ILLUSTRATION_REVIEW_STAGING_FINALIZE_FAILED' using errcode='22023';
  end if;

  update survival_ops.illustration_render_jobs
  set status='READY_FOR_REVIEW',updated_at=clock_timestamp()
  where job_id=p_job_id
    and lease_token=p_lease_token
    and status in ('PREPARED','INGESTING','READY_FOR_REVIEW');

  if not found then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;

  return v_result;
end
$$;

-- The vault/finalizer implementation remains in the existing internal function.
-- This wrapper requires the externally meaningful READY_FOR_REVIEW state, then
-- uses a transaction-local PREPARED compatibility transition for that internal.
create or replace function public.archive_illustration_review_complete(p_review jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path='pg_catalog','public','survival_ops'
as $$
declare
  v_token uuid;
  v_job_id text:=p_review->>'job_id';
  v_result jsonb;
  v_decision text:=p_review->>'decision';
  v_job survival_ops.illustration_render_jobs%rowtype;
begin
  begin
    v_token:=(p_review->>'lease_token')::uuid;
  exception when others then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end;

  perform public.archive_illustration_assert_job_lease(
    v_job_id,
    v_token,
    array['READY_FOR_REVIEW']
  );

  select * into v_job
  from survival_ops.illustration_render_jobs
  where job_id=v_job_id
  for update;

  if not found then
    raise exception 'ILLUSTRATION_RENDER_JOB_NOT_FOUND' using errcode='22023';
  end if;

  if v_job.review_context_sha256 is not null
     and (
       p_review->>'review_context_sha256' is null
       or p_review->>'review_context_sha256' is distinct from v_job.review_context_sha256
     ) then
    raise exception 'ILLUSTRATION_REVIEW_CONTEXT_MISMATCH' using errcode='22023';
  end if;

  update survival_ops.illustration_render_jobs
  set status='PREPARED',updated_at=clock_timestamp()
  where job_id=v_job_id
    and lease_token=v_token
    and status='READY_FOR_REVIEW';

  if not found then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;

  v_result:=public.archive_illustration_review_complete_unleased_internal(
    p_review-'lease_token'-'review_context_sha256'
  );

  update survival_ops.illustration_render_jobs
  set lease_owner=null,
      lease_token=null,
      lease_until=case
        when v_decision='HUMAN_REVIEW' then clock_timestamp()+interval '7 days'
        else null
      end,
      last_heartbeat_at=case
        when v_decision='HUMAN_REVIEW' then clock_timestamp()
        else last_heartbeat_at
      end,
      updated_at=clock_timestamp()
  where job_id=v_job_id
    and status=case
      when v_decision='PASS' then 'FINALIZE_QUEUED'
      when v_decision='REJECT' then 'REVIEW_REJECTED'
      else 'HUMAN_REVIEW'
    end;

  return v_result;
end
$$;

notify pgrst,'reload schema';
