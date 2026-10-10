-- Bunker OS supervisor dashboard v1.1.
-- Keeps v1 ledger private; adds board/detail/source read models and human-check completion.

alter table survival_ops.bunker_os_operation_logs
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete restrict,
  add column if not exists review_note text
    check (review_note is null or char_length(review_note) <= 1000);

create or replace function public.archive_operator_bunker_os_dashboard(p_limit integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  limit_value integer := least(greatest(coalesce(p_limit,5),1),20);
  current_cycle text;
  result jsonb;
begin
  actor_id := survival_ops.private_require_archive_operator();

  select l.cycle_key into current_cycle
  from survival_ops.bunker_os_operation_logs l
  order by l.occurred_at desc, l.created_at desc
  limit 1;

  select pg_catalog.jsonb_build_object(
    'current_cycle', current_cycle,
    'total_count', count(*) filter (where current_cycle is not null and l.cycle_key=current_cycle),
    'running_count', count(*) filter (where current_cycle is not null and l.cycle_key=current_cycle and l.status='RUNNING'),
    'completed_count', count(*) filter (where current_cycle is not null and l.cycle_key=current_cycle and l.status='COMPLETED'),
    'blocked_count', count(*) filter (where current_cycle is not null and l.cycle_key=current_cycle and l.status='BLOCKED'),
    'approval_count', count(*) filter (where current_cycle is not null and l.cycle_key=current_cycle and l.status='APPROVAL_REQUIRED'),
    'latest_at', max(l.occurred_at) filter (where current_cycle is not null and l.cycle_key=current_cycle),
    'logs', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',x.id,'cycle_key',x.cycle_key,'phase',x.phase,'day_index',x.day_index,
        'status',x.status,'title',x.title,'summary',x.summary,'details',x.details,
        'occurred_at',x.occurred_at,'reviewed_at',x.reviewed_at,'review_note',x.review_note
      ) order by x.occurred_at desc, x.created_at desc)
      from (
        select *
        from survival_ops.bunker_os_operation_logs
        where current_cycle is not null and cycle_key=current_cycle
        order by occurred_at desc, created_at desc
        limit limit_value
      ) x
    ), '[]'::jsonb)
  ) into result
  from survival_ops.bunker_os_operation_logs l;

  return coalesce(result, pg_catalog.jsonb_build_object(
    'current_cycle',null,'total_count',0,'running_count',0,'completed_count',0,
    'blocked_count',0,'approval_count',0,'latest_at',null,'logs','[]'::jsonb
  ));
end;
$$;

create or replace function public.archive_operator_bunker_os_logs(
  p_status text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  status_value text := nullif(upper(btrim(coalesce(p_status,''))),'');
  limit_value integer := least(greatest(coalesce(p_limit,100),1),200);
  current_cycle text;
  result jsonb;
begin
  actor_id := survival_ops.private_require_archive_operator();

  if status_value is not null and status_value not in ('RUNNING','COMPLETED','BLOCKED','APPROVAL_REQUIRED') then
    raise exception using errcode='22023', message='SURVIVAL_BUNKER_OS_STATUS_INVALID';
  end if;

  select l.cycle_key into current_cycle
  from survival_ops.bunker_os_operation_logs l
  order by l.occurred_at desc, l.created_at desc
  limit 1;

  select pg_catalog.jsonb_build_object(
    'total_count', count(*),
    'logs', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',x.id,'cycle_key',x.cycle_key,'phase',x.phase,'day_index',x.day_index,
      'status',x.status,'title',x.title,'summary',x.summary,'details',x.details,
      'occurred_at',x.occurred_at,'reviewed_at',x.reviewed_at,'review_note',x.review_note
    ) order by x.occurred_at desc, x.created_at desc), '[]'::jsonb)
  )
  into result
  from (
    select *
    from survival_ops.bunker_os_operation_logs
    where current_cycle is not null
      and cycle_key=current_cycle
      and (status_value is null or status=status_value)
    order by occurred_at desc, created_at desc
    limit limit_value
  ) x;

  return coalesce(result, pg_catalog.jsonb_build_object('total_count',0,'logs','[]'::jsonb));
end;
$$;

create or replace function public.archive_operator_bunker_os_log_detail(p_log_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  result jsonb;
begin
  actor_id := survival_ops.private_require_archive_operator();

  select pg_catalog.jsonb_build_object(
    'id',l.id,'cycle_key',l.cycle_key,'phase',l.phase,'day_index',l.day_index,
    'status',l.status,'title',l.title,'summary',l.summary,'details',l.details,
    'occurred_at',l.occurred_at,'reviewed_at',l.reviewed_at,'review_note',l.review_note,
    'reviewer',p.display_name
  ) into result
  from survival_ops.bunker_os_operation_logs l
  left join public.profiles p on p.id=l.reviewed_by
  where l.id=p_log_id;

  if result is null then
    raise exception using errcode='P0002', message='SURVIVAL_BUNKER_OS_LOG_NOT_FOUND';
  end if;

  return result;
end;
$$;

create or replace function public.archive_operator_bunker_os_mark_reviewed(
  p_log_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  note_value text := nullif(btrim(p_note),'');
  row_value survival_ops.bunker_os_operation_logs%rowtype;
begin
  actor_id := survival_ops.private_require_archive_operator();

  if note_value is not null and char_length(note_value)>1000 then
    raise exception using errcode='22023', message='SURVIVAL_BUNKER_OS_REVIEW_NOTE_TOO_LONG';
  end if;

  select * into row_value
  from survival_ops.bunker_os_operation_logs
  where id=p_log_id
  for update;

  if not found then
    raise exception using errcode='P0002', message='SURVIVAL_BUNKER_OS_LOG_NOT_FOUND';
  end if;
  if row_value.status <> 'APPROVAL_REQUIRED' then
    raise exception using errcode='40001', message='SURVIVAL_BUNKER_OS_REVIEW_NOT_REQUIRED';
  end if;

  update survival_ops.bunker_os_operation_logs
  set status='COMPLETED', reviewed_at=now(), reviewed_by=actor_id,
      review_note=note_value, updated_at=now()
  where id=p_log_id;

  return public.archive_operator_bunker_os_log_detail(p_log_id);
end;
$$;

create or replace function public.archive_operator_bunker_os_sources(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  limit_value integer := least(greatest(coalesce(p_limit,200),1),500);
  result jsonb;
begin
  actor_id := survival_ops.private_require_archive_operator();

  with expanded as (
    select
      l.id as log_id, l.title as log_title, l.cycle_key, l.occurred_at,
      source.value as source
    from survival_ops.bunker_os_operation_logs l
    cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(l.details->'source_candidates')='array'
        then l.details->'source_candidates' else '[]'::jsonb end
    ) source(value)
    where pg_catalog.jsonb_typeof(source.value)='object'
      and nullif(btrim(source.value->>'title'),'') is not null
  ),
  deduped as (
    select distinct on (coalesce(nullif(source->>'url',''), source->>'title'))
      coalesce(nullif(source->>'url',''), source->>'title') as source_key,
      source->>'title' as title,
      nullif(source->>'url','') as url,
      nullif(source->>'note','') as note,
      coalesce(nullif(source->>'category',''),'OTHER') as category,
      log_id, log_title, cycle_key, occurred_at
    from expanded
    order by coalesce(nullif(source->>'url',''), source->>'title'), occurred_at desc
  ),
  limited as (
    select * from deduped order by occurred_at desc limit limit_value
  )
  select pg_catalog.jsonb_build_object(
    'total_count', count(*),
    'sources', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'source_key',source_key,'title',title,'url',url,'note',note,'category',category,
      'log_id',log_id,'log_title',log_title,'cycle_key',cycle_key,'occurred_at',occurred_at
    ) order by occurred_at desc), '[]'::jsonb)
  )
  into result
  from limited;

  return coalesce(result, pg_catalog.jsonb_build_object('total_count',0,'sources','[]'::jsonb));
end;
$$;

revoke all on function public.archive_operator_bunker_os_dashboard(integer) from public, anon;
revoke all on function public.archive_operator_bunker_os_logs(text,integer) from public, anon;
revoke all on function public.archive_operator_bunker_os_log_detail(uuid) from public, anon;
revoke all on function public.archive_operator_bunker_os_mark_reviewed(uuid,text) from public, anon;
revoke all on function public.archive_operator_bunker_os_sources(integer) from public, anon;

grant execute on function public.archive_operator_bunker_os_dashboard(integer) to authenticated;
grant execute on function public.archive_operator_bunker_os_logs(text,integer) to authenticated;
grant execute on function public.archive_operator_bunker_os_log_detail(uuid) to authenticated;
grant execute on function public.archive_operator_bunker_os_mark_reviewed(uuid,text) to authenticated;
grant execute on function public.archive_operator_bunker_os_sources(integer) to authenticated;
