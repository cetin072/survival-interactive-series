-- Bunker OS supervisor dashboard v1.
-- Additive, private-by-default operational journal for AI strategy/research runs.
-- Existing Archive/Knowledge/Automation A/B/C behavior is untouched.

create table if not exists survival_ops.bunker_os_operation_logs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique
    check (idempotency_key ~ '^[A-Za-z0-9:._/-]{12,180}$'),
  cycle_key text not null
    check (cycle_key ~ '^[A-Z0-9_]{6,80}$'),
  phase text not null
    check (phase ~ '^[A-Z0-9_]{3,100}$'),
  day_index smallint
    check (day_index is null or day_index between 1 and 366),
  status text not null
    check (status in ('RUNNING','COMPLETED','BLOCKED','APPROVAL_REQUIRED')),
  title text not null
    check (char_length(btrim(title)) between 1 and 240),
  summary text not null
    check (char_length(btrim(summary)) between 1 and 4000),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details)='object' and pg_column_size(details) <= 32768),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bunker_os_operation_logs_cycle_time_idx
  on survival_ops.bunker_os_operation_logs (cycle_key, occurred_at desc);
create index if not exists bunker_os_operation_logs_status_idx
  on survival_ops.bunker_os_operation_logs (status, occurred_at desc);

alter table survival_ops.bunker_os_operation_logs enable row level security;
drop policy if exists bunker_os_operation_logs_client_deny on survival_ops.bunker_os_operation_logs;
create policy bunker_os_operation_logs_client_deny
  on survival_ops.bunker_os_operation_logs for all to anon, authenticated
  using (false) with check (false);

revoke all on survival_ops.bunker_os_operation_logs from public, anon, authenticated, service_role;

create or replace function public.archive_operator_bunker_os_dashboard(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  limit_value integer := least(greatest(coalesce(p_limit,50),1),100);
  current_cycle text;
  result jsonb;
begin
  actor_id := survival_ops.private_require_archive_operator();

  select l.cycle_key
    into current_cycle
  from survival_ops.bunker_os_operation_logs l
  order by l.occurred_at desc, l.created_at desc
  limit 1;

  select pg_catalog.jsonb_build_object(
    'current_cycle', current_cycle,
    'total_count', count(*) filter (where current_cycle is not null and l.cycle_key=current_cycle),
    'completed_count', count(*) filter (where current_cycle is not null and l.cycle_key=current_cycle and l.status='COMPLETED'),
    'blocked_count', count(*) filter (where current_cycle is not null and l.cycle_key=current_cycle and l.status='BLOCKED'),
    'approval_count', count(*) filter (where current_cycle is not null and l.cycle_key=current_cycle and l.status='APPROVAL_REQUIRED'),
    'latest_at', max(l.occurred_at) filter (where current_cycle is not null and l.cycle_key=current_cycle),
    'logs', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', x.id,
        'cycle_key', x.cycle_key,
        'phase', x.phase,
        'day_index', x.day_index,
        'status', x.status,
        'title', x.title,
        'summary', x.summary,
        'details', x.details,
        'occurred_at', x.occurred_at
      ) order by x.occurred_at desc, x.created_at desc)
      from (
        select *
        from survival_ops.bunker_os_operation_logs
        where current_cycle is not null and cycle_key=current_cycle
        order by occurred_at desc, created_at desc
        limit limit_value
      ) x
    ), '[]'::jsonb)
  )
  into result
  from survival_ops.bunker_os_operation_logs l;

  return coalesce(result, pg_catalog.jsonb_build_object(
    'current_cycle',null,'total_count',0,'completed_count',0,'blocked_count',0,'approval_count',0,'latest_at',null,'logs','[]'::jsonb
  ));
end;
$$;

create or replace function public.archive_worker_bunker_os_log_append(
  p_idempotency_key text,
  p_cycle_key text,
  p_phase text,
  p_day_index integer,
  p_status text,
  p_title text,
  p_summary text,
  p_details jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_value survival_ops.bunker_os_operation_logs%rowtype;
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception using errcode='42501', message='SURVIVAL_BUNKER_OS_WORKER_FORBIDDEN';
  end if;

  insert into survival_ops.bunker_os_operation_logs(
    idempotency_key,cycle_key,phase,day_index,status,title,summary,details,occurred_at
  ) values (
    p_idempotency_key,p_cycle_key,p_phase,p_day_index,p_status,btrim(p_title),btrim(p_summary),
    coalesce(p_details,'{}'::jsonb),coalesce(p_occurred_at,now())
  )
  on conflict (idempotency_key) do update
    set cycle_key=excluded.cycle_key,
        phase=excluded.phase,
        day_index=excluded.day_index,
        status=excluded.status,
        title=excluded.title,
        summary=excluded.summary,
        details=excluded.details,
        occurred_at=excluded.occurred_at,
        updated_at=now();

  select * into row_value
  from survival_ops.bunker_os_operation_logs
  where idempotency_key=p_idempotency_key;

  return pg_catalog.jsonb_build_object(
    'id',row_value.id,
    'idempotency_key',row_value.idempotency_key,
    'status',row_value.status,
    'occurred_at',row_value.occurred_at
  );
end;
$$;

revoke all on function public.archive_operator_bunker_os_dashboard(integer) from public, anon;
grant execute on function public.archive_operator_bunker_os_dashboard(integer) to authenticated;

revoke all on function public.archive_worker_bunker_os_log_append(text,text,text,integer,text,text,text,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.archive_worker_bunker_os_log_append(text,text,text,integer,text,text,text,jsonb,timestamptz) to service_role;
