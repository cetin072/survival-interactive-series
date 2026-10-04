begin;

do $$
declare
  v_def text;
begin
  if to_regprocedure('public.archive_illustration_render_attempt_history()') is null then
    raise exception 'ILLUSTRATION_ATTEMPT_HISTORY_RPC_MISSING';
  end if;

  select pg_get_functiondef(
    'public.archive_illustration_render_attempt_history()'::regprocedure
  ) into v_def;

  if position('illustration_render_jobs' in v_def)=0
     or position('attempt_no' in v_def)=0
     or position('review_decision' in v_def)=0 then
    raise exception 'ILLUSTRATION_ATTEMPT_HISTORY_CONTRACT_INVALID';
  end if;
end
$$;

rollback;
