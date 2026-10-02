-- Verify Automation B one-success-per-day retry pulse policy.
begin;

do $$
declare
  v_def text;
  v_initial record;
  v_retry record;
begin
  select pg_get_functiondef(
    'public.archive_illustration_render_job_enqueue_validated_internal(jsonb)'::regprocedure
  ) into v_def;

  if position('DAILY_SUCCESS_TARGET_REACHED' in v_def)=0
     or position('DAILY_ATTEMPT_CAP_REACHED' in v_def)=0
     or position('v_daily_attempts>=8' in replace(v_def,' ',''))=0 then
    raise exception 'ILLUSTRATION_DAILY_SUCCESS_RETRY_POLICY_MISSING';
  end if;

  select jobid,schedule,active,command into v_initial
  from cron.job
  where jobname='afterfall-illustration-prep-dispatch';

  if v_initial.jobid is null
     or v_initial.schedule<>'30 20 * * *'
     or v_initial.active is not true
     or position('dispatch_afterfall_illustration_prep' in v_initial.command)=0 then
    raise exception 'ILLUSTRATION_INITIAL_PREP_CRON_INVALID';
  end if;

  select jobid,schedule,active,command into v_retry
  from cron.job
  where jobname='afterfall-illustration-retry-prep-dispatch';

  if v_retry.jobid is null
     or v_retry.schedule<>'10 0,2,4,6,8,10,12 * * *'
     or v_retry.active is not true
     or position('dispatch_afterfall_illustration_prep' in v_retry.command)=0 then
    raise exception 'ILLUSTRATION_RETRY_PREP_CRON_INVALID';
  end if;
end
$$;

rollback;
