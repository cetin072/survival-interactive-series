-- Rollback-only staging verification. All queue rows and decisions are discarded.
begin;
do $$
declare
  actor_id uuid;
  ordinary_id uuid;
  first_result jsonb;
  retry_result jsonb;
  inbox_result jsonb;
  detail_result jsonb;
  item_id uuid;
  head_sha text := repeat('a', 40);
  idempotency text := 'TEST:archive-v2-mvp:C-KNOWLEDGE:' || head_sha;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='survival_ops' and c.relname='archive_review_items' and c.relrowsecurity) then
    raise exception 'ARCHIVE_REVIEW_RLS_MISSING';
  end if;
  if has_table_privilege('anon','survival_ops.archive_review_items','SELECT')
     or has_table_privilege('authenticated','survival_ops.archive_review_items','SELECT')
     or has_table_privilege('service_role','survival_ops.archive_review_items','SELECT') then
    raise exception 'ARCHIVE_REVIEW_DIRECT_TABLE_ACCESS_PRESENT';
  end if;
  if has_function_privilege('anon','public.archive_operator_review_inbox()','EXECUTE')
     or not has_function_privilege('authenticated','public.archive_operator_review_inbox()','EXECUTE')
     or has_function_privilege('authenticated','public.archive_worker_enqueue_review_item(text,text,text,text,text,text,text,text,text,jsonb)','EXECUTE') then
    raise exception 'ARCHIVE_REVIEW_RPC_GRANTS_INVALID';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('archive_operator_review_inbox','archive_operator_review_item_detail','archive_operator_decide_review_item','archive_worker_enqueue_review_item')
      and p.prosecdef is false
  ) then raise exception 'ARCHIVE_REVIEW_RPC_NOT_SECURITY_DEFINER'; end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('archive_operator_review_inbox','archive_operator_review_item_detail','archive_operator_decide_review_item','archive_worker_enqueue_review_item')
      and not ('search_path=""' = any(coalesce(p.proconfig,'{}'::text[])))
  ) then raise exception 'ARCHIVE_REVIEW_RPC_SEARCH_PATH_UNSAFE'; end if;

  select profile.id into actor_id
  from public.profiles profile
  join public.profile_roles membership on membership.profile_id=profile.id and membership.revoked_at is null
  join public.roles role on role.id=membership.role_id and role.code='super_admin' and role.active
  join public.role_capability_grants grant_row on grant_row.role_id=role.id and grant_row.capability_code='survival_archive.review'
  where profile.account_status='active'
  limit 1;
  if actor_id is null then raise exception 'ARCHIVE_REVIEW_ACTIVE_SUPER_ADMIN_PROFILE_REQUIRED_FOR_TEST'; end if;
  select profile.id into ordinary_id
  from public.profiles profile
  where profile.account_status='active' and profile.id<>actor_id
    and not exists (
      select 1 from public.profile_roles membership
      join public.role_capability_grants grant_row on grant_row.role_id=membership.role_id and grant_row.capability_code='survival_archive.review'
      where membership.profile_id=profile.id and membership.revoked_at is null
    )
  limit 1;
  if ordinary_id is null then raise exception 'ARCHIVE_REVIEW_ORDINARY_PROFILE_REQUIRED_FOR_TEST'; end if;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  execute 'set local role service_role';
  first_result := public.archive_worker_enqueue_review_item(
    idempotency,'C_KNOWLEDGE','KNOWLEDGE',null,'P1','Synthetic C Review E2E','Test-only fixture. Transaction rollback removes this queue item.','HIGH',
    'test://archive-v2-mvp/c03-e2e',jsonb_build_object('brief_id','K-TEST-000','head_sha',head_sha,'test_only',true,'reason_codes',jsonb_build_array('SYNTHETIC_E2E'))
  );
  retry_result := public.archive_worker_enqueue_review_item(
    idempotency,'C_KNOWLEDGE','KNOWLEDGE',null,'P1','Synthetic C Review E2E','Test-only fixture. Transaction rollback removes this queue item.','HIGH',
    'test://archive-v2-mvp/c03-e2e',jsonb_build_object('brief_id','K-TEST-000','head_sha',head_sha,'test_only',true,'reason_codes',jsonb_build_array('SYNTHETIC_E2E'))
  );
  if first_result->>'id' is distinct from retry_result->>'id' or first_result->>'created' is distinct from 'true' or retry_result->>'created' is distinct from 'false' then
    raise exception 'ARCHIVE_REVIEW_IDEMPOTENCY_FAILED';
  end if;
  item_id := (first_result->>'id')::uuid;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor_id)::text,true);
  execute 'set local role authenticated';
  inbox_result := public.archive_operator_review_inbox();
  if not exists (select 1 from jsonb_array_elements(inbox_result->'items') item where item->>'id'=item_id::text) then
    raise exception 'ARCHIVE_REVIEW_OPERATOR_INBOX_MISSING_FIXTURE';
  end if;
  detail_result := public.archive_operator_review_item_detail(item_id);
  if detail_result->>'status' is distinct from 'PENDING' or detail_result#>>'{payload,test_only}' is distinct from 'true' then
    raise exception 'ARCHIVE_REVIEW_DETAIL_INVALID';
  end if;
  detail_result := public.archive_operator_decide_review_item(item_id,'APPROVED','rollback-only verification');
  if detail_result->>'status' is distinct from 'APPROVED' or jsonb_array_length(detail_result->'decision_history')<>1 then
    raise exception 'ARCHIVE_REVIEW_APPROVAL_NOT_RECORDED';
  end if;
  begin
    perform public.archive_operator_decide_review_item(item_id,'HOLD','second decision must fail');
    raise exception 'ARCHIVE_REVIEW_SECOND_DECISION_WAS_ACCEPTED';
  exception when sqlstate '40001' then null;
  end;

  perform set_config('request.jwt.claim.sub',ordinary_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',ordinary_id)::text,true);
  begin
    perform public.archive_operator_review_inbox();
    raise exception 'ARCHIVE_REVIEW_ORDINARY_USER_WAS_ACCEPTED';
  exception when sqlstate '42501' then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  begin
    perform public.archive_operator_review_inbox();
    raise exception 'ARCHIVE_REVIEW_ANON_WAS_ACCEPTED';
  exception when sqlstate '42501' then null;
  end;
  execute 'reset role';
end;
$$;
rollback;
