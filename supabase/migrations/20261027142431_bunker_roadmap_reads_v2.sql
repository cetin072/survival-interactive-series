-- Additive read-only contract. Existing writers and v1 RPCs remain unchanged.
create or replace function public.archive_operator_bunker_os_read_v2(
  p_view text default 'logs', p_cycle text default null, p_status text default null,
  p_limit integer default 100, p_offset integer default 0, p_category text default 'ALL'
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  selected_cycle text := nullif(btrim(p_cycle),'');
  page_size integer := least(greatest(coalesce(p_limit,100),1),case when p_view='sources' then 200 else 100 end);
  page_offset integer := greatest(coalesce(p_offset,0),0);
  result jsonb;
begin
  perform survival_ops.private_require_archive_operator();
  if p_view is null or p_view not in ('cycles','logs','dashboard','sources')
     or (p_status is not null and p_status not in ('RUNNING','COMPLETED','BLOCKED','APPROVAL_REQUIRED'))
     or p_category is null or p_category not in ('ALL','DISASTER_SURVIVAL','BUNKER_BUILD','BUSINESS_STRATEGY','PRODUCT_MARKET','TECH_AUTOMATION','OTHER')
     or length(selected_cycle)>120 then
    raise exception using errcode='22023',message='BUNKER_READ_FILTER_INVALID';
  end if;
  if p_view='cycles' then
    with grouped as (
      select cycle_key,max(occurred_at) latest_at from survival_ops.bunker_os_operation_logs group by cycle_key
    ), page as (select * from grouped order by latest_at desc,cycle_key limit page_size offset page_offset)
    select pg_catalog.jsonb_build_object('total_count',(select count(*) from grouped),
      'cycles',coalesce((select pg_catalog.jsonb_agg(to_jsonb(page) order by latest_at desc,cycle_key) from page),'[]'::jsonb)) into result;
    return result;
  end if;
  if selected_cycle is null then
    select cycle_key into selected_cycle from survival_ops.bunker_os_operation_logs order by occurred_at desc,created_at desc,id desc limit 1;
  end if;
  if p_view='sources' then
    with expanded as (
      select l.id log_id,l.title log_title,l.cycle_key,l.occurred_at,s.value source,s.ordinality ordinal
      from survival_ops.bunker_os_operation_logs l
      cross join lateral pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(l.details->'source_candidates')='array' then l.details->'source_candidates' else '[]'::jsonb end) with ordinality s(value,ordinality)
      where l.cycle_key=selected_cycle and pg_catalog.jsonb_typeof(s.value)='object'
        and nullif(btrim(s.value->>'title'),'') is not null
    ), deduped as (
      select distinct on (coalesce(nullif(source->>'url',''),source->>'title'))
        coalesce(nullif(source->>'url',''),source->>'title') source_key,source->>'title' title,
        source->>'url' url,source->>'note' note,
        case when source->>'category' in ('DISASTER_SURVIVAL','BUNKER_BUILD','BUSINESS_STRATEGY','PRODUCT_MARKET','TECH_AUTOMATION') then source->>'category' else 'OTHER' end category,
        log_id,log_title,cycle_key,occurred_at
      from expanded order by coalesce(nullif(source->>'url',''),source->>'title'),occurred_at desc,log_id desc,ordinal
    ), filtered as (select * from deduped where p_category='ALL' or category=p_category),
    page as (select * from filtered order by occurred_at desc,source_key limit page_size offset page_offset)
    select pg_catalog.jsonb_build_object('current_cycle',selected_cycle,'total_count',(select count(*) from filtered),
      'has_more',(select count(*) from filtered)>page_offset+page_size,
      'sources',coalesce((select pg_catalog.jsonb_agg(to_jsonb(page) order by occurred_at desc,source_key) from page),'[]'::jsonb)) into result;
  else
    with filtered as (
      select id,cycle_key,phase,day_index,status,title,summary,details,occurred_at,created_at,reviewed_at,review_note
      from survival_ops.bunker_os_operation_logs where cycle_key=selected_cycle and (p_status is null or status=p_status)
    ), page as (select * from filtered order by occurred_at desc,created_at desc,id desc limit (case when p_view='dashboard' then 5 else page_size end) offset page_offset)
    select pg_catalog.jsonb_build_object('current_cycle',selected_cycle,'total_count',count(*),
      'running_count',count(*) filter(where status='RUNNING'),'completed_count',count(*) filter(where status='COMPLETED'),
      'blocked_count',count(*) filter(where status='BLOCKED'),'approval_count',count(*) filter(where status='APPROVAL_REQUIRED'),
      'latest_at',max(occurred_at),'has_more',count(*)>page_offset+page_size,
      'logs',coalesce((select pg_catalog.jsonb_agg(to_jsonb(page)-'created_at' order by occurred_at desc,created_at desc,id desc) from page),'[]'::jsonb)) into result from filtered;
  end if;
  return result;
end;
$$;
revoke all on function public.archive_operator_bunker_os_read_v2(text,text,text,integer,integer,text) from public,anon;
grant execute on function public.archive_operator_bunker_os_read_v2(text,text,text,integer,integer,text) to authenticated;
