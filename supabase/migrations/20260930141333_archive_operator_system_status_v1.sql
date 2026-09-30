create or replace function public.archive_operator_system_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  archive_daily_count bigint;
  archive_task_count bigint;
  archive_latest_daily jsonb;
  archive_latest_task jsonb;
  visual_run_count bigint;
  visual_latest jsonb;
  review_pending bigint;
  review_errors bigint;
begin
  actor_id := survival_ops.private_require_archive_operator();

  select count(*) into archive_daily_count
  from survival_rpg.archive_publication_daily_runs;

  select count(*) into archive_task_count
  from survival_rpg.archive_publication_tasks;

  select jsonb_build_object(
    'scheduled_date', run.scheduled_date,
    'status', run.status,
    'attempt_count', run.attempt_count,
    'last_error_code', run.last_error_code,
    'started_at', run.started_at,
    'finished_at', run.finished_at
  )
  into archive_latest_daily
  from survival_rpg.archive_publication_daily_runs run
  order by coalesce(run.finished_at, run.started_at, run.created_at) desc
  limit 1;

  select jsonb_build_object(
    'task_id', task.task_id,
    'task_kind', task.task_kind,
    'chronicle_id', task.chronicle_id,
    'season_id', task.season_id,
    'status', task.status,
    'attempt_count', task.attempt_count,
    'last_error_code', task.last_error_code,
    'updated_at', task.updated_at,
    'completed_at', task.completed_at
  )
  into archive_latest_task
  from survival_rpg.archive_publication_tasks task
  order by coalesce(task.completed_at, task.updated_at, task.created_at) desc
  limit 1;

  select count(*) into visual_run_count
  from survival_ops.illustration_worker_runs;

  select jsonb_build_object(
    'run_id', run.run_id,
    'started_at', run.started_at,
    'finished_at', run.finished_at,
    'final_status', run.final_status,
    'blocker_code', run.blocker_code,
    'blocker_stage', run.blocker_stage,
    'target_subject_id', run.target_subject_id,
    'accepted_count', run.accepted_count,
    'registry_status', run.registry_status,
    'cleanup_status', run.cleanup_status,
    'main_sha', run.main_sha
  )
  into visual_latest
  from survival_ops.illustration_worker_runs run
  order by coalesce(run.finished_at, run.started_at, run.created_at) desc
  limit 1;

  select
    count(*) filter (where item.status='PENDING'),
    count(*) filter (where item.status='PENDING' and item.item_type='AUTOMATION_ERROR')
  into review_pending, review_errors
  from survival_ops.archive_review_items item;

  return jsonb_build_object(
    'archive', jsonb_build_object(
      'daily_run_count', archive_daily_count,
      'task_count', archive_task_count,
      'latest_daily_run', archive_latest_daily,
      'latest_task', archive_latest_task
    ),
    'visual', jsonb_build_object(
      'run_count', visual_run_count,
      'latest_run', visual_latest
    ),
    'review', jsonb_build_object(
      'pending_count', review_pending,
      'automation_error_count', review_errors
    )
  );
end;
$$;

revoke all on function public.archive_operator_system_status() from public, anon;
grant execute on function public.archive_operator_system_status() to authenticated;
