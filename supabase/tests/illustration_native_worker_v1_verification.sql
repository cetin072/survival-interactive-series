begin;

do $$
declare
  v_def text;
begin
  if to_regprocedure('public.archive_illustration_review_decide_v3(jsonb)') is null then
    raise exception 'ILLUSTRATION_NATIVE_REVIEW_DECISION_RPC_MISSING';
  end if;

  if to_regprocedure('public.archive_illustration_site_staging_begin(jsonb)') is null
     or to_regprocedure('public.archive_illustration_site_staging_finalize(text,uuid,text)') is null then
    raise exception 'ILLUSTRATION_NATIVE_SITE_STAGING_RPC_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_render_job_provider_complete(text,text)'::regprocedure
  ) into v_def;
  if position('status=''INGESTING''' in v_def)=0
     or position('lease_until=null' in replace(v_def,' ',''))=0 then
    raise exception 'ILLUSTRATION_NATIVE_PROVIDER_HANDOFF_NOT_SIMPLIFIED';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_review_decide_v3(jsonb)'::regprocedure
  ) into v_def;
  if position('REVIEW_PASS_STAGED' in v_def)=0
     or position('REVIEW_REJECTED' in v_def)=0
     or position('HUMAN_REVIEW' in v_def)=0
     or position('illustration_vault' in v_def)>0 then
    raise exception 'ILLUSTRATION_NATIVE_REVIEW_DECISION_CONTRACT_INVALID';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_site_staging_finalize(text,uuid,text)'::regprocedure
  ) into v_def;
  if position('FINALIZE_QUEUED' in v_def)=0
     or position('dispatch_afterfall_illustration_finalize' in v_def)=0
     or position('illustration_vault' in v_def)>0 then
    raise exception 'ILLUSTRATION_NATIVE_PASS_TRANSFER_CONTRACT_INVALID';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_review_staging_chunk_put(text,uuid,text,integer,text)'::regprocedure
  ) into v_def;
  if position('REVIEW_PASS_STAGED' in v_def)=0
     or position('archive_illustration_render_job_lease_heartbeat' in v_def)=0 then
    raise exception 'ILLUSTRATION_NATIVE_PASS_TRANSFER_RESUME_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_render_jobs_sweep_stale()'::regprocedure
  ) into v_def;
  if position('PASS_ASSET_TRANSFER_LEASE_EXPIRED' in v_def)=0
     or position('REVIEW_LEASE_EXPIRED' in v_def)=0 then
    raise exception 'ILLUSTRATION_NATIVE_RESUMABLE_SWEEP_MISSING';
  end if;
end
$$;

rollback;
