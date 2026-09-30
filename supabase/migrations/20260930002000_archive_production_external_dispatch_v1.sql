-- Reliable external scheduler for the batched Archive Production release gate.
-- GitHub native schedule remains as a secondary signal; Supabase Cron is primary.

create or replace function archive_ops.dispatch_afterfall_production_release(
  dispatch_origin text default 'supabase_cron'
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, vault, net, archive_ops
as $$
declare
  github_token text;
  request_id bigint;
begin
  select decrypted_secret
    into github_token
  from vault.decrypted_secrets
  where name = 'archive_github_dispatch_token'
  order by created_at desc
  limit 1;

  if github_token is null or length(btrim(github_token)) < 20 then
    raise exception 'ARCHIVE_GITHUB_DISPATCH_TOKEN_MISSING';
  end if;

  select net.http_post(
    url := 'https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/archive-production-release.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object(
      'Accept', 'application/vnd.github+json',
      'Authorization', 'Bearer ' || github_token,
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type', 'application/json',
      'User-Agent', 'supabase-afterfall-production-dispatch'
    ),
    timeout_milliseconds := 10000
  )
  into request_id;

  insert into archive_ops.github_dispatch_requests (
    workflow_file,
    request_id,
    origin
  )
  values (
    'archive-production-release.yml',
    request_id,
    coalesce(nullif(dispatch_origin, ''), 'supabase_cron')
  );

  return request_id;
end;
$$;

revoke all on function archive_ops.dispatch_afterfall_production_release(text) from public;
revoke all on function archive_ops.dispatch_afterfall_production_release(text) from anon;
revoke all on function archive_ops.dispatch_afterfall_production_release(text) from authenticated;
revoke all on function archive_ops.dispatch_afterfall_production_release(text) from service_role;
grant execute on function archive_ops.dispatch_afterfall_production_release(text) to postgres;

-- 14:37 UTC = 23:37 KST.
-- The workflow itself enforces the two-day Production interval and daily deploy cap.
select cron.schedule(
  'afterfall-archive-production-external-dispatch',
  '37 14 * * *',
  $$select archive_ops.dispatch_afterfall_production_release('supabase_cron');$$
);
