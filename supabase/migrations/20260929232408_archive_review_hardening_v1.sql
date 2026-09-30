-- Additive hardening for the Archive Operator queue and Automation C consumer.
-- Existing decision rows remain immutable; receipts track downstream processing.

create table if not exists survival_ops.archive_review_consumption_receipts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references survival_ops.archive_review_items(id) on delete restrict,
  outcome text not null check (outcome in ('DISPATCHED','CONSUMED','BLOCKED','RETRYABLE')),
  result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 8192),
  created_at timestamptz not null default now()
);

alter table survival_ops.archive_review_consumption_receipts enable row level security;
drop policy if exists archive_review_receipts_client_deny on survival_ops.archive_review_consumption_receipts;
create policy archive_review_receipts_client_deny
  on survival_ops.archive_review_consumption_receipts for all to anon, authenticated
  using (false) with check (false);
revoke all on survival_ops.archive_review_consumption_receipts from public, anon, authenticated, service_role;

create or replace function public.archive_operator_review_inbox()
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
  select jsonb_build_object(
    'pending_count', count(*) filter (where item.status='PENDING'),
    'automation_error_count', count(*) filter (where item.status='PENDING' and item.item_type='AUTOMATION_ERROR'),
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'source_worker', item.source_worker,
          'item_type', item.item_type,
          'chronicle_id', item.chronicle_id,
          'priority', item.priority,
          'title', item.title,
          'summary', item.summary,
          'risk_level', item.risk_level,
          'source_ref', item.source_ref,
          'status', item.status,
          'created_at', item.created_at
        ) order by case item.priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end, item.created_at
      ) filter (where item.status='PENDING'),
      '[]'::jsonb
    )
  ) into result
  from survival_ops.archive_review_items item;
  return coalesce(result, jsonb_build_object('pending_count',0,'automation_error_count',0,'items','[]'::jsonb));
end;
$$;

create or replace function public.archive_worker_list_approved_reviews(p_limit integer default 1)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception using errcode='42501', message='SURVIVAL_ARCHIVE_WORKER_FORBIDDEN';
  end if;
  if p_limit is distinct from 1 then
    raise exception using errcode='22023', message='SURVIVAL_ARCHIVE_CONSUMER_LIMIT_INVALID';
  end if;
  return query
  select jsonb_build_object(
    'id', item.id,
    'idempotency_key', item.idempotency_key,
    'source_ref', item.source_ref,
    'payload', item.payload,
    'decided_at', item.decided_at,
    'decision', item.status
  )
  from survival_ops.archive_review_items item
  where item.source_worker='C_KNOWLEDGE' and item.item_type='KNOWLEDGE'
    and item.status='APPROVED'
    and not exists (select 1 from survival_ops.archive_review_consumption_receipts receipt where receipt.item_id=item.id and receipt.outcome<>'RETRYABLE')
  order by item.decided_at, item.id
  limit p_limit
  for update of item skip locked;
end;
$$;

create or replace function public.archive_worker_get_approved_review(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception using errcode='42501', message='SURVIVAL_ARCHIVE_WORKER_FORBIDDEN';
  end if;
  select jsonb_build_object(
    'id', item.id, 'idempotency_key', item.idempotency_key, 'status', item.status, 'title', item.title,
    'source_worker', item.source_worker, 'item_type', item.item_type,
    'source_ref', item.source_ref, 'payload', item.payload, 'decided_at', item.decided_at,
    'receipt', case when receipt.item_id is null then null else jsonb_build_object('outcome', receipt.outcome, 'result', receipt.result) end
  ) into result
  from survival_ops.archive_review_items item
  left join survival_ops.archive_review_consumption_receipts receipt on receipt.item_id=item.id
  where item.id=p_item_id;
  return result;
end;
$$;

create or replace function public.archive_worker_record_review_consumption(
  p_item_id uuid,
  p_decided_at timestamptz,
  p_outcome text,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_row survival_ops.archive_review_consumption_receipts%rowtype;
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception using errcode='42501', message='SURVIVAL_ARCHIVE_WORKER_FORBIDDEN';
  end if;
  if p_outcome not in ('DISPATCHED','CONSUMED','BLOCKED','RETRYABLE') or jsonb_typeof(coalesce(p_result,'{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(p_result,'{}'::jsonb)) > 8192 then
    raise exception using errcode='22023', message='SURVIVAL_ARCHIVE_CONSUMPTION_RESULT_INVALID';
  end if;
  if not exists (
    select 1 from survival_ops.archive_review_items item
    where item.id=p_item_id and item.source_worker='C_KNOWLEDGE' and item.item_type='KNOWLEDGE'
      and item.status='APPROVED' and item.decided_at=p_decided_at
  ) then
    raise exception using errcode='40001', message='SURVIVAL_ARCHIVE_APPROVAL_IDENTITY_STALE';
  end if;
  insert into survival_ops.archive_review_consumption_receipts(item_id,outcome,result)
  values (p_item_id,p_outcome,coalesce(p_result,'{}'::jsonb))
  on conflict (item_id) do update
    set outcome=excluded.outcome,result=excluded.result,created_at=now()
    where survival_ops.archive_review_consumption_receipts.outcome in ('DISPATCHED','RETRYABLE');
  select * into result_row from survival_ops.archive_review_consumption_receipts where item_id=p_item_id;
  return jsonb_build_object('item_id',result_row.item_id,'outcome',result_row.outcome,'result',result_row.result,'created',result_row.created_at is not null);
end;
$$;

revoke all on function public.archive_worker_list_approved_reviews(integer) from public, anon, authenticated;
revoke all on function public.archive_worker_get_approved_review(uuid) from public, anon, authenticated;
revoke all on function public.archive_worker_record_review_consumption(uuid,timestamptz,text,jsonb) from public, anon, authenticated;
grant execute on function public.archive_worker_list_approved_reviews(integer) to service_role;
grant execute on function public.archive_worker_get_approved_review(uuid) to service_role;
grant execute on function public.archive_worker_record_review_consumption(uuid,timestamptz,text,jsonb) to service_role;
