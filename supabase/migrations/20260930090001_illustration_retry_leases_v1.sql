-- Automation B retry separation and bounded job leases.
alter table survival_ops.illustration_render_jobs
  add column if not exists provider_failure_count smallint not null default 0,
  add column if not exists ingest_failure_count smallint not null default 0,
  add column if not exists review_failure_count smallint not null default 0,
  add column if not exists finalizer_failure_count smallint not null default 0,
  add column if not exists lease_owner text,
  add column if not exists lease_token uuid,
  add column if not exists lease_until timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_stage text,
  add column if not exists finalizer_dispatch_at timestamptz;

alter table survival_ops.illustration_render_jobs
  drop constraint if exists illustration_render_jobs_status_check,
  drop constraint if exists illustration_render_jobs_provider_failures_check,
  drop constraint if exists illustration_render_jobs_ingest_failures_check,
  drop constraint if exists illustration_render_jobs_review_failures_check,
  drop constraint if exists illustration_render_jobs_finalizer_failures_check;

alter table survival_ops.illustration_render_jobs
  add constraint illustration_render_jobs_status_check
    check (status in ('PREPARED','INGESTING','READY_FOR_REVIEW','REVIEW_REJECTED','HUMAN_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING','SUCCEEDED','BLOCKED')),
  add constraint illustration_render_jobs_provider_failures_check check (provider_failure_count between 0 and 3),
  add constraint illustration_render_jobs_ingest_failures_check check (ingest_failure_count between 0 and 3),
  add constraint illustration_render_jobs_review_failures_check check (review_failure_count between 0 and 3),
  add constraint illustration_render_jobs_finalizer_failures_check check (finalizer_failure_count between 0 and 5);

update survival_ops.illustration_render_jobs
set lease_until = case
  when status in ('FINALIZE_QUEUED','FINALIZING','REVIEW_PASS_STAGED') then coalesce(updated_at,created_at)+interval '2 hours'
  when status in ('PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW') then coalesce(updated_at,created_at)+interval '7 days'
  else null end
where lease_until is null;

drop index if exists survival_ops.illustration_render_jobs_one_active_idx;
create unique index illustration_render_jobs_one_active_idx
  on survival_ops.illustration_render_jobs((worldline_id))
  where status in ('PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING');

create or replace function public.archive_illustration_render_job_lease_acquire(
  p_job_id text, p_owner text, p_lease_seconds integer default 7200
)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_token uuid;
  v_until timestamptz;
begin
  if coalesce(p_owner,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,99}$'
     or p_lease_seconds is null or p_lease_seconds not between 60 and 7200 then
    raise exception 'ILLUSTRATION_LEASE_ARGUMENT_INVALID' using errcode='22023';
  end if;
  select * into v_job from survival_ops.illustration_render_jobs where job_id=p_job_id for update;
  if not found then raise exception 'ILLUSTRATION_RENDER_JOB_NOT_FOUND' using errcode='22023'; end if;
  if v_job.status not in ('PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING') then
    raise exception 'ILLUSTRATION_LEASE_STATE_INVALID' using errcode='22023';
  end if;
  if v_job.lease_token is not null and v_job.lease_until>clock_timestamp() then
    return jsonb_build_object('status','LEASE_HELD','job_id',p_job_id,'lease_until',v_job.lease_until);
  end if;
  v_token:=pg_catalog.gen_random_uuid();
  v_until:=clock_timestamp()+make_interval(secs=>p_lease_seconds);
  update survival_ops.illustration_render_jobs
  set status=case when status in ('REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING') then 'FINALIZING' else status end,
      lease_owner=p_owner,lease_token=v_token,lease_until=v_until,
      last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
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
  update survival_ops.illustration_render_jobs
  set lease_until=v_until,last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
  where job_id=p_job_id and lease_token=p_lease_token and lease_until>clock_timestamp()
    and status in ('PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING');
  if not found then raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023'; end if;
  return jsonb_build_object('status','LEASE_RENEWED','job_id',p_job_id,'lease_until',v_until);
end $$;

create or replace function public.archive_illustration_render_job_record_failure(
  p_job_id text,p_lease_token uuid,p_failure_kind text,p_error_code text
)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_next smallint;
  v_limit smallint;
begin
  if coalesce(p_failure_kind,'') not in ('PROVIDER','INGEST','REVIEW','FINALIZER')
     or coalesce(p_error_code,'') !~ '^[A-Z0-9_:-]{1,80}$' then
    raise exception 'ILLUSTRATION_FAILURE_ARGUMENT_INVALID' using errcode='22023';
  end if;
  select * into v_job from survival_ops.illustration_render_jobs
  where job_id=p_job_id and lease_token=p_lease_token and lease_until>clock_timestamp()
  for update;
  if not found then raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023'; end if;
  v_limit:=case when p_failure_kind='FINALIZER' then 5 else 3 end;
  v_next:=least(v_limit,case p_failure_kind
    when 'PROVIDER' then v_job.provider_failure_count+1
    when 'INGEST' then v_job.ingest_failure_count+1
    when 'REVIEW' then v_job.review_failure_count+1
    else v_job.finalizer_failure_count+1 end);
  update survival_ops.illustration_render_jobs set
    provider_failure_count=provider_failure_count+case when p_failure_kind='PROVIDER' and provider_failure_count<3 then 1 else 0 end,
    ingest_failure_count=ingest_failure_count+case when p_failure_kind='INGEST' and ingest_failure_count<3 then 1 else 0 end,
    review_failure_count=review_failure_count+case when p_failure_kind='REVIEW' and review_failure_count<3 then 1 else 0 end,
    finalizer_failure_count=finalizer_failure_count+case when p_failure_kind='FINALIZER' and finalizer_failure_count<5 then 1 else 0 end,
    status='BLOCKED',lease_owner=null,lease_token=null,lease_until=null,
    last_error_code=p_error_code,last_error_stage=p_failure_kind,
    blocker_code=p_error_code,blocker_stage=p_failure_kind,updated_at=clock_timestamp()
  where job_id=p_job_id;
  return jsonb_build_object('status',case when v_next<v_limit then 'RETRY_DEFERRED' else 'RETRY_CAP_REACHED' end,
    'job_id',p_job_id,'failure_kind',p_failure_kind,'failure_count',v_next,'failure_limit',v_limit);
end $$;

create or replace function public.archive_illustration_render_jobs_sweep_stale()
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_count integer:=0;
  v_finalizer_dispatch integer:=0;
  v_request bigint;
  v_stage text;
  v_code text;
begin
  for v_job in
    select * from survival_ops.illustration_render_jobs
    where status in ('PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING')
      and lease_until is not null and lease_until<=clock_timestamp()
    order by lease_until for update skip locked
  loop
    if v_job.status in ('FINALIZE_QUEUED','FINALIZING','REVIEW_PASS_STAGED')
       and v_job.finalizer_failure_count<5 then
      update survival_ops.illustration_render_jobs set
        status='FINALIZE_QUEUED',
        finalizer_failure_count=finalizer_failure_count+case when v_job.status='FINALIZING' then 1 else 0 end,
        lease_owner=null,lease_token=null,lease_until=null,
        last_error_code=case when v_job.status='FINALIZING' then 'FINALIZER_LEASE_EXPIRED' else last_error_code end,
        last_error_stage=case when v_job.status='FINALIZING' then 'FINALIZER' else last_error_stage end,
        blocker_code=null,blocker_stage=null,updated_at=clock_timestamp()
      where job_id=v_job.job_id;
      begin
        v_request:=archive_ops.dispatch_afterfall_illustration_finalize(v_job.job_id);
        update survival_ops.illustration_render_jobs
        set finalizer_dispatch_request_id=v_request,finalizer_dispatch_at=clock_timestamp()
        where job_id=v_job.job_id;
        v_finalizer_dispatch:=v_finalizer_dispatch+1;
      exception when others then
        update survival_ops.illustration_render_jobs set
          status='BLOCKED',finalizer_failure_count=least(finalizer_failure_count+1,5),
          lease_owner=null,lease_token=null,lease_until=null,
          last_error_code='FINALIZER_DISPATCH_FAILED',last_error_stage='FINALIZER',
          blocker_code='FINALIZER_DISPATCH_FAILED',blocker_stage='FINALIZER',updated_at=clock_timestamp()
        where job_id=v_job.job_id;
      end;
    else
      v_stage:=case v_job.status
        when 'PREPARED' then 'PROVIDER'
        when 'INGESTING' then 'INGEST'
        when 'READY_FOR_REVIEW' then 'REVIEW'
        when 'HUMAN_REVIEW' then 'HUMAN_REVIEW'
        else 'FINALIZER' end;
      v_code:=case when v_stage='HUMAN_REVIEW' then 'HUMAN_REVIEW_SLA_EXPIRED' else 'JOB_LEASE_EXPIRED' end;
      update survival_ops.illustration_render_jobs set
        status='BLOCKED',
        provider_failure_count=provider_failure_count+case when v_stage='PROVIDER' and provider_failure_count<3 then 1 else 0 end,
        ingest_failure_count=ingest_failure_count+case when v_stage='INGEST' and ingest_failure_count<3 then 1 else 0 end,
        review_failure_count=review_failure_count+case when v_stage='REVIEW' and review_failure_count<3 then 1 else 0 end,
        finalizer_failure_count=finalizer_failure_count+case when v_stage='FINALIZER' and finalizer_failure_count<5 then 1 else 0 end,
        lease_owner=null,lease_token=null,lease_until=null,
        last_error_code=v_code,last_error_stage=v_stage,
        blocker_code=v_code,blocker_stage=v_stage,updated_at=clock_timestamp()
      where job_id=v_job.job_id;
    end if;
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('expired_jobs',v_count,'finalizer_dispatched',v_finalizer_dispatch);
end $$;

create or replace function public.archive_illustration_render_job_finish(
  p_job_id text,p_status text,p_summary jsonb default '{}'::jsonb
)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_row survival_ops.illustration_render_jobs%rowtype;
begin
  if p_status not in ('FINALIZING','SUCCEEDED','BLOCKED') then
    raise exception 'ILLUSTRATION_FINISH_STATUS_INVALID' using errcode='22023';
  end if;
  update survival_ops.illustration_render_jobs set
    status=p_status,
    finalized_at=case when p_status in ('SUCCEEDED','BLOCKED') then clock_timestamp() else finalized_at end,
    updated_at=clock_timestamp(),
    blocker_code=case when p_status='BLOCKED' then nullif(p_summary->>'blocker_code','') else null end,
    blocker_stage=case when p_status='BLOCKED' then nullif(p_summary->>'blocker_stage','') else null end,
    last_error_code=case when p_status='BLOCKED' then nullif(p_summary->>'blocker_code','') else null end,
    last_error_stage=case when p_status='BLOCKED' then nullif(p_summary->>'blocker_stage','') else null end,
    finalizer_failure_count=finalizer_failure_count+case when p_status='BLOCKED' and finalizer_failure_count<5 then 1 else 0 end,
    lease_owner=case when p_status in ('SUCCEEDED','BLOCKED') then null else lease_owner end,
    lease_token=case when p_status in ('SUCCEEDED','BLOCKED') then null else lease_token end,
    lease_until=case when p_status in ('SUCCEEDED','BLOCKED') then null else clock_timestamp()+interval '2 hours' end,
    last_heartbeat_at=case when p_status='FINALIZING' then clock_timestamp() else last_heartbeat_at end
  where job_id=p_job_id and lease_token=(p_summary->>'lease_token')::uuid and lease_until>clock_timestamp()
  returning * into v_row;
  if not found then raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023'; end if;
  return to_jsonb(v_row)-'prompt_text'-'lease_token';
end $$;

create or replace function public.archive_illustration_render_job_enqueue(p_job jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  v_today date:=(clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_attempt smallint;
  v_active survival_ops.illustration_render_jobs%rowtype;
  v_row survival_ops.illustration_render_jobs%rowtype;
  v_status text;
  v_request bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('illustration-render-enqueue'));
  perform public.archive_illustration_render_jobs_sweep_stale();
  if p_job->>'job_id' is null
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
  if exists(select 1 from survival_ops.illustration_render_jobs
    where point_id=p_job->>'point_id' and generation_key=p_job->>'generation_key' and status='SUCCEEDED') then
    return jsonb_build_object('status','ILLUSTRATION_ALREADY_SUCCEEDED');
  end if;
  select (count(*) filter(where review_decision='REJECT'))::smallint+1 into v_attempt
  from survival_ops.illustration_render_jobs
  where point_id=p_job->>'point_id' and generation_key=p_job->>'generation_key';
  if v_attempt>3 then return jsonb_build_object('status','ILLUSTRATION_RETRY_CAP_REACHED'); end if;
  select * into v_active from survival_ops.illustration_render_jobs
  where status in ('PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING')
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('status','WAITING_EXISTING_JOB','job_id',v_active.job_id,'subject_id',v_active.subject_id,'job_status',v_active.status);
  end if;
  select * into v_row from survival_ops.illustration_render_jobs
  where point_id=p_job->>'point_id' and generation_key=p_job->>'generation_key'
    and attempt_no=v_attempt and status='BLOCKED'
  order by created_at desc limit 1 for update;
  if found then
    if v_row.last_error_stage='HUMAN_REVIEW' then return jsonb_build_object('status','HUMAN_REVIEW_REQUIRED','job_id',v_row.job_id); end if;
    if v_row.provider_failure_count>=3 or v_row.ingest_failure_count>=3
       or v_row.review_failure_count>=3 or v_row.finalizer_failure_count>=5 then
      return jsonb_build_object('status','ILLUSTRATION_INFRA_RETRY_CAP_REACHED','job_id',v_row.job_id);
    end if;
    if v_row.prompt_sha256<>p_job->>'prompt_sha256' or v_row.active_provider<>p_job->>'active_provider' then
      raise exception 'ILLUSTRATION_RETRY_BINDING_CHANGED' using errcode='22023';
    end if;
    if exists(select 1 from survival_ops.illustration_render_jobs
      where date_kst=v_today and job_id<>v_row.job_id) then
      return jsonb_build_object('status','DAILY_JOB_CAP_REACHED','date_kst',v_today);
    end if;
    v_status:=case
      when v_row.review_decision='PASS' then 'FINALIZE_QUEUED'
      when v_row.last_error_stage in ('FINALIZER','PROGRAM_FINALIZER') then 'FINALIZE_QUEUED'
      when v_row.last_error_stage='INGEST' then 'INGESTING'
      when v_row.last_error_stage='REVIEW' then 'READY_FOR_REVIEW'
      when v_row.output_sha256 is null then 'PREPARED'
      when v_row.review_staging_id is null then 'INGESTING'
      else 'READY_FOR_REVIEW' end;
    update survival_ops.illustration_render_jobs set
      status=v_status,date_kst=v_today,lease_owner='archive-illustration-prep',
      lease_token=null,lease_until=clock_timestamp()+interval '12 hours',
      last_heartbeat_at=clock_timestamp(),last_error_code=null,last_error_stage=null,
      blocker_code=null,blocker_stage=null,finalized_at=null,updated_at=clock_timestamp()
    where job_id=v_row.job_id;
    if v_status='FINALIZE_QUEUED' then
      v_request:=archive_ops.dispatch_afterfall_illustration_finalize(v_row.job_id);
      update survival_ops.illustration_render_jobs
      set finalizer_dispatch_request_id=v_request,finalizer_dispatch_at=clock_timestamp()
      where job_id=v_row.job_id;
    end if;
    return jsonb_build_object('status',v_status,'job_id',v_row.job_id,'subject_id',v_row.subject_id,
      'attempt_no',v_row.attempt_no,'date_kst',v_today,'prompt_sha256',v_row.prompt_sha256);
  end if;
  if exists(select 1 from survival_ops.illustration_render_jobs where date_kst=v_today) then
    return jsonb_build_object('status','DAILY_JOB_CAP_REACHED','date_kst',v_today);
  end if;
  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,
    prompt_contract,prompt_text,prompt_sha256,attempt_no,status,lease_owner,lease_until,last_heartbeat_at
  ) values (
    p_job->>'job_id',v_today,p_job->>'main_sha',p_job->>'point_id',p_job->>'generation_key',
    p_job->>'subject_id',p_job->>'title',p_job->>'active_provider',p_job->>'prompt_contract',
    p_job->>'prompt_text',p_job->>'prompt_sha256',v_attempt,'PREPARED','archive-illustration-prep',
    clock_timestamp()+interval '12 hours',clock_timestamp()
  ) returning * into v_row;
  return jsonb_build_object('status','PREPARED','job_id',v_row.job_id,'subject_id',v_row.subject_id,
    'attempt_no',v_row.attempt_no,'date_kst',v_row.date_kst,'prompt_sha256',v_row.prompt_sha256);
end $$;

create or replace function public.archive_illustration_render_job_readback(p_job_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select to_jsonb(j)-'prompt_text'-'lease_token'
  from survival_ops.illustration_render_jobs j where j.job_id=p_job_id;
$$;

create or replace function public.archive_illustration_render_job_current()
returns jsonb language sql stable security invoker set search_path='' as $$
  select to_jsonb(j)-'prompt_text'-'lease_token'
  from survival_ops.illustration_render_jobs j
  where j.status in ('PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING')
  order by j.created_at desc limit 1;
$$;

revoke all on function public.archive_illustration_render_job_current() from public;
revoke execute on function public.archive_illustration_render_job_current() from anon,authenticated;
grant execute on function public.archive_illustration_render_job_current() to service_role;

create or replace function archive_ops.dispatch_afterfall_illustration_prep()
returns bigint language plpgsql security definer set search_path=pg_catalog,vault,net,archive_ops,public as $$
declare github_token text; request_id bigint;
begin
  perform public.archive_illustration_render_jobs_sweep_stale();
  select decrypted_secret into github_token from vault.decrypted_secrets where name='archive_github_dispatch_token' order by created_at desc limit 1;
  if github_token is null or length(btrim(github_token))<20 then raise exception 'ARCHIVE_GITHUB_DISPATCH_TOKEN_MISSING'; end if;
  select net.http_post(
    url:='https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/archive-illustration-prep.yml/dispatches',
    body:=jsonb_build_object('ref','main'),
    headers:=jsonb_build_object('Accept','application/vnd.github+json','Authorization','Bearer '||github_token,
      'X-GitHub-Api-Version','2022-11-28','Content-Type','application/json','User-Agent','supabase-afterfall-illustration-prep'),
    timeout_milliseconds:=10000
  ) into request_id;
  return request_id;
end $$;

revoke all on function public.archive_illustration_render_job_lease_acquire(text,text,integer) from public;
revoke execute on function public.archive_illustration_render_job_lease_acquire(text,text,integer) from anon,authenticated;
grant execute on function public.archive_illustration_render_job_lease_acquire(text,text,integer) to service_role;
revoke all on function public.archive_illustration_render_job_lease_heartbeat(text,uuid,integer) from public;
revoke execute on function public.archive_illustration_render_job_lease_heartbeat(text,uuid,integer) from anon,authenticated;
grant execute on function public.archive_illustration_render_job_lease_heartbeat(text,uuid,integer) to service_role;
revoke all on function public.archive_illustration_render_job_record_failure(text,uuid,text,text) from public;
revoke execute on function public.archive_illustration_render_job_record_failure(text,uuid,text,text) from anon,authenticated;
grant execute on function public.archive_illustration_render_job_record_failure(text,uuid,text,text) to service_role;
revoke all on function public.archive_illustration_render_jobs_sweep_stale() from public;
revoke execute on function public.archive_illustration_render_jobs_sweep_stale() from anon,authenticated;
grant execute on function public.archive_illustration_render_jobs_sweep_stale() to service_role;
revoke all on function public.archive_illustration_render_job_finish(text,text,jsonb) from public;
revoke execute on function public.archive_illustration_render_job_finish(text,text,jsonb) from anon,authenticated;
grant execute on function public.archive_illustration_render_job_finish(text,text,jsonb) to service_role;
revoke all on function public.archive_illustration_render_job_enqueue(jsonb) from public;
revoke execute on function public.archive_illustration_render_job_enqueue(jsonb) from anon,authenticated;
grant execute on function public.archive_illustration_render_job_enqueue(jsonb) to service_role;
notify pgrst, 'reload schema';