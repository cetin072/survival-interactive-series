-- Survival Archive review control plane.
-- Additive only: reuses the existing survival_ops schema and capability registry.
create table if not exists survival_ops.archive_review_items (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique
    check (idempotency_key ~ '^[A-Za-z0-9:._/-]{12,180}$'),
  source_worker text not null
    check (source_worker in ('A_ARCHIVE','B_VISUAL','C_KNOWLEDGE','SYSTEM')),
  item_type text not null
    check (item_type in ('KNOWLEDGE','VISUAL','CANON','AUTOMATION_ERROR','PUBLICATION','SECURITY','COST')),
  chronicle_id text
    check (chronicle_id is null or chronicle_id ~ '^C[0-9]{2}-[A-Z0-9][A-Z0-9-]{2,80}$'),
  priority text not null check (priority in ('P0','P1','P2','P3')),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  summary text not null check (char_length(btrim(summary)) between 1 and 4000),
  risk_level text not null check (risk_level in ('LOW','MEDIUM','HIGH','UNKNOWN')),
  source_ref text not null check (char_length(source_ref) between 1 and 700),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 16384),
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','HOLD','REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete restrict,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  check (
    (status = 'PENDING' and decided_at is null and decided_by is null)
    or (status <> 'PENDING' and decided_at is not null and decided_by is not null)
  )
);

create index if not exists archive_review_items_inbox_idx
  on survival_ops.archive_review_items (status, priority, created_at desc);
create index if not exists archive_review_items_worker_status_idx
  on survival_ops.archive_review_items (source_worker, item_type, status);

create table if not exists survival_ops.archive_review_decisions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references survival_ops.archive_review_items(id) on delete restrict,
  decision text not null check (decision in ('APPROVED','HOLD','REJECTED')),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists archive_review_decisions_item_idx
  on survival_ops.archive_review_decisions (item_id, created_at desc);

alter table survival_ops.archive_review_items enable row level security;
alter table survival_ops.archive_review_decisions enable row level security;
drop policy if exists archive_review_items_client_deny on survival_ops.archive_review_items;
create policy archive_review_items_client_deny
  on survival_ops.archive_review_items for all to anon, authenticated
  using (false) with check (false);
drop policy if exists archive_review_decisions_client_deny on survival_ops.archive_review_decisions;
create policy archive_review_decisions_client_deny
  on survival_ops.archive_review_decisions for all to anon, authenticated
  using (false) with check (false);
revoke all on survival_ops.archive_review_items from public, anon, authenticated, service_role;
revoke all on survival_ops.archive_review_decisions from public, anon, authenticated, service_role;

-- Reuse the existing technical capability model. Only the real super_admin role
-- receives this capability; simulated/effective roles are not used for technical grants.
insert into public.platform_capabilities (code, capability_kind, operations_manager_auto_grant, description, active)
values ('survival_archive.review', 'technical', false, 'Review Survival Archive control-plane items', true)
on conflict (code) do nothing;

do $$
begin
  if not exists (
    select 1 from public.platform_capabilities
    where code='survival_archive.review' and capability_kind='technical' and active
      and not operations_manager_auto_grant
  ) then
    raise exception 'SURVIVAL_ARCHIVE_CAPABILITY_CONFLICT';
  end if;
  if not exists (select 1 from public.roles where code='super_admin' and active) then
    raise exception 'SURVIVAL_ARCHIVE_SUPER_ADMIN_ROLE_MISSING';
  end if;
end
$$;

insert into public.role_capability_grants (role_id, capability_code)
select role.id, 'survival_archive.review'
from public.roles role
where role.code='super_admin' and role.active
on conflict (role_id, capability_code) do nothing;

create or replace function survival_ops.private_require_archive_operator()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
     or not public.current_profile_is_active()
     or not public.private_actor_can('survival_archive.review') then
    raise exception using errcode='42501', message='SURVIVAL_ARCHIVE_OPERATOR_FORBIDDEN';
  end if;
  return actor_id;
end;
$$;
revoke all on function survival_ops.private_require_archive_operator() from public, anon, authenticated, service_role;

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
      ) filter (where item.id is not null),
      '[]'::jsonb
    )
  ) into result
  from survival_ops.archive_review_items item;
  return coalesce(result, jsonb_build_object('pending_count',0,'automation_error_count',0,'items','[]'::jsonb));
end;
$$;

create or replace function public.archive_operator_review_item_detail(p_item_id uuid)
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
    'id', item.id,
    'source_worker', item.source_worker,
    'item_type', item.item_type,
    'chronicle_id', item.chronicle_id,
    'priority', item.priority,
    'title', item.title,
    'summary', item.summary,
    'risk_level', item.risk_level,
    'source_ref', item.source_ref,
    'payload', item.payload,
    'status', item.status,
    'created_at', item.created_at,
    'updated_at', item.updated_at,
    'decided_at', item.decided_at,
    'decision_note', item.decision_note,
    'decision_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'decision', decision.decision,
        'note', decision.note,
        'created_at', decision.created_at,
        'actor', profile.display_name
      ) order by decision.created_at desc)
      from survival_ops.archive_review_decisions decision
      join public.profiles profile on profile.id=decision.actor_profile_id
      where decision.item_id=item.id
    ), '[]'::jsonb)
  ) into result
  from survival_ops.archive_review_items item
  where item.id=p_item_id;
  if result is null then
    raise exception using errcode='P0002', message='SURVIVAL_ARCHIVE_REVIEW_ITEM_NOT_FOUND';
  end if;
  return result;
end;
$$;

create or replace function public.archive_operator_decide_review_item(
  p_item_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  item_row survival_ops.archive_review_items%rowtype;
  decision_value text := upper(btrim(coalesce(p_decision,'')));
  note_value text := nullif(btrim(p_note),'');
begin
  actor_id := survival_ops.private_require_archive_operator();
  if decision_value not in ('APPROVED','HOLD','REJECTED') then
    raise exception using errcode='22023', message='SURVIVAL_ARCHIVE_INVALID_DECISION';
  end if;
  if note_value is not null and char_length(note_value)>1000 then
    raise exception using errcode='22023', message='SURVIVAL_ARCHIVE_DECISION_NOTE_TOO_LONG';
  end if;
  select * into item_row
  from survival_ops.archive_review_items
  where id=p_item_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='SURVIVAL_ARCHIVE_REVIEW_ITEM_NOT_FOUND';
  end if;
  if item_row.status <> 'PENDING' then
    raise exception using errcode='40001', message='SURVIVAL_ARCHIVE_REVIEW_ITEM_ALREADY_DECIDED';
  end if;
  insert into survival_ops.archive_review_decisions(item_id,decision,actor_profile_id,note)
  values (item_row.id,decision_value,actor_id,note_value);
  update survival_ops.archive_review_items
  set status=decision_value,
      decided_at=now(),
      decided_by=actor_id,
      decision_note=note_value,
      updated_at=now()
  where id=item_row.id;
  return public.archive_operator_review_item_detail(item_row.id);
end;
$$;

create or replace function public.archive_worker_enqueue_review_item(
  p_idempotency_key text,
  p_source_worker text,
  p_item_type text,
  p_chronicle_id text,
  p_priority text,
  p_title text,
  p_summary text,
  p_risk_level text,
  p_source_ref text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_row survival_ops.archive_review_items%rowtype;
  inserted_count integer;
  trusted_role text := (select auth.jwt() ->> 'role');
begin
  if trusted_role is distinct from 'service_role' then
    raise exception using errcode='42501', message='SURVIVAL_ARCHIVE_WORKER_FORBIDDEN';
  end if;
  if p_source_ref !~ '^https://github\.com/cetin072/survival-interactive-series/blob/[a-f0-9]{40}/knowledge/content/briefs/K-[0-9]+\.json$'
     and not (p_source_worker='C_KNOWLEDGE' and p_item_type='KNOWLEDGE'
       and p_idempotency_key like 'TEST:%'
       and p_source_ref ~ '^test://archive-v2-mvp/[a-z0-9-]+$') then
    raise exception using errcode='22023', message='SURVIVAL_ARCHIVE_SOURCE_REF_INVALID';
  end if;
  insert into survival_ops.archive_review_items(
    idempotency_key,source_worker,item_type,chronicle_id,priority,title,summary,risk_level,source_ref,payload
  ) values (
    p_idempotency_key,p_source_worker,p_item_type,p_chronicle_id,p_priority,
    btrim(p_title),btrim(p_summary),p_risk_level,p_source_ref,coalesce(p_payload,'{}'::jsonb)
  ) on conflict (idempotency_key) do nothing;
  get diagnostics inserted_count = row_count;
  select * into item_row from survival_ops.archive_review_items where idempotency_key=p_idempotency_key;
  return jsonb_build_object('id',item_row.id,'status',item_row.status,'created',inserted_count=1);
end;
$$;

revoke all on function public.archive_operator_review_inbox() from public, anon;
revoke all on function public.archive_operator_review_item_detail(uuid) from public, anon;
revoke all on function public.archive_operator_decide_review_item(uuid,text,text) from public, anon;
revoke all on function public.archive_worker_enqueue_review_item(text,text,text,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.archive_operator_review_inbox() to authenticated;
grant execute on function public.archive_operator_review_item_detail(uuid) to authenticated;
grant execute on function public.archive_operator_decide_review_item(uuid,text,text) to authenticated;
grant execute on function public.archive_worker_enqueue_review_item(text,text,text,text,text,text,text,text,text,jsonb) to service_role;
