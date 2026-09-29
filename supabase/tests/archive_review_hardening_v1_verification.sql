-- Rollback-only verification for archive_review_hardening_v1.
begin;
do $$
declare
  actor_id uuid;
  item_id uuid;
  enqueue_result jsonb;
  inbox_result jsonb;
  approved jsonb;
  receipt jsonb;
  head_sha text := repeat('b', 40);
  idempotency text := 'TEST:archive-review-hardening:' || head_sha;
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='survival_ops'
      and c.relname='archive_review_consumption_receipts'
      and c.relrowsecurity
  ) then
    raise exception 'ARCHIVE_REVIEW_RECEIPT_RLS_MISSING';
  end if;

  if has_table_privilege('anon','survival_ops.archive_review_consumption_receipts','SELECT')
     or has_table_privilege('authenticated','survival_ops.archive_review_consumption_receipts','SELECT')
     or has_table_privilege('service_role','survival_ops.archive_review_consumption_receipts','SELECT') then
    raise exception 'ARCHIVE_REVIEW_RECEIPT_DIRECT_ACCESS_PRESENT';
  end if;

  if has_function_privilege('anon','public.archive_worker_list_approved_reviews(integer)','EXECUTE')
     or has_function_privilege('authenticated','public.archive_worker_list_approved_reviews(integer)','EXECUTE')
     or not has_function_privilege('service_role','public.archive_worker_list_approved_reviews(integer)','EXECUTE')
     or has_function_privilege('authenticated','public.archive_worker_record_review_consumption(uuid,timestamptz,text,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.archive_worker_record_review_consumption(uuid,timestamptz,text,jsonb)','EXECUTE') then
    raise exception 'ARCHIVE_REVIEW_CONSUMER_RPC_GRANTS_INVALID';
  end if;

  select profile.id into actor_id
  from public.profiles profile
  join public.profile_roles membership
    on membership.profile_id=profile.id and membership.revoked_at is null
  join public.roles role
    on role.id=membership.role_id and role.code='super_admin' and role.active
  join public.role_capability_grants grant_row
    on grant_row.role_id=role.id and grant_row.capability_code='survival_archive.review'
  where profile.account_status='active'
  limit 1;
  if actor_id is null then
    raise exception 'ARCHIVE_REVIEW_ACTIVE_OPERATOR_REQUIRED_FOR_TEST';
  end if;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  execute 'set local role service_role';
  enqueue_result := public.archive_worker_enqueue_review_item(
    idempotency,
    'C_KNOWLEDGE',
    'KNOWLEDGE',
    null,
    'P1',
    'Synthetic approved-review consumer fixture',
    'Rollback-only hardening verification.',
    'HIGH',
    'test://archive-v2-mvp/hardening-e2e',
    jsonb_build_object(
      'brief_id','K-104',
      'head_sha',head_sha,
      'pr_number',321,
      'head_ref','knowledge/worker/test-hardening',
      'test_only',true
    )
  );
  item_id := (enqueue_result->>'id')::uuid;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor_id)::text,true);
  execute 'set local role authenticated';
  perform public.archive_operator_decide_review_item(item_id,'APPROVED','rollback-only hardening verification');
  inbox_result := public.archive_operator_review_inbox();
  if exists (
    select 1 from jsonb_array_elements(inbox_result->'items') item
    where item->>'id'=item_id::text
  ) then
    raise exception 'ARCHIVE_REVIEW_DECIDED_ITEM_STILL_IN_PENDING_INBOX';
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  execute 'set local role service_role';
  select value into approved
  from public.archive_worker_list_approved_reviews(1) value
  where value->>'id'=item_id::text;
  if approved is null
     or approved->>'decision' is distinct from 'APPROVED'
     or approved#>>'{payload,brief_id}' is distinct from 'K-104' then
    raise exception 'ARCHIVE_REVIEW_APPROVED_ITEM_NOT_LISTED';
  end if;

  receipt := public.archive_worker_record_review_consumption(
    item_id,
    (select decided_at from survival_ops.archive_review_items where id=item_id),
    'CONSUMED',
    jsonb_build_object('test_only',true,'merge_sha',repeat('c',40))
  );
  if receipt->>'outcome' is distinct from 'CONSUMED' then
    raise exception 'ARCHIVE_REVIEW_CONSUMPTION_RECEIPT_NOT_RECORDED';
  end if;
  if exists (
    select 1 from public.archive_worker_list_approved_reviews(1) value
    where value->>'id'=item_id::text
  ) then
    raise exception 'ARCHIVE_REVIEW_CONSUMED_ITEM_LISTED_AGAIN';
  end if;
  execute 'reset role';
end;
$$;
rollback;
