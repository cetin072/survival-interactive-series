begin;

do $$
declare
  v_def text;
begin
  if not exists(
    select 1
    from information_schema.columns
    where table_schema='survival_ops'
      and table_name='illustration_render_jobs'
      and column_name='ingest_uploaded_chunk_count'
  ) then
    raise exception 'ILLUSTRATION_INGEST_PROGRESS_COLUMN_MISSING';
  end if;

  if not exists(
    select 1
    from information_schema.columns
    where table_schema='survival_ops'
      and table_name='illustration_render_jobs'
      and column_name='last_ingest_error_code'
  ) then
    raise exception 'ILLUSTRATION_INGEST_ERROR_COLUMN_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_review_staging_chunk_put(text,uuid,text,integer,text)'::regprocedure
  ) into v_def;
  if position('archive_illustration_render_job_lease_heartbeat' in v_def)=0
     or position('ingest_uploaded_chunk_count' in v_def)=0
     or position('stored_chunk_count' in v_def)=0 then
    raise exception 'ILLUSTRATION_CHUNK_PROGRESS_HEARTBEAT_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_render_job_record_failure(text,uuid,text,text)'::regprocedure
  ) into v_def;
  if position('last_ingest_error_code' in v_def)=0
     or position('last_ingest_error_at' in v_def)=0 then
    raise exception 'ILLUSTRATION_INGEST_FAILURE_DURABILITY_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_render_jobs_sweep_stale()'::regprocedure
  ) into v_def;
  if position('REVIEWER_STAGING_NOT_STARTED' in v_def)=0
     or position('STAGING_CHUNK_UPLOAD_NOT_STARTED' in v_def)=0
     or position('STAGING_CHUNK_UPLOAD_INCOMPLETE' in v_def)=0
     or position('STAGING_FINALIZE_NOT_COMPLETED' in v_def)=0
     or position('STAGING_READY_JOB_NOT_ADVANCED' in v_def)=0 then
    raise exception 'ILLUSTRATION_INGEST_SWEEP_DIAGNOSTICS_MISSING';
  end if;
end
$$;

rollback;
