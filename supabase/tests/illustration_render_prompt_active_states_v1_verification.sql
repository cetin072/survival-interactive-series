begin;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.archive_illustration_render_prompt()'::regprocedure)
    into v_def;

  if position('INGESTING' in v_def)=0
     or position('READY_FOR_REVIEW' in v_def)=0
     or position('PREPARED' in v_def)=0 then
    raise exception 'ILLUSTRATION_RENDER_PROMPT_ACTIVE_STATE_READ_MISSING';
  end if;
end
$$;

rollback;
