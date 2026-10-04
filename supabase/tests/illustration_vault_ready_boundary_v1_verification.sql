begin;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public.archive_illustration_review_staging_begin(jsonb)'::regprocedure
  ) into v_def;
  if position('archive_illustration_assert_source_fresh' in v_def)=0
     or position('ILLUSTRATION_STALE_OUTPUT_REUSE' in pg_get_functiondef(
       'public.archive_illustration_assert_source_fresh(text,text)'::regprocedure
     ))=0 then
    raise exception 'ILLUSTRATION_STALE_OUTPUT_GUARD_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_review_staging_finalize(text,uuid,text)'::regprocedure
  ) into v_def;
  if position('output_sha256=v_staging.source_sha256' in v_def)=0
     or position('review_staging_id=v_staging.staging_id' in v_def)=0
     or position('illustration_vault_items' in v_def)=0
     or position('dispatch_afterfall_illustration_vault' in v_def)=0
     or position('READY_FOR_REVIEW' in v_def)=0 then
    raise exception 'ILLUSTRATION_VAULT_READY_BOUNDARY_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_vault_cleanup_review_staging(text,text)'::regprocedure
  ) into v_def;
  if position('j.status=''BLOCKED''' in v_def)=0 then
    raise exception 'ILLUSTRATION_BLOCKED_STAGING_CLEANUP_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_review_complete_unleased_internal(jsonb)'::regprocedure
  ) into v_def;
  if position('archive_illustration_vault_cleanup_review_staging' in v_def)=0
     or position('dispatch_afterfall_illustration_vault' in v_def)=0 then
    raise exception 'ILLUSTRATION_REVIEW_VAULT_IDEMPOTENCY_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_render_job_record_failure(text,uuid,text,text)'::regprocedure
  ) into v_def;
  if position('archive_illustration_vault_cleanup_review_staging' in v_def)=0 then
    raise exception 'ILLUSTRATION_FAILURE_STAGING_CLEANUP_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_render_jobs_sweep_stale()'::regprocedure
  ) into v_def;
  if position('archive_illustration_vault_cleanup_review_staging' in v_def)=0 then
    raise exception 'ILLUSTRATION_SWEEP_STAGING_CLEANUP_MISSING';
  end if;
end
$$;

rollback;
