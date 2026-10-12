-- Harden Automation B internal survival_ops tables without changing the runtime API.
-- Direct browser roles already have no survival_ops schema/table grants; RLS is
-- defense in depth and clears the Supabase Advisor critical warning.
-- Automation B continues through service_role RPCs / postgres-owned program paths.

alter table survival_ops.illustration_review_staging_chunks enable row level security;
alter table survival_ops.illustration_worker_runs enable row level security;
alter table survival_ops.illustration_binary_staging_chunks enable row level security;
alter table survival_ops.illustration_vault_items enable row level security;
alter table survival_ops.illustration_render_jobs enable row level security;
alter table survival_ops.knowledge_ex001_review_revalidations enable row level security;
alter table survival_ops.illustration_review_staging enable row level security;
alter table survival_ops.illustration_binary_staging enable row level security;

-- These mutation RPCs are Automation B service-role internals.
revoke all on function public.archive_illustration_review_decide_v3(jsonb)
  from public, anon, authenticated;
grant execute on function public.archive_illustration_review_decide_v3(jsonb)
  to service_role;

revoke all on function public.archive_illustration_site_staging_begin(jsonb)
  from public, anon, authenticated;
grant execute on function public.archive_illustration_site_staging_begin(jsonb)
  to service_role;

revoke all on function public.archive_illustration_site_staging_finalize(text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.archive_illustration_site_staging_finalize(text,uuid,text)
  to service_role;

-- Vault dispatch lives in an internal schema and is postgres/program owned.
revoke all on function archive_ops.dispatch_afterfall_illustration_vault(text)
  from public, anon, authenticated, service_role;
grant execute on function archive_ops.dispatch_afterfall_illustration_vault(text)
  to postgres;

revoke all on function archive_ops.dispatch_afterfall_illustration_vault_pending()
  from public, anon, authenticated, service_role;
grant execute on function archive_ops.dispatch_afterfall_illustration_vault_pending()
  to postgres;

notify pgrst,'reload schema';
