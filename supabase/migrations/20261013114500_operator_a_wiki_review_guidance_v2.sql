-- Explain genuine A-Wiki HUMAN_REVIEW holds in the authenticated operator dashboard.
-- The worker schedule is a separate ChatGPT task; do not infer ON/OFF from DB job status.
-- The existing operator authentication guard and existing job state transitions remain intact.

begin;

create or replace function public.archive_operator_a_wiki_status()
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  total_count bigint;
  active_count bigint;
  human_review_count bigint;
  published_count bigint;
  latest_job jsonb;
begin
  perform survival_ops.private_require_archive_operator();

  select count(*) filter (where j.status <> 'SUPERSEDED'),
    count(*) filter (where j.status not in ('PUBLISHED','HUMAN_REVIEW','REJECT','SUPERSEDED')),
    count(*) filter (where j.status='HUMAN_REVIEW'),
    count(*) filter (where j.status='PUBLISHED')
  into total_count, active_count, human_review_count, published_count
  from survival_ops.a_wiki_native_jobs j;

  select pg_catalog.jsonb_build_object(
    'job_id',j.job_id, 'status',j.status, 'session_id',j.session_id,
    'season_id',j.prepared_job->>'season_id', 'source_ref',j.source_ref,
    'blocker_code',j.blocker_code,
    'review_decision',case when j.status in ('HUMAN_REVIEW','REJECT','PUBLISHED')
      then j.review_result->>'decision' else null end,
    'review_note',case when j.status in ('HUMAN_REVIEW','REJECT')
      then pg_catalog.left(j.review_result->>'note',2000) else null end,
    'final_pr_number',j.final_pr_number, 'merge_sha',j.merge_sha,
    'completion_origin',case when j.status='PUBLISHED'
      then coalesce(j.completion_origin,'NATIVE_REVIEWED_MERGE') else null end,
    'supersedes_job_id',j.supersedes_job_id,
    'dispatch_count',j.dispatch_count, 'dispatch_at',j.dispatch_at,
    'created_at',j.created_at, 'updated_at',j.updated_at,
    'extractor_submitted_at',j.extractor_submitted_at,
    'review_ready_at',j.review_ready_at, 'review_submitted_at',j.review_submitted_at,
    'finalizing_at',j.finalizing_at, 'published_at',j.published_at,
    'age_minutes',greatest(0,pg_catalog.floor(
      extract(epoch from (
        pg_catalog.clock_timestamp()-coalesce(j.published_at,j.finalizing_at,
        j.review_submitted_at,j.review_ready_at,j.extractor_submitted_at,
        j.updated_at,j.created_at)))/60))
  ) into latest_job
  from survival_ops.a_wiki_native_jobs j
  where j.status <> 'SUPERSEDED'
  order by j.created_at desc,j.job_id desc
  limit 1;

  return pg_catalog.jsonb_build_object(
    'job_count',total_count, 'active_count',active_count,
    'human_review_count',human_review_count,
    'published_count',published_count,'latest_job',latest_job
  );
end;
$function$;

revoke all on function public.archive_operator_a_wiki_status() from public, anon;
grant execute on function public.archive_operator_a_wiki_status() to authenticated;

commit;
