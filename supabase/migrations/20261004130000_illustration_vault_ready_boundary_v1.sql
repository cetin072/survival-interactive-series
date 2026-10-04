-- Automation B hardening: preserve every verified staged render before review.
-- 1) Reject cross-job reuse of an old current.png by immutable source SHA.
-- 2) Queue the 30-day private vault as soon as review staging becomes READY.
-- 3) Keep review staging cleanup safe for BLOCKED jobs once the vault copy is STORED.
-- 4) Preserve existing PASS/REJECT/HUMAN_REVIEW and finalizer flows.

create or replace function public.archive_illustration_assert_source_fresh(
  p_job_id text,
  p_source_sha256 text
)
returns void
language plpgsql
stable
set search_path=''
as $$
begin
  if coalesce(p_job_id,'')=''
     or coalesce(p_source_sha256,'') !~ '^[a-f0-9]{64}$' then
    raise exception 'ILLUSTRATION_SOURCE_FRESHNESS_ARGUMENT_INVALID' using errcode='22023';
  end if;

  if exists(
    select 1
    from survival_ops.illustration_review_staging s
    where s.job_id<>p_job_id
      and s.source_sha256=p_source_sha256
  ) or exists(
    select 1
    from survival_ops.illustration_render_jobs j
    where j.job_id<>p_job_id
      and j.output_sha256=p_source_sha256
  ) or exists(
    select 1
    from survival_ops.illustration_vault_items v
    where v.job_id<>p_job_id
      and v.source_sha256=p_source_sha256
  ) then
    raise exception 'ILLUSTRATION_STALE_OUTPUT_REUSE' using errcode='22023';
  end if;
end
$$;

revoke all on function public.archive_illustration_assert_source_fresh(text,text)
  from public,anon,authenticated;

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
    'vault_status',(select status from survival_ops.illustration_vault_items where job_id=v_job.job_id),
    'vault_dispatch_request_id',v_vault_dispatch
  );
end
$$;

create or replace function public.archive_illustration_vault_cleanup_review_staging(
  p_job_id text,
  p_source_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_staging_id text;
  v_deleted integer:=0;
begin
  select v.review_staging_id into v_staging_id
  from survival_ops.illustration_vault_items v
  join survival_ops.illustration_render_jobs j on j.job_id=v.job_id
  where v.job_id=p_job_id
    and v.status='STORED'
    and v.source_sha256=p_source_sha256
    and (
      j.review_decision in ('REJECT','HUMAN_REVIEW')
      or (j.review_decision='PASS' and j.status='SUCCEEDED')
      or (
        j.status='BLOCKED'
        and j.review_staging_id=v.review_staging_id
        and j.output_sha256=v.source_sha256
      )
    );

  if v_staging_id is null then
    return jsonb_build_object('job_id',p_job_id,'deleted',0);
  end if;

  delete from survival_ops.illustration_review_staging
  where staging_id=v_staging_id and source_sha256=p_source_sha256;
  get diagnostics v_deleted=row_count;

  return jsonb_build_object('job_id',p_job_id,'staging_id',v_staging_id,'deleted',v_deleted);
end
$$;

create or replace function public.archive_illustration_review_complete_unleased_internal(p_review jsonb)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','survival_ops','archive_ops'
as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_decision text:=p_review->>'decision';
  v_dispatch bigint;
  v_vault_dispatch bigint;
  v_review survival_ops.illustration_review_staging%rowtype;
  v_object_path text;
  v_cleanup jsonb;
begin
  select * into v_job
  from survival_ops.illustration_render_jobs
  where job_id=p_review->>'job_id'
  for update;

  if not found or v_job.status<>'PREPARED' then
    raise exception 'ILLUSTRATION_REVIEW_JOB_NOT_PREPARED' using errcode='22023';
  end if;

  if v_decision not in ('PASS','REJECT','HUMAN_REVIEW')
     or p_review->>'review_provider' is null
     or p_review->>'output_sha256' !~ '^[a-f0-9]{64}$'
     or coalesce((p_review->>'output_bytes')::integer,0) not between 1 and 20971520
     or coalesce((p_review->>'output_width')::integer,0) not between 1 and 8192
     or coalesce((p_review->>'output_height')::integer,0) not between 1 and 8192
     or jsonb_typeof(coalesce(p_review->'rejection_codes','[]'::jsonb))<>'array'
     or p_review->>'review_staging_id' is null
     or p_review->>'provider_asset_id' is null then
    raise exception 'INVALID_ILLUSTRATION_REVIEW' using errcode='22023';
  end if;

  select * into v_review
  from survival_ops.illustration_review_staging
  where staging_id=p_review->>'review_staging_id' and status='READY';

  if not found
     or v_review.job_id<>v_job.job_id
     or v_review.point_id<>v_job.point_id
     or v_review.generation_key<>v_job.generation_key
     or v_review.subject_id<>v_job.subject_id
     or v_review.source_sha256<>p_review->>'output_sha256'
     or v_review.byte_count<>(p_review->>'output_bytes')::integer
     or v_review.width<>(p_review->>'output_width')::integer
     or v_review.height<>(p_review->>'output_height')::integer
     or v_review.provider_asset_id<>p_review->>'provider_asset_id' then
    raise exception 'ILLUSTRATION_REVIEW_STAGING_BINDING_INVALID' using errcode='22023';
  end if;

  update survival_ops.illustration_render_jobs set
    output_sha256=p_review->>'output_sha256',
    output_bytes=(p_review->>'output_bytes')::integer,
    output_width=(p_review->>'output_width')::integer,
    output_height=(p_review->>'output_height')::integer,
    review_provider=p_review->>'review_provider',
    review_decision=v_decision,
    review_summary=nullif(p_review->>'review_summary',''),
    rejection_codes=coalesce(p_review->'rejection_codes','[]'::jsonb),
    review_staging_id=p_review->>'review_staging_id',
    provider_asset_id=p_review->>'provider_asset_id',
    reviewed_at=clock_timestamp(),
    updated_at=clock_timestamp(),
    status=case
      when v_decision='PASS' then 'REVIEW_PASS_STAGED'
      when v_decision='REJECT' then 'REVIEW_REJECTED'
      else 'HUMAN_REVIEW'
    end
  where job_id=v_job.job_id;

  v_object_path:='AFTERFALL/'||v_job.date_kst::text||'/'||v_job.job_id||'/'||(p_review->>'output_sha256')||'.png';

  insert into survival_ops.illustration_vault_items(
    job_id,review_staging_id,source_sha256,object_path,status
  ) values (
    v_job.job_id,p_review->>'review_staging_id',p_review->>'output_sha256',v_object_path,'QUEUED'
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

  if v_decision='PASS' then
    v_dispatch:=archive_ops.dispatch_afterfall_illustration_finalize(v_job.job_id);
    update survival_ops.illustration_render_jobs
    set status='FINALIZE_QUEUED',finalizer_dispatch_request_id=v_dispatch,updated_at=clock_timestamp()
    where job_id=v_job.job_id;
  end if;

  v_cleanup:=public.archive_illustration_vault_cleanup_review_staging(
    v_job.job_id,
    p_review->>'output_sha256'
  );

  return jsonb_build_object(
    'status',case when v_decision='PASS' then 'FINALIZE_QUEUED' else v_decision end,
    'job_id',v_job.job_id,
    'dispatch_request_id',v_dispatch,
    'vault_dispatch_request_id',v_vault_dispatch,
    'review_staging_cleanup',v_cleanup
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
