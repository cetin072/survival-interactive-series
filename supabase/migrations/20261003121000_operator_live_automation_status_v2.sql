-- Operator dashboard live status v2.
-- Keep login/manual refresh behavior unchanged; only replace stale A/B data sources.

create or replace function public.archive_operator_system_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;

  archive_dispatch_count bigint;
  archive_latest_dispatch jsonb;
  archive_cron jsonb;

  visual_job_count bigint;
  visual_today_job_count bigint;
  visual_today_success_count bigint;
  visual_active_count bigint;
  visual_latest_job jsonb;
  visual_prep_cron jsonb;
  visual_retry_cron jsonb;

  review_pending bigint;
  review_errors bigint;

  knowledge_latest jsonb;
  knowledge_prep jsonb;
  knowledge_active_count bigint;
begin
  actor_id := survival_ops.private_require_archive_operator();

  -- A · Archive: authoritative external-dispatch cron + durable dispatch request.
  select count(*)
    into archive_dispatch_count
  from archive_ops.github_dispatch_requests r
  where r.workflow_file = 'archive-daily.yml';

  select pg_catalog.jsonb_build_object(
    'id', r.id,
    'requested_at', r.requested_at,
    'workflow_file', r.workflow_file,
    'git_ref', r.git_ref,
    'request_id', r.request_id,
    'origin', r.origin
  )
    into archive_latest_dispatch
  from archive_ops.github_dispatch_requests r
  where r.workflow_file = 'archive-daily.yml'
  order by r.requested_at desc
  limit 1;

  select pg_catalog.jsonb_build_object(
    'jobname', j.jobname,
    'schedule', j.schedule,
    'active', j.active,
    'last_status', d.status,
    'last_start_at', d.start_time,
    'last_end_at', d.end_time,
    'last_message', d.return_message
  )
    into archive_cron
  from cron.job j
  left join lateral (
    select rd.status, rd.start_time, rd.end_time, rd.return_message
    from cron.job_run_details rd
    where rd.jobid = j.jobid
    order by rd.start_time desc
    limit 1
  ) d on true
  where j.jobname = 'afterfall-archive-external-dispatch'
  limit 1;

  -- B · Visual: current render/review/finalizer job ledger, not retired worker runs.
  select count(*)
    into visual_job_count
  from survival_ops.illustration_render_jobs j;

  select count(*)
    into visual_today_job_count
  from survival_ops.illustration_render_jobs j
  where j.date_kst = (pg_catalog.clock_timestamp() at time zone 'Asia/Seoul')::date;

  select count(*)
    into visual_today_success_count
  from survival_ops.illustration_render_jobs j
  where j.date_kst = (pg_catalog.clock_timestamp() at time zone 'Asia/Seoul')::date
    and j.status = 'SUCCEEDED';

  select count(*)
    into visual_active_count
  from survival_ops.illustration_render_jobs j
  where j.status in (
    'PREPARED','INGESTING','READY_FOR_REVIEW','HUMAN_REVIEW',
    'REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING'
  );

  select pg_catalog.jsonb_build_object(
    'job_id', j.job_id,
    'date_kst', j.date_kst,
    'status', j.status,
    'attempt_no', j.attempt_no,
    'subject_id', j.subject_id,
    'title', j.title,
    'review_decision', j.review_decision,
    'review_summary', j.review_summary,
    'blocker_code', j.blocker_code,
    'blocker_stage', j.blocker_stage,
    'last_error_code', j.last_error_code,
    'last_error_stage', j.last_error_stage,
    'created_at', j.created_at,
    'updated_at', j.updated_at,
    'reviewed_at', j.reviewed_at,
    'finalized_at', j.finalized_at
  )
    into visual_latest_job
  from survival_ops.illustration_render_jobs j
  order by j.created_at desc
  limit 1;

  select pg_catalog.jsonb_build_object(
    'jobname', j.jobname,
    'schedule', j.schedule,
    'active', j.active,
    'last_status', d.status,
    'last_start_at', d.start_time,
    'last_end_at', d.end_time
  )
    into visual_prep_cron
  from cron.job j
  left join lateral (
    select rd.status, rd.start_time, rd.end_time
    from cron.job_run_details rd
    where rd.jobid = j.jobid
    order by rd.start_time desc
    limit 1
  ) d on true
  where j.jobname = 'afterfall-illustration-prep-dispatch'
  limit 1;

  select pg_catalog.jsonb_build_object(
    'jobname', j.jobname,
    'schedule', j.schedule,
    'active', j.active,
    'last_status', d.status,
    'last_start_at', d.start_time,
    'last_end_at', d.end_time
  )
    into visual_retry_cron
  from cron.job j
  left join lateral (
    select rd.status, rd.start_time, rd.end_time
    from cron.job_run_details rd
    where rd.jobid = j.jobid
    order by rd.start_time desc
    limit 1
  ) d on true
  where j.jobname = 'afterfall-illustration-retry-prep-dispatch'
  limit 1;

  -- Shared review inbox.
  select
    count(*) filter (where item.status='PENDING'),
    count(*) filter (where item.status='PENDING' and item.item_type='AUTOMATION_ERROR')
    into review_pending, review_errors
  from survival_ops.archive_review_items item;

  -- C · Semantic: keep the current live semantic job/prep source.
  select pg_catalog.jsonb_build_object(
    'job_id',j.job_id,
    'job_type',j.job_type,
    'status',j.status,
    'source_kind',j.source_kind,
    'source_ref',j.source_ref,
    'prepared_at',j.prepared_at,
    'submitted_at',j.submitted_at,
    'age_minutes',greatest(0,floor(extract(epoch from
      (pg_catalog.clock_timestamp()-coalesce(j.updated_at,j.submitted_at,j.prepared_at)))/60)),
    'stalled_code',case
      when j.status='PREPARED' and pg_catalog.clock_timestamp()-j.prepared_at > interval '12 hours' then 'SEMANTIC_WORKER_NOT_CONSUMED'
      when j.status in ('SUBMITTED','FINALIZING') and pg_catalog.clock_timestamp()-coalesce(j.finalizing_at,j.submitted_at,j.updated_at) > interval '15 minutes' then 'FINALIZER_STALLED'
      when j.status in ('PR_OPEN','HUMAN_REVIEW') and pg_catalog.clock_timestamp()-j.updated_at > interval '6 hours' then 'KNOWLEDGE_PR_STALLED'
      else null end,
    'result_decision',j.result_decision,
    'final_pr_number',j.final_pr_number,
    'final_head_sha',j.final_head_sha,
    'merge_sha',j.merge_sha,
    'blocker_code',j.blocker_code,
    'blocker_stage',j.blocker_stage,
    'finalizer_attempt_count',j.finalizer_attempt_count
  )
    into knowledge_latest
  from survival_ops.knowledge_semantic_jobs j
  order by j.prepared_at desc
  limit 1;

  select count(*)
    into knowledge_active_count
  from survival_ops.knowledge_semantic_jobs j
  where j.status not in ('PUBLISHED','HOLD','BLOCKED');

  select pg_catalog.jsonb_build_object(
    'last_status',r.last_status,
    'last_stage',r.last_stage,
    'blocker_code',r.blocker_code,
    'source_ref',r.source_ref,
    'source_sha256',r.source_sha256,
    'main_sha',r.main_sha,
    'backfill_last_attempted_at',r.backfill_last_attempted_at,
    'checked_at',r.checked_at
  )
    into knowledge_prep
  from survival_ops.knowledge_semantic_prep_runs r
  where r.singleton;

  return pg_catalog.jsonb_build_object(
    'archive', pg_catalog.jsonb_build_object(
      'dispatch_count', archive_dispatch_count,
      'latest_dispatch', archive_latest_dispatch,
      'cron', archive_cron,

      -- Backward-compatible fields for older deployed Operator UI.
      'daily_run_count', archive_dispatch_count,
      'task_count', 0,
      'latest_daily_run', case when archive_cron is null then null else pg_catalog.jsonb_build_object(
        'status', archive_cron->>'last_status',
        'started_at', archive_cron->>'last_start_at',
        'finished_at', archive_cron->>'last_end_at',
        'last_error_code', null
      ) end,
      'latest_task', null
    ),
    'visual', pg_catalog.jsonb_build_object(
      'job_count', visual_job_count,
      'today_job_count', visual_today_job_count,
      'today_success_count', visual_today_success_count,
      'active_count', visual_active_count,
      'latest_job', visual_latest_job,
      'prep_cron', visual_prep_cron,
      'retry_cron', visual_retry_cron,

      -- Backward-compatible fields for older deployed Operator UI.
      'run_count', visual_job_count,
      'latest_run', case when visual_latest_job is null then null else pg_catalog.jsonb_build_object(
        'run_id', visual_latest_job->>'job_id',
        'started_at', visual_latest_job->>'created_at',
        'finished_at', coalesce(
          visual_latest_job->>'finalized_at',
          visual_latest_job->>'reviewed_at',
          visual_latest_job->>'updated_at'
        ),
        'final_status', visual_latest_job->>'status',
        'blocker_code', visual_latest_job->>'blocker_code',
        'blocker_stage', visual_latest_job->>'blocker_stage',
        'target_subject_id', visual_latest_job->>'subject_id',
        'accepted_count', case when visual_latest_job->>'status'='SUCCEEDED' then 1 else 0 end,
        'registry_status', null,
        'cleanup_status', null,
        'main_sha', null
      ) end
    ),
    'review', pg_catalog.jsonb_build_object(
      'pending_count', review_pending,
      'automation_error_count', review_errors
    ),
    'knowledge_semantic', pg_catalog.jsonb_build_object(
      'active_count', knowledge_active_count,
      'latest_job', knowledge_latest,
      'prep', knowledge_prep
    )
  );
end;
$$;

revoke all on function public.archive_operator_system_status() from public, anon;
grant execute on function public.archive_operator_system_status() to authenticated;
