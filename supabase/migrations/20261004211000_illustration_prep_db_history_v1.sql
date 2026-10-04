-- Automation B: expose minimal durable render-attempt history to Program Prep.
-- Used only to rank fresh character candidates ahead of retries.

create or replace function public.archive_illustration_render_attempt_history()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'point_id', j.point_id,
        'generation_key', j.generation_key,
        'subject_id', j.subject_id,
        'attempt_no', j.attempt_no,
        'status', j.status,
        'review_decision', j.review_decision,
        'date_kst', j.date_kst,
        'created_at', j.created_at
      )
      order by j.created_at
    ),
    '[]'::jsonb
  )
  from survival_ops.illustration_render_jobs j
$$;

revoke all on function public.archive_illustration_render_attempt_history() from public;
grant execute on function public.archive_illustration_render_attempt_history() to service_role;
