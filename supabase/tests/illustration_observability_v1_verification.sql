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
      and column_name='provider_completed_at'
  ) then
    raise exception 'ILLUSTRATION_PROVIDER_COMPLETED_AT_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_render_job_provider_complete(text,text)'::regprocedure
  ) into v_def;
  if position('provider_completed_at=coalesce(provider_completed_at,clock_timestamp())' in v_def)=0 then
    raise exception 'ILLUSTRATION_PROVIDER_COMPLETION_TIMESTAMP_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_operator_system_status()'::regprocedure
  ) into v_def;
  if position('RENDERER_NOT_CONSUMED' in v_def)=0
     or position('REVIEWER_NOT_CONSUMED' in v_def)=0
     or position('REVIEWER_NOT_COMPLETED' in v_def)=0
     or position('provider_failure_count' in v_def)=0
     or position('age_minutes' in v_def)=0 then
    raise exception 'ILLUSTRATION_OPERATOR_STALL_DIAGNOSTIC_MISSING';
  end if;
end
$$;

rollback;
