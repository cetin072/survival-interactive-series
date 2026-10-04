-- Automation B: make Reviewer binary-ingest failures diagnosable and resumable.
-- Keeps the existing staging/Vault/finalizer architecture. No new worker or schedule.

alter table survival_ops.illustration_render_jobs
  add column if not exists ingest_uploaded_chunk_count smallint not null default 0,
  add column if not exists ingest_expected_chunk_count smallint,
  add column if not exists last_ingest_error_code text,
  add column if not exists last_ingest_error_at timestamptz;

alter table survival_ops.illustration_render_jobs
  drop constraint if exists illustration_render_jobs_ingest_uploaded_chunks_check,
  drop constraint if exists illustration_render_jobs_ingest_expected_chunks_check,
  drop constraint if exists illustration_render_jobs_ingest_progress_check,
  add constraint illustration_render_jobs_ingest_uploaded_chunks_check
    check (ingest_uploaded_chunk_count between 0 and 128),
  add constraint illustration_render_jobs_ingest_expected_chunks_check
    check (ingest_expected_chunk_count is null or ingest_expected_chunk_count between 1 and 128),
  add constraint illustration_render_jobs_ingest_progress_check
    check (
      ingest_expected_chunk_count is null
      or ingest_uploaded_chunk_count <= ingest_expected_chunk_count
    );

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
  v_stored integer:=0;
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

  perform public.archive_illustration_assert_source_fresh(
    v_job_id,
    p_meta->>'source_sha256'
  );

  update survival_ops.illustration_render_jobs
  set status='PREPARED',updated_at=clock_timestamp()
  where job_id=v_job_id
    and lease_token=v_token
    and status='INGESTING';

  v_result:=public.archive_illustration_review_staging_begin_unleased_internal(
    p_meta-'lease_token'
  );

  select count(*)::integer into v_stored
  from survival_ops.illustration_review_staging_chunks
  where staging_id=v_result->>'staging_id';

  update survival_ops.illustration_render_jobs
  set status='INGESTING',
      ingest_expected_chunk_count=(p_meta->>'chunk_count')::smallint,
      ingest_uploaded_chunk_count=least(v_stored,128)::smallint,
      updated_at=clock_timestamp()
  where job_id=v_job_id
    and lease_token=v_token
    and status='PREPARED';

  perform public.archive_illustration_render_job_lease_heartbeat(
    v_job_id,
    v_token,
    600
  );

  return v_result || jsonb_build_object(
    'stored_chunk_count',v_stored,
    'expected_chunk_count',(p_meta->>'chunk_count')::integer
  );
end
$$;

create or replace function public.archive_illustration_review_staging_chunk_put(
  p_job_id text,
  p_lease_token uuid,
  p_staging_id text,
  p_chunk_index integer,
  p_chunk_b64 text
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
  v_expected integer;
  v_stored integer;
begin
  perform public.archive_illustration_assert_job_lease(
    p_job_id,
    p_lease_token,
    array['PREPARED','INGESTING','READY_FOR_REVIEW']
  );

  select job_id,chunk_count
    into v_staging_job,v_expected
  from survival_ops.illustration_review_staging
  where staging_id=p_staging_id;

  if v_staging_job is distinct from p_job_id then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;

  v_result:=public.archive_illustration_review_staging_chunk_put_unleased_internal(
    p_staging_id,
    p_chunk_index,
    p_chunk_b64
  );

  update survival_ops.illustration_review_staging
  set updated_at=clock_timestamp()
  where staging_id=p_staging_id;

  select count(*)::integer into v_stored
  from survival_ops.illustration_review_staging_chunks
  where staging_id=p_staging_id;

  update survival_ops.illustration_render_jobs
  set ingest_expected_chunk_count=v_expected::smallint,
      ingest_uploaded_chunk_count=least(v_stored,128)::smallint,
      updated_at=clock_timestamp()
  where job_id=p_job_id
    and lease_token=p_lease_token;

  if not found then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;

  perform public.archive_illustration_render_job_lease_heartbeat(
    p_job_id,
    p_lease_token,
    600
  );

  return v_result || jsonb_build_object(
    'stored_chunk_count',v_stored,
    'expected_chunk_count',v_expected
  );
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
set search_path='pg_catalog','public','survival_ops','archive_ops'
as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_staging survival_ops.illustration_review_staging%rowtype;
  v_result jsonb;
  v_object_path text;
  v_vault_dispatch bigint;
begin
  perform public.archive_illustration_assert_job_lease(
    p_job_id,
    p_lease_token,
    array['PREPARED','INGESTING','READY_FOR_REVIEW']
  );

  select * into v_job
  from survival_ops.illustration_render_jobs
  where job_id=p_job_id
  for update;

  select * into v_staging
  from survival_ops.illustration_review_staging
  where staging_id=p_staging_id;

  if not found or v_staging.job_id is distinct from p_job_id then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;

  perform public.archive_illustration_assert_source_fresh(
    p_job_id,
    v_staging.source_sha256
  );

  v_result:=public.archive_illustration_review_staging_finalize_unleased_internal(
    p_staging_id
  );

  if v_result->>'status'<>'READY' then
    raise exception 'ILLUSTRATION_REVIEW_STAGING_FINALIZE_FAILED' using errcode='22023';
  end if;

  update survival_ops.illustration_render_jobs
  set status='READY_FOR_REVIEW',
      output_sha256=v_staging.source_sha256,
      output_bytes=v_staging.byte_count,
      output_width=v_staging.width,
      output_height=v_staging.height,
      review_staging_id=v_staging.staging_id,
      provider_asset_id=v_staging.provider_asset_id,
      ingest_expected_chunk_count=v_staging.chunk_count::smallint,
      ingest_uploaded_chunk_count=v_staging.chunk_count::smallint,
      updated_at=clock_timestamp()
  where job_id=p_job_id
    and lease_token=p_lease_token
    and status in ('PREPARED','INGESTING','READY_FOR_REVIEW');

  if not found then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;

  v_object_path:='AFTERFALL/'||v_job.date_kst::text||'/'||v_job.job_id||'/'||v_staging.source_sha256||'.png';

  insert into survival_ops.illustration_vault_items(
    job_id,review_staging_id,source_sha256,object_path,status
  ) values (
    v_job.job_id,v_staging.staging_id,v_staging.source_sha256,v_object_path,'QUEUED'
  )
  on conflict (job_id) do update set
    review_staging_id=excluded.review_staging_id,
    source_sha256=excluded.source_sha256,
    object_path=excluded.object_path,
    updated_at=clock_timestamp()
  where survival_ops.illustration_vault_items.status not in ('STORED','DELETED');

  begin
    v_vault_dispatch:=archive_ops.dispatch_afterfall_illustration_vault(v_job.job_id);
  exception when others then
    update survival_ops.illustration_vault_items
    set last_error_code=left(sqlerrm,200),updated_at=clock_timestamp()
    where job_id=v_job.job_id and status not in ('STORED','DELETED');
    v_vault_dispatch:=null;
  end;

  return v_result || jsonb_build_object(
    'stored_chunk_count',v_staging.chunk_count,
    'expected_chunk_count',v_staging.chunk_count,
    'vault_status',(select status from survival_ops.illustration_vault_items where job_id=v_job.job_id),
    'vault_dispatch_request_id',v_vault_dispatch
  );
end
$$;

create or replace function public.archive_illustration_render_job_record_failure(
  p_job_id text,
  p_lease_token uuid,
  p_failure_kind text,
  p_error_code text
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_next smallint;
  v_limit smallint;
  v_cleanup jsonb;
begin
  if coalesce(p_failure_kind,'') not in ('PROVIDER','INGEST','REVIEW','FINALIZER')
     or coalesce(p_error_code,'') !~ '^[A-Z0-9_:-]{1,80}$' then
    raise exception 'ILLUSTRATION_FAILURE_ARGUMENT_INVALID' using errcode='22023';
  end if;

  select * into v_job
  from survival_ops.illustration_render_jobs
  where job_id=p_job_id
    and lease_token=p_lease_token
    and lease_until>clock_timestamp()
  for update;

  if not found then
    raise exception 'ILLUSTRATION_LEASE_LOST' using errcode='22023';
  end if;

  v_limit:=case when p_failure_kind='FINALIZER' then 5 else 3 end;
  v_next:=least(v_limit,case p_failure_kind
    when 'PROVIDER' then v_job.provider_failure_count+1
    when 'INGEST' then v_job.ingest_failure_count+1
    when 'REVIEW' then v_job.review_failure_count+1
    else v_job.finalizer_failure_count+1
  end);

  update survival_ops.illustration_render_jobs set
    provider_failure_count=provider_failure_count+case when p_failure_kind='PROVIDER' and provider_failure_count<3 then 1 else 0 end,
    ingest_failure_count=ingest_failure_count+case when p_failure_kind='INGEST' and ingest_failure_count<3 then 1 else 0 end,
    review_failure_count=review_failure_count+case when p_failure_kind='REVIEW' and review_failure_count<3 then 1 else 0 end,
    finalizer_failure_count=finalizer_failure_count+case when p_failure_kind='FINALIZER' and finalizer_failure_count<5 then 1 else 0 end,
    status='BLOCKED',
    lease_owner=null,
    lease_token=null,
    lease_until=null,
    last_error_code=p_error_code,
    last_error_stage=p_failure_kind,
    blocker_code=p_error_code,
    blocker_stage=p_failure_kind,
    last_ingest_error_code=case when p_failure_kind='INGEST' then p_error_code else last_ingest_error_code end,
    last_ingest_error_at=case when p_failure_kind='INGEST' then clock_timestamp() else last_ingest_error_at end,
    updated_at=clock_timestamp()
  where job_id=p_job_id;

  if v_job.output_sha256 is not null then
    v_cleanup:=public.archive_illustration_vault_cleanup_review_staging(
      p_job_id,
      v_job.output_sha256
    );
  end if;

  return jsonb_build_object(
    'status',case when v_next<v_limit then 'RETRY_DEFERRED' else 'RETRY_CAP_REACHED' end,
    'job_id',p_job_id,
    'failure_kind',p_failure_kind,
    'failure_count',v_next,
    'failure_limit',v_limit,
    'last_ingest_error_code',case when p_failure_kind='INGEST' then p_error_code else v_job.last_ingest_error_code end,
    'review_staging_cleanup',v_cleanup
  );
end
$$;

create or replace function public.archive_illustration_render_jobs_sweep_stale()
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_count integer:=0;
  v_finalizer_dispatch integer:=0;
  v_request bigint;
  v_stage text;
  v_code text;
  v_cleanup jsonb;
  v_staging_status text;
  v_expected integer;
  v_uploaded integer;
begin
  for v_job in
    select * from survival_ops.illustration_render_jobs
    where status in (
      'PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW',
      'REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING'
    )
      and lease_until is not null
      and lease_until<=clock_timestamp()
    order by lease_until
    for update skip locked
  loop
    v_cleanup:=null;

    if v_job.status='HUMAN_REVIEW' then
      update survival_ops.illustration_render_jobs
      set status='BLOCKED',
          lease_owner=null,
          lease_token=null,
          lease_until=null,
          last_error_code='HUMAN_REVIEW_SLA_EXPIRED',
          last_error_stage='HUMAN_REVIEW',
          blocker_code='HUMAN_REVIEW_SLA_EXPIRED',
          blocker_stage='HUMAN_REVIEW',
          updated_at=clock_timestamp()
      where job_id=v_job.job_id;

      if v_job.output_sha256 is not null then
        v_cleanup:=public.archive_illustration_vault_cleanup_review_staging(
          v_job.job_id,
          v_job.output_sha256
        );
      end if;

    elsif v_job.status in ('FINALIZE_QUEUED','FINALIZING','REVIEW_PASS_STAGED')
      and v_job.finalizer_failure_count<5 then
      v_request:=public.archive_illustration_finalizer_dispatch_guarded(v_job.job_id);

      update survival_ops.illustration_render_jobs
      set status='FINALIZE_QUEUED',
          finalizer_failure_count=finalizer_failure_count+case when v_job.status='FINALIZING' then 1 else 0 end,
          lease_owner=null,
          lease_token=null,
          lease_until=null,
          last_error_code=case when v_job.status='FINALIZING' then 'FINALIZER_LEASE_EXPIRED' else last_error_code end,
          last_error_stage=case when v_job.status='FINALIZING' then 'FINALIZER' else last_error_stage end,
          finalizer_dispatch_request_id=v_request,
          finalizer_dispatch_at=clock_timestamp(),
          blocker_code=null,
          blocker_stage=null,
          updated_at=clock_timestamp()
      where job_id=v_job.job_id;

      v_finalizer_dispatch:=v_finalizer_dispatch+1;

    else
      v_stage:=case v_job.status
        when 'PREPARED' then 'PROVIDER'
        when 'INGESTING' then 'INGEST'
        when 'READY_FOR_REVIEW' then 'REVIEW'
        else 'FINALIZER'
      end;
      v_code:='JOB_LEASE_EXPIRED';

      if v_job.status='INGESTING' then
        v_staging_status:=null;
        v_expected:=null;
        v_uploaded:=null;

        select s.status,s.chunk_count,count(c.chunk_index)::integer
          into v_staging_status,v_expected,v_uploaded
        from survival_ops.illustration_review_staging s
        left join survival_ops.illustration_review_staging_chunks c
          on c.staging_id=s.staging_id
        where s.job_id=v_job.job_id
        group by s.status,s.chunk_count;

        if not found then
          v_code:='REVIEWER_STAGING_NOT_STARTED';
        elsif v_staging_status='UPLOADING' and coalesce(v_uploaded,0)=0 then
          v_code:='STAGING_CHUNK_UPLOAD_NOT_STARTED';
        elsif v_staging_status='UPLOADING' and coalesce(v_uploaded,0)<v_expected then
          v_code:='STAGING_CHUNK_UPLOAD_INCOMPLETE';
        elsif v_staging_status='UPLOADING' and coalesce(v_uploaded,0)=v_expected then
          v_code:='STAGING_FINALIZE_NOT_COMPLETED';
        elsif v_staging_status='READY' then
          v_code:='STAGING_READY_JOB_NOT_ADVANCED';
        end if;
      end if;

      update survival_ops.illustration_render_jobs
      set status='BLOCKED',
          provider_failure_count=provider_failure_count+case when v_stage='PROVIDER' and provider_failure_count<3 then 1 else 0 end,
          ingest_failure_count=ingest_failure_count+case when v_stage='INGEST' and ingest_failure_count<3 then 1 else 0 end,
          review_failure_count=review_failure_count+case when v_stage='REVIEW' and review_failure_count<3 then 1 else 0 end,
          finalizer_failure_count=finalizer_failure_count+case when v_stage='FINALIZER' and finalizer_failure_count<5 then 1 else 0 end,
          lease_owner=null,
          lease_token=null,
          lease_until=null,
          last_error_code=v_code,
          last_error_stage=v_stage,
          blocker_code=v_code,
          blocker_stage=v_stage,
          last_ingest_error_code=case when v_stage='INGEST' then v_code else last_ingest_error_code end,
          last_ingest_error_at=case when v_stage='INGEST' then clock_timestamp() else last_ingest_error_at end,
          updated_at=clock_timestamp()
      where job_id=v_job.job_id;

      if v_job.output_sha256 is not null then
        v_cleanup:=public.archive_illustration_vault_cleanup_review_staging(
          v_job.job_id,
          v_job.output_sha256
        );
      end if;
    end if;

    v_count:=v_count+1;
  end loop;

  return jsonb_build_object(
    'expired_jobs',v_count,
    'finalizer_dispatched',v_finalizer_dispatch
  );
end
$$;
