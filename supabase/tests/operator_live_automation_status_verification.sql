-- Verify Operator dashboard reads current A/B runtime sources.
begin;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.archive_operator_system_status()'::regprocedure)
    into v_def;

  if position('archive_ops.github_dispatch_requests' in v_def)=0
     or position('afterfall-archive-external-dispatch' in v_def)=0 then
    raise exception 'OPERATOR_ARCHIVE_LIVE_STATUS_SOURCE_MISSING';
  end if;

  if position('survival_ops.illustration_render_jobs' in v_def)=0
     or position('afterfall-illustration-prep-dispatch' in v_def)=0
     or position('afterfall-illustration-retry-prep-dispatch' in v_def)=0 then
    raise exception 'OPERATOR_VISUAL_LIVE_STATUS_SOURCE_MISSING';
  end if;

  if position('survival_ops.illustration_worker_runs' in v_def)>0 then
    raise exception 'OPERATOR_VISUAL_RETIRED_SOURCE_STILL_USED';
  end if;

  if position('survival_ops.knowledge_semantic_jobs' in v_def)=0
     or position('survival_ops.knowledge_semantic_prep_runs' in v_def)=0 then
    raise exception 'OPERATOR_KNOWLEDGE_LIVE_STATUS_SOURCE_MISSING';
  end if;
end
$$;

rollback;
