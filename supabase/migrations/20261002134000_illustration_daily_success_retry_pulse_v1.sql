-- Automation B: target one successful illustration per KST day while allowing
-- bounded same-day retries after quality rejection or recoverable failures.
-- ChatGPT stays responsible only for render/review; pg_cron drives Prep pulses.

create or replace function public.archive_illustration_render_job_enqueue_validated_internal(p_job jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=''
as $$
declare
  v_today date:=(clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_attempt smallint;
  v_active survival_ops.illustration_render_jobs%rowtype;
  v_row survival_ops.illustration_render_jobs%rowtype;
  v_status text;
  v_request bigint;
  v_daily_attempts integer;
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
     or p_job->>'prompt_text' is null
     or length(p_job->>'prompt_text')<20
     or length(p_job->>'prompt_text')>12000
     or p_job->>'prompt_sha256' !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_ILLUSTRATION_RENDER_JOB' using errcode='22023';
  end if;

  -- Daily operating target: once one asset is fully SUCCEEDED, all later Prep
  -- pulses become no-op prompt publications for the rest of the KST day.
  if exists(
    select 1 from survival_ops.illustration_render_jobs
    where date_kst=v_today and status='SUCCEEDED'
  ) then
    return jsonb_build_object('status','DAILY_SUCCESS_TARGET_REACHED','date_kst',v_today);
  end if;

  if exists(
    select 1 from survival_ops.illustration_render_jobs
    where point_id=p_job->>'point_id'
      and generation_key=p_job->>'generation_key'
      and status='SUCCEEDED'
  ) then
    return jsonb_build_object('status','ILLUSTRATION_ALREADY_SUCCEEDED');
  end if;

  select (count(*) filter(where review_decision='REJECT'))::smallint+1
    into v_attempt
  from survival_ops.illustration_render_jobs
  where point_id=p_job->>'point_id'
    and generation_key=p_job->>'generation_key';

  if v_attempt>3 then
    return jsonb_build_object('status','ILLUSTRATION_RETRY_CAP_REACHED');
  end if;

  select * into v_active
  from survival_ops.illustration_render_jobs
  where status in (
    'PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW',
    'REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING'
  )
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'status','WAITING_EXISTING_JOB',
      'job_id',v_active.job_id,
      'subject_id',v_active.subject_id,
      'job_status',v_active.status
    );
  end if;

  -- Recover infrastructure failures in-place so they do not consume a new
  -- semantic attempt or a new daily render slot.
  select * into v_row
  from survival_ops.illustration_render_jobs
  where point_id=p_job->>'point_id'
    and generation_key=p_job->>'generation_key'
    and attempt_no=v_attempt
    and status='BLOCKED'
  order by created_at desc
  limit 1
  for update;

  if found then
    if v_row.last_error_stage='HUMAN_REVIEW' then
      return jsonb_build_object('status','HUMAN_REVIEW_REQUIRED','job_id',v_row.job_id);
    end if;

    if v_row.provider_failure_count>=3
       or v_row.ingest_failure_count>=3
       or v_row.review_failure_count>=3
       or v_row.finalizer_failure_count>=5 then
      return jsonb_build_object(
        'status','ILLUSTRATION_INFRA_RETRY_CAP_REACHED',
        'job_id',v_row.job_id
      );
    end if;

    if v_row.prompt_sha256<>p_job->>'prompt_sha256'
       or v_row.active_provider<>p_job->>'active_provider' then
      raise exception 'ILLUSTRATION_RETRY_BINDING_CHANGED' using errcode='22023';
    end if;

    v_status:=case
      when v_row.review_decision='PASS' then 'FINALIZE_QUEUED'
      when v_row.last_error_stage in ('FINALIZER','PROGRAM_FINALIZER') then 'FINALIZE_QUEUED'
      when v_row.last_error_stage='INGEST' then 'INGESTING'
      when v_row.last_error_stage='REVIEW' then 'READY_FOR_REVIEW'
      when v_row.output_sha256 is null then 'PREPARED'
      when v_row.review_staging_id is null then 'INGESTING'
      else 'READY_FOR_REVIEW'
    end;

    update survival_ops.illustration_render_jobs
    set status=v_status,
        date_kst=v_today,
        lease_owner='archive-illustration-prep',
        lease_token=null,
        lease_until=clock_timestamp()+interval '12 hours',
        last_heartbeat_at=clock_timestamp(),
        last_error_code=null,
        last_error_stage=null,
        blocker_code=null,
        blocker_stage=null,
        finalized_at=null,
        updated_at=clock_timestamp()
    where job_id=v_row.job_id;

    if v_status='FINALIZE_QUEUED' then
      v_request:=archive_ops.dispatch_afterfall_illustration_finalize(v_row.job_id);
      update survival_ops.illustration_render_jobs
      set finalizer_dispatch_request_id=v_request,
          finalizer_dispatch_at=clock_timestamp()
      where job_id=v_row.job_id;
    end if;

    return jsonb_build_object(
      'status',v_status,
      'job_id',v_row.job_id,
      'subject_id',v_row.subject_id,
      'attempt_no',v_row.attempt_no,
      'date_kst',v_today,
      'prompt_sha256',v_row.prompt_sha256
    );
  end if;

  -- Eight scheduled render opportunities exist per day:
  -- 06:30, 09:30, 11:30, 13:30, 15:30, 17:30, 19:30, 21:30 KST.
  select count(*) into v_daily_attempts
  from survival_ops.illustration_render_jobs
  where date_kst=v_today;

  if v_daily_attempts>=8 then
    return jsonb_build_object(
      'status','DAILY_ATTEMPT_CAP_REACHED',
      'date_kst',v_today,
      'attempt_count',v_daily_attempts
    );
  end if;

  insert into survival_ops.illustration_render_jobs(
    job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,
    prompt_contract,prompt_text,prompt_sha256,attempt_no,status,lease_owner,lease_until,last_heartbeat_at
  ) values (
    p_job->>'job_id',v_today,p_job->>'main_sha',p_job->>'point_id',p_job->>'generation_key',
    p_job->>'subject_id',p_job->>'title',p_job->>'active_provider',p_job->>'prompt_contract',
    p_job->>'prompt_text',p_job->>'prompt_sha256',v_attempt,'PREPARED','archive-illustration-prep',
    clock_timestamp()+interval '12 hours',clock_timestamp()
  )
  returning * into v_row;

  return jsonb_build_object(
    'status','PREPARED',
    'job_id',v_row.job_id,
    'subject_id',v_row.subject_id,
    'attempt_no',v_row.attempt_no,
    'date_kst',v_row.date_kst,
    'prompt_sha256',v_row.prompt_sha256
  );
end
$$;

-- Keep the original 05:30 KST Prep job. Add retry Prep pulses at
-- 09:10, 11:10, 13:10, 15:10, 17:10, 19:10 and 21:10 KST.
-- pg_cron schedules are UTC, so these correspond to 00:10..12:10 UTC.
select cron.schedule(
  'afterfall-illustration-retry-prep-dispatch',
  '10 0,2,4,6,8,10,12 * * *',
  'select archive_ops.dispatch_afterfall_illustration_prep();'
);
