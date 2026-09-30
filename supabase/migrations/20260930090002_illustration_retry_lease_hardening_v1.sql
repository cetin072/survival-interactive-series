-- Lease ownership hardening for Automation B. Internal legacy bodies are
-- inaccessible to API roles and only called after exact lease validation.
create or replace function public.archive_illustration_assert_job_lease(
  p_job_id text, p_lease_token uuid, p_statuses text[]
)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
  if p_job_id is null or p_lease_token is null or not exists (
    select 1 from survival_ops.illustration_render_jobs j
    where j.job_id=p_job_id and j.status=any(p_statuses)
      and j.lease_token=p_lease_token and j.lease_until>clock_timestamp()
  ) then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;
end $$;

alter function public.archive_illustration_review_staging_begin(jsonb)
  rename to archive_illustration_review_staging_begin_unleased_internal;
alter function public.archive_illustration_review_staging_chunk_put(text,integer,text)
  rename to archive_illustration_review_staging_chunk_put_unleased_internal;
alter function public.archive_illustration_review_staging_finalize(text)
  rename to archive_illustration_review_staging_finalize_unleased_internal;
alter function public.archive_illustration_review_complete(jsonb)
  rename to archive_illustration_review_complete_unleased_internal;
alter function public.archive_illustration_review_promote(text,text,text,text,text)
  rename to archive_illustration_review_promote_unleased_internal;
alter function public.archive_illustration_review_staging_cleanup(text,text)
  rename to archive_illustration_review_staging_cleanup_unleased_internal;

revoke all on function public.archive_illustration_review_staging_begin_unleased_internal(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.archive_illustration_review_staging_chunk_put_unleased_internal(text,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.archive_illustration_review_staging_finalize_unleased_internal(text) from public,anon,authenticated,service_role;
revoke all on function public.archive_illustration_review_complete_unleased_internal(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.archive_illustration_review_promote_unleased_internal(text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.archive_illustration_review_staging_cleanup_unleased_internal(text,text) from public,anon,authenticated,service_role;

create function public.archive_illustration_review_staging_begin(p_meta jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,survival_ops as $$
declare v_result jsonb; v_job_id text:=p_meta->>'job_id'; v_token uuid;
begin
  begin v_token:=(p_meta->>'lease_token')::uuid;
  exception when others then raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023'; end;
  perform public.archive_illustration_assert_job_lease(v_job_id,v_token,array['PREPARED']);
  v_result:=public.archive_illustration_review_staging_begin_unleased_internal(p_meta-'lease_token');
  return v_result;
end $$;

create function public.archive_illustration_review_staging_chunk_put(
  p_job_id text,p_lease_token uuid,p_staging_id text,p_chunk_index integer,p_chunk_b64 text
)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,survival_ops as $$
declare v_staging_job text;
begin
  perform public.archive_illustration_assert_job_lease(p_job_id,p_lease_token,array['PREPARED','INGESTING','READY_FOR_REVIEW']);
  select job_id into v_staging_job from survival_ops.illustration_review_staging where staging_id=p_staging_id;
  if v_staging_job is distinct from p_job_id then raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023'; end if;
  return public.archive_illustration_review_staging_chunk_put_unleased_internal(p_staging_id,p_chunk_index,p_chunk_b64);
end $$;

create function public.archive_illustration_review_staging_finalize(
  p_job_id text,p_lease_token uuid,p_staging_id text
)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,survival_ops as $$
declare v_staging_job text;
begin
  perform public.archive_illustration_assert_job_lease(p_job_id,p_lease_token,array['PREPARED','INGESTING','READY_FOR_REVIEW']);
  select job_id into v_staging_job from survival_ops.illustration_review_staging where staging_id=p_staging_id;
  if v_staging_job is distinct from p_job_id then raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023'; end if;
  return public.archive_illustration_review_staging_finalize_unleased_internal(p_staging_id);
end $$;

create function public.archive_illustration_review_complete(p_review jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,survival_ops as $$
declare v_token uuid; v_job_id text:=p_review->>'job_id'; v_result jsonb; v_decision text:=p_review->>'decision';
begin
  begin v_token:=(p_review->>'lease_token')::uuid;
  exception when others then raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023'; end;
  perform public.archive_illustration_assert_job_lease(v_job_id,v_token,array['PREPARED']);
  v_result:=public.archive_illustration_review_complete_unleased_internal(p_review-'lease_token');
  update survival_ops.illustration_render_jobs set
    lease_owner=null,lease_token=null,
    lease_until=case when v_decision='HUMAN_REVIEW' then clock_timestamp()+interval '7 days' else null end,
    last_heartbeat_at=case when v_decision='HUMAN_REVIEW' then clock_timestamp() else last_heartbeat_at end,
    updated_at=clock_timestamp()
  where job_id=v_job_id and status=case when v_decision='PASS' then 'FINALIZE_QUEUED'
    when v_decision='REJECT' then 'REVIEW_REJECTED' else 'HUMAN_REVIEW' end;
  return v_result;
end $$;

create function public.archive_illustration_review_promote(
  p_job_id text,p_review_staging_id text,p_handoff_staging_id text,
  p_source_commit text,p_identity_path text,p_lease_token uuid
)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,survival_ops as $$
begin
  perform public.archive_illustration_assert_job_lease(p_job_id,p_lease_token,array['FINALIZING']);
  return public.archive_illustration_review_promote_unleased_internal(
    p_job_id,p_review_staging_id,p_handoff_staging_id,p_source_commit,p_identity_path);
end $$;

create function public.archive_illustration_review_staging_cleanup(
  p_job_id text,p_lease_token uuid,p_staging_id text,p_source_sha256 text
)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,survival_ops as $$
declare v_staging_job text;
begin
  perform public.archive_illustration_assert_job_lease(p_job_id,p_lease_token,array['FINALIZING']);
  select job_id into v_staging_job from survival_ops.illustration_review_staging where staging_id=p_staging_id;
  if v_staging_job is distinct from p_job_id then raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023'; end if;
  return public.archive_illustration_review_staging_cleanup_unleased_internal(p_staging_id,p_source_sha256);
end $$;

revoke all on function public.archive_illustration_assert_job_lease(text,uuid,text[]) from public,anon,authenticated,service_role;
revoke all on function public.archive_illustration_review_staging_begin(jsonb) from public,anon,authenticated;
revoke all on function public.archive_illustration_review_staging_chunk_put(text,uuid,text,integer,text) from public,anon,authenticated;
revoke all on function public.archive_illustration_review_staging_finalize(text,uuid,text) from public,anon,authenticated;
revoke all on function public.archive_illustration_review_complete(jsonb) from public,anon,authenticated;
revoke all on function public.archive_illustration_review_promote(text,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.archive_illustration_review_staging_cleanup(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.archive_illustration_review_staging_begin(jsonb) to service_role;
grant execute on function public.archive_illustration_review_staging_chunk_put(text,uuid,text,integer,text) to service_role;
grant execute on function public.archive_illustration_review_staging_finalize(text,uuid,text) to service_role;
grant execute on function public.archive_illustration_review_complete(jsonb) to service_role;
grant execute on function public.archive_illustration_review_promote(text,text,text,text,text,uuid) to service_role;
grant execute on function public.archive_illustration_review_staging_cleanup(text,uuid,text,text) to service_role;

-- Preserve the human review SLA and never sweep it on an inherited worker lease.
create or replace function public.archive_illustration_render_jobs_sweep_stale()
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_count integer:=0; v_finalizer_dispatch integer:=0; v_request bigint;
  v_stage text; v_code text;
begin
  for v_job in
    select * from survival_ops.illustration_render_jobs
    where status in ('PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING')
      and lease_until is not null and lease_until<=clock_timestamp()
    order by lease_until for update skip locked
  loop
    if v_job.status='HUMAN_REVIEW' then
      update survival_ops.illustration_render_jobs set status='BLOCKED',lease_owner=null,lease_token=null,lease_until=null,
        last_error_code='HUMAN_REVIEW_SLA_EXPIRED',last_error_stage='HUMAN_REVIEW',
        blocker_code='HUMAN_REVIEW_SLA_EXPIRED',blocker_stage='HUMAN_REVIEW',updated_at=clock_timestamp()
      where job_id=v_job.job_id;
    elsif v_job.status in ('FINALIZE_QUEUED','FINALIZING','REVIEW_PASS_STAGED') and v_job.finalizer_failure_count<5 then
      v_request:=public.archive_illustration_finalizer_dispatch_guarded(v_job.job_id);
      update survival_ops.illustration_render_jobs set status='FINALIZE_QUEUED',
        finalizer_failure_count=finalizer_failure_count+case when v_job.status='FINALIZING' then 1 else 0 end,
        lease_owner=null,lease_token=null,lease_until=null,
        last_error_code=case when v_job.status='FINALIZING' then 'FINALIZER_LEASE_EXPIRED' else last_error_code end,
        last_error_stage=case when v_job.status='FINALIZING' then 'FINALIZER' else last_error_stage end,
        finalizer_dispatch_request_id=v_request,finalizer_dispatch_at=clock_timestamp(),
        blocker_code=null,blocker_stage=null,updated_at=clock_timestamp()
      where job_id=v_job.job_id;
      v_finalizer_dispatch:=v_finalizer_dispatch+1;
    else
      v_stage:=case v_job.status when 'PREPARED' then 'PROVIDER' when 'INGESTING' then 'INGEST'
        when 'READY_FOR_REVIEW' then 'REVIEW' else 'FINALIZER' end;
      v_code:='JOB_LEASE_EXPIRED';
      update survival_ops.illustration_render_jobs set status='BLOCKED',
        provider_failure_count=provider_failure_count+case when v_stage='PROVIDER' and provider_failure_count<3 then 1 else 0 end,
        ingest_failure_count=ingest_failure_count+case when v_stage='INGEST' and ingest_failure_count<3 then 1 else 0 end,
        review_failure_count=review_failure_count+case when v_stage='REVIEW' and review_failure_count<3 then 1 else 0 end,
        finalizer_failure_count=finalizer_failure_count+case when v_stage='FINALIZER' and finalizer_failure_count<5 then 1 else 0 end,
        lease_owner=null,lease_token=null,lease_until=null,last_error_code=v_code,last_error_stage=v_stage,
        blocker_code=v_code,blocker_stage=v_stage,updated_at=clock_timestamp() where job_id=v_job.job_id;
    end if;
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('expired_jobs',v_count,'finalizer_dispatched',v_finalizer_dispatch);
end $$;

-- A narrow SECURITY DEFINER boundary for stale Finalizer redispatch only.
create or replace function public.archive_illustration_finalizer_dispatch_guarded(p_job_id text)
returns bigint language plpgsql volatile security definer
set search_path=pg_catalog,survival_ops,archive_ops as $$
declare v_job survival_ops.illustration_render_jobs%rowtype; v_request bigint;
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
    raise exception 'ILLUSTRATION_FINALIZER_DISPATCH_FORBIDDEN' using errcode='42501';
  end if;
  select * into v_job from survival_ops.illustration_render_jobs where job_id=p_job_id for update;
  if not found or v_job.status not in ('FINALIZE_QUEUED','FINALIZING','REVIEW_PASS_STAGED')
     or v_job.lease_token is null or v_job.lease_until>clock_timestamp()
     or v_job.finalizer_failure_count>=5 then
    raise exception 'ILLUSTRATION_FINALIZER_DISPATCH_NOT_ELIGIBLE' using errcode='22023';
  end if;
  v_request:=archive_ops.dispatch_afterfall_illustration_finalize(p_job_id);
  return v_request;
end $$;

revoke all on function public.archive_illustration_finalizer_dispatch_guarded(text) from public,anon,authenticated;
grant execute on function public.archive_illustration_finalizer_dispatch_guarded(text) to service_role;

-- Validate all enqueue fields before taking locks or running stale recovery.
create or replace function public.archive_illustration_kst_date(p_at timestamptz default clock_timestamp())
returns date language sql stable set search_path='' as $$
  select (p_at at time zone 'Asia/Seoul')::date
$$;
revoke all on function public.archive_illustration_kst_date(timestamptz) from public,anon,authenticated;

alter function public.archive_illustration_render_job_enqueue(jsonb)
  rename to archive_illustration_render_job_enqueue_validated_internal;
revoke all on function public.archive_illustration_render_job_enqueue_validated_internal(jsonb) from public,anon,authenticated,service_role;

create function public.archive_illustration_render_job_enqueue(p_job jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,survival_ops,archive_ops as $$
declare v_today date:=public.archive_illustration_kst_date(clock_timestamp());
begin
  if coalesce(jsonb_typeof(p_job),'')<>'object' or p_job->>'job_id' is null
     or p_job->>'main_sha' !~ '^[a-f0-9]{40}$'
     or p_job->>'point_id' !~ '^point-[a-f0-9]{64}$'
     or p_job->>'generation_key' !~ '^generation-[a-f0-9]{64}$'
     or p_job->>'subject_id' !~ '^(char|loc|event)-[a-z0-9]+(-[a-z0-9]+)*$'
     or p_job->>'title' is null
     or p_job->>'active_provider' not in ('native_chatgpt','api_openai','manual_import')
     or p_job->>'prompt_contract'<>'illustration-image-prompt-v1'
     or p_job->>'prompt_text' is null or length(p_job->>'prompt_text')<20
     or length(p_job->>'prompt_text')>12000
     or p_job->>'prompt_sha256' !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_ILLUSTRATION_RENDER_JOB' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('illustration-render-enqueue'));
  perform public.archive_illustration_render_jobs_sweep_stale();
  -- Original bounded queue policy follows after validation/recovery.
  return public.archive_illustration_render_job_enqueue_validated_internal(p_job);
end $$;

revoke all on function public.archive_illustration_render_job_enqueue(jsonb) from public,anon,authenticated;
grant execute on function public.archive_illustration_render_job_enqueue(jsonb) to service_role;

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
    status=case when status in ('REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING') then 'FINALIZING' else status end,
    lease_owner=p_owner,lease_token=v_token,lease_until=v_until,last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
  where job_id=p_job_id;
  return jsonb_build_object('status','LEASE_ACQUIRED','job_id',p_job_id,'lease_token',v_token,'lease_until',v_until);
end $$;

create or replace function public.archive_illustration_render_job_lease_heartbeat(
  p_job_id text,p_lease_token uuid,p_lease_seconds integer default 7200
)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_until timestamptz;
begin
  if p_lease_seconds is null or p_lease_seconds not between 60 and 7200 then
    raise exception 'ILLUSTRATION_LEASE_ARGUMENT_INVALID' using errcode='22023';
  end if;
  v_until:=clock_timestamp()+make_interval(secs=>p_lease_seconds);
  update survival_ops.illustration_render_jobs set lease_until=v_until,last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
  where job_id=p_job_id and lease_token=p_lease_token and lease_until>clock_timestamp()
    and status in ('PREPARED','INGESTING','READY_FOR_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING');
  if not found then raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023'; end if;
  return jsonb_build_object('status','LEASE_RENEWED','job_id',p_job_id,'lease_until',v_until);
end $$;

notify pgrst, 'reload schema';
