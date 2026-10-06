-- Isolated PostgreSQL CI database only. No production data or credentials.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create extension pgcrypto with schema extensions;
create schema survival_ops;

-- The production operator gate is installed by the existing review migrations.
-- Keep this focused recovery test independent of unrelated B/C schemas.
create function survival_ops.private_require_archive_operator()
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claims',true),'{}')::jsonb->>'sub'
    is distinct from '00000000-0000-0000-0000-000000000001' then
    raise exception 'ARCHIVE_OPERATOR_REQUIRED';
  end if;
  return '00000000-0000-0000-0000-000000000001'::uuid;
end;
$$;
revoke all on function survival_ops.private_require_archive_operator() from public,anon,authenticated,service_role;

-- Distinct sentinels demonstrate that the wrapper preserves every existing key
-- and value, including the newest B/C fields it knows nothing about.
create function public.archive_operator_system_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform survival_ops.private_require_archive_operator();
  return '{"archive":{"dispatch_count":7},"visual":{"provider_completed_at":"2026-10-05T00:00:00Z","ingest_failure_count":2},"review":{"pending_count":3},"knowledge_semantic":{"finalizer_attempt_count":4}}'::jsonb;
end;
$$;
revoke all on function public.archive_operator_system_status() from public,anon;
grant execute on function public.archive_operator_system_status() to authenticated;
