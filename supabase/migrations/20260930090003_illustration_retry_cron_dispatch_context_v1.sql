-- Admit the existing postgres-owned Prep dispatcher to stale recovery without
-- exposing Vault or the sensitive GitHub dispatcher to API roles.
create or replace function public.archive_illustration_finalizer_dispatch_guarded(p_job_id text)
returns bigint language plpgsql volatile security definer
set search_path=pg_catalog,survival_ops,archive_ops as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_request bigint;
  v_role text:=current_setting('request.jwt.claim.role',true);
  v_database_role text:=current_setting('role',true);
  v_db_context text:=current_setting('archive.illustration_dispatch_context',true);
begin
  -- HTTP callers must arrive under both the service_role JWT and PostgreSQL
  -- role. The cron route uses a private transaction marker issued only by the
  -- postgres-owned dispatcher helper.
  if not (v_role='service_role' and v_database_role='service_role')
     and not (session_user='postgres' and v_db_context='pg_cron_prep_dispatch') then
    raise exception 'ILLUSTRATION_FINALIZER_DISPATCH_FORBIDDEN' using errcode='42501';
  end if;
  select * into v_job from survival_ops.illustration_render_jobs where job_id=p_job_id for update;
  if not found or v_job.status not in ('FINALIZE_QUEUED','FINALIZING','REVIEW_PASS_STAGED')
     or v_job.lease_token is null or v_job.lease_until>clock_timestamp()
     or v_job.finalizer_failure_count>=5 then
    raise exception 'ILLUSTRATION_FINALIZER_DISPATCH_NOT_ELIGIBLE' using errcode='22023';
  end if;
  v_request:=archive_ops.dispatch_afterfall_illustration_finalize(p_job_id);
  return v_request;
end $$;

revoke all on function public.archive_illustration_finalizer_dispatch_guarded(text) from public,anon,authenticated;
grant execute on function public.archive_illustration_finalizer_dispatch_guarded(text) to service_role;

-- This postgres-only helper is the sole issuer of the database-dispatch marker.
create or replace function archive_ops.dispatch_afterfall_illustration_sweep()
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,archive_ops as $$
declare v_previous text; v_result jsonb;
begin
  if session_user is distinct from 'postgres' then
    raise exception 'ILLUSTRATION_CRON_SWEEP_FORBIDDEN' using errcode='42501';
  end if;
  v_previous:=current_setting('archive.illustration_dispatch_context',true);
  perform set_config('archive.illustration_dispatch_context','pg_cron_prep_dispatch',true);
  v_result:=public.archive_illustration_render_jobs_sweep_stale();
  perform set_config('archive.illustration_dispatch_context',coalesce(v_previous,''),true);
  return v_result;
end $$;

revoke all on function archive_ops.dispatch_afterfall_illustration_sweep() from public,anon,authenticated,service_role;
grant execute on function archive_ops.dispatch_afterfall_illustration_sweep() to postgres;

-- Keep the scheduled entrypoint intact; only route its stale sweep through the
-- narrowly authorized postgres helper before it reads Vault or dispatches Prep.
create or replace function archive_ops.dispatch_afterfall_illustration_prep()
returns bigint language plpgsql security definer set search_path=pg_catalog,vault,net,archive_ops as $$
declare github_token text; request_id bigint;
begin
  perform archive_ops.dispatch_afterfall_illustration_sweep();
  select decrypted_secret into github_token from vault.decrypted_secrets
    where name='archive_github_dispatch_token' order by created_at desc limit 1;
  if github_token is null or length(btrim(github_token))<20 then
    raise exception 'ARCHIVE_GITHUB_DISPATCH_TOKEN_MISSING';
  end if;
  select net.http_post(
    url:='https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/archive-illustration-prep.yml/dispatches',
    body:=jsonb_build_object('ref','main'),
    headers:=jsonb_build_object('Accept','application/vnd.github+json','Authorization','Bearer '||github_token,
      'X-GitHub-Api-Version','2022-11-28','Content-Type','application/json','User-Agent','supabase-afterfall-illustration-prep'),
    timeout_milliseconds:=10000
  ) into request_id;
  return request_id;
end $$;

revoke all on function archive_ops.dispatch_afterfall_illustration_prep() from public,anon,authenticated,service_role;
grant execute on function archive_ops.dispatch_afterfall_illustration_prep() to postgres;
