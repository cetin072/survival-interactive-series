-- Operator A-Wiki status readback.
-- Adds one operator-only RPC so the dashboard can show the durable A-Wiki native job ledger.

begin;

create or replace function public.archive_operator_a_wiki_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  total_count bigint;
  active_count bigint;
  published_count bigint;
  latest_job jsonb;
begin
  actor_id := survival_ops.private_require_archive_operator();

  select
    count(*),
    count(*) filter (where j.status not in ('PUBLISHED','HUMAN_REVIEW','REJECT')),
    count(*) filter (where j.status = 'PUBLISHED')
  into total_count, active_count, published_count
  from survival_ops.a_wiki_native_jobs j;

  select pg_catalog.jsonb_build_object(
    'job_id', j.job_id,
    'status', j.status,
    'session_id', j.session_id,
    'source_ref', j.source_ref,
    'blocker_code', j.blocker_code,
    'final_pr_number', j.final_pr_number,
    'merge_sha', j.merge_sha,
    'dispatch_count', j.dispatch_count,
    'dispatch_at', j.dispatch_at,
    'created_at', j.created_at,
    'updated_at', j.updated_at,
    'extractor_submitted_at', j.extractor_submitted_at,
    'review_ready_at', j.review_ready_at,
    'review_submitted_at', j.review_submitted_at,
    'finalizing_at', j.finalizing_at,
    'published_at', j.published_at,
    'age_minutes', greatest(
      0,
      floor(extract(epoch from (
        pg_catalog.clock_timestamp() - coalesce(
          j.published_at,
          j.finalizing_at,
          j.review_submitted_at,
          j.review_ready_at,
          j.extractor_submitted_at,
          j.updated_at,
          j.created_at
        )
      )) / 60)
    )
  )
  into latest_job
  from survival_ops.a_wiki_native_jobs j
  order by j.created_at desc, j.job_id desc
  limit 1;

  return pg_catalog.jsonb_build_object(
    'job_count', total_count,
    'active_count', active_count,
    'published_count', published_count,
    'latest_job', latest_job
  );
end;
$$;

revoke all on function public.archive_operator_a_wiki_status() from public, anon;
grant execute on function public.archive_operator_a_wiki_status() to authenticated;

commit;
