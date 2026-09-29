-- External scheduler bridge for AFTERFALL Archive A.
-- Supabase Cron will be the primary reliable trigger; GitHub native schedule remains a secondary fallback.
-- The cron job is intentionally created INACTIVE until a dedicated GitHub token is stored in Vault
-- and one manual dispatch test succeeds.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create schema if not exists archive_ops;
revoke all on schema archive_ops from public;
revoke all on schema archive_ops from anon;
revoke all on schema archive_ops from authenticated;
revoke all on schema archive_ops from service_role;
grant usage on schema archive_ops to postgres;

create table if not exists archive_ops.github_dispatch_requests (
  id bigint generated always as identity primary key,
  requested_at timestamptz not null default now(),
  target_repo text not null default 'cetin072/survival-interactive-series',
  workflow_file text not null default 'archive-daily.yml',
  git_ref text not null default 'main',
  request_id bigint not null,
  origin text not null default 'supabase_cron'
);

revoke all on archive_ops.github_dispatch_requests from public;
revoke all on archive_ops.github_dispatch_requests from anon;
revoke all on archive_ops.github_dispatch_requests from authenticated;
revoke all on archive_ops.github_dispatch_requests from service_role;
grant select, insert on archive_ops.github_dispatch_requests to postgres;

create or replace function archive_ops.dispatch_afterfall_archive(
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
    url := 'https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/archive-daily.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object(
      'Accept', 'application/vnd.github+json',
      'Authorization', 'Bearer ' || github_token,
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type', 'application/json',
      'User-Agent', 'supabase-afterfall-archive-dispatch'
    ),
    timeout_milliseconds := 10000
  )
  into request_id;

  insert into archive_ops.github_dispatch_requests (
    request_id,
    origin
  )
  values (
    request_id,
    coalesce(nullif(dispatch_origin, ''), 'supabase_cron')
  );

  return request_id;
end;
$$;

revoke all on function archive_ops.dispatch_afterfall_archive(text) from public;
revoke all on function archive_ops.dispatch_afterfall_archive(text) from anon;
revoke all on function archive_ops.dispatch_afterfall_archive(text) from authenticated;
revoke all on function archive_ops.dispatch_afterfall_archive(text) from service_role;
grant execute on function archive_ops.dispatch_afterfall_archive(text) to postgres;

-- 19:37 UTC = 04:37 KST on the following day.
select cron.schedule(
  'afterfall-archive-external-dispatch',
  '37 19 * * *',
  $$select archive_ops.dispatch_afterfall_archive('supabase_cron');$$
);

-- Fail closed until the GitHub token is provisioned and a manual dispatch test is verified.
select cron.alter_job(
  job_id := (
    select jobid
    from cron.job
    where jobname = 'afterfall-archive-external-dispatch'
  ),
  active := false
);
