-- Link C3 durable Knowledge Inbox records to the existing Operator human-review queue.
-- Reuses archive_review_items and archive_operator_decide_review_item; no new approval state is introduced.

create or replace function public.archive_operator_knowledge_inbox()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  result jsonb;
begin
  actor_id := survival_ops.private_require_archive_operator();

  select pg_catalog.jsonb_build_object(
    'total_count', count(*),
    'working_count', count(*) filter (where j.status in ('PREPARED','SUBMITTED','FINALIZING','PR_OPEN')),
    'review_count', count(*) filter (where j.status = 'HUMAN_REVIEW'),
    'held_count', count(*) filter (where j.status in ('HOLD','BLOCKED')),
    'published_count', count(*) filter (where j.status = 'PUBLISHED'),
    'items', coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'job_id', j.job_id,
          'job_type', j.job_type,
          'status', j.status,
          'source_kind', j.source_kind,
          'source_ref', j.source_ref,
          'source_sha256', j.source_sha256,
          'prepared_at', j.prepared_at,
          'submitted_at', j.submitted_at,
          'published_at', j.published_at,
          'result_decision', j.result_decision,
          'brief_id', coalesce(j.semantic_result->'brief'->>'id', j.semantic_context->'target'->>'brief_id'),
          'candidate_id', coalesce(j.semantic_result->'candidate'->>'id', j.semantic_context->'target'->>'candidate_id'),
          'title', coalesce(j.semantic_result->'brief'->>'title', j.semantic_result->'candidate'->>'question'),
          'risk_level', j.semantic_result->'brief'->>'risk_level',
          'code', coalesce(j.semantic_result->>'code', j.blocker_code),
          'note', j.semantic_result->>'note',
          'final_pr_number', j.final_pr_number,
          'merge_sha', j.merge_sha,
          'review_item_id', review_item.id,
          'review_status', review_item.status,
          'review_decision_note', review_item.decision_note
        )
        order by j.prepared_at desc, j.job_id desc
      ),
      '[]'::jsonb
    )
  )
  into result
  from survival_ops.knowledge_semantic_jobs j
  left join lateral (
    select item.id, item.status, item.decision_note
    from survival_ops.archive_review_items item
    where item.source_worker = 'C_KNOWLEDGE'
      and item.item_type = 'KNOWLEDGE'
      and item.payload->>'brief_id' = coalesce(
        j.semantic_result->'brief'->>'id',
        j.semantic_context->'target'->>'brief_id'
      )
      and (
        (j.final_head_sha is not null and item.payload->>'head_sha' = j.final_head_sha)
        or (j.final_pr_number is not null and item.payload->>'pr_number' = j.final_pr_number::text)
      )
    order by item.created_at desc, item.id desc
    limit 1
  ) review_item on true;

  return coalesce(result, pg_catalog.jsonb_build_object(
    'total_count',0,'working_count',0,'review_count',0,'held_count',0,'published_count',0,'items','[]'::jsonb
  ));
end;
$$;

create or replace function public.archive_operator_knowledge_job_detail(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  result jsonb;
begin
  actor_id := survival_ops.private_require_archive_operator();

  select pg_catalog.jsonb_build_object(
    'job_id', j.job_id,
    'job_type', j.job_type,
    'status', j.status,
    'source_kind', j.source_kind,
    'source_ref', j.source_ref,
    'source_sha256', j.source_sha256,
    'work_key', j.work_key,
    'policy_version', j.policy_version,
    'main_sha_at_prepare', j.main_sha_at_prepare,
    'prepared_at', j.prepared_at,
    'submitted_at', j.submitted_at,
    'published_at', j.published_at,
    'result_decision', j.result_decision,
    'blocker_code', j.blocker_code,
    'blocker_stage', j.blocker_stage,
    'final_pr_number', j.final_pr_number,
    'final_head_ref', j.final_head_ref,
    'final_head_sha', j.final_head_sha,
    'merge_sha', j.merge_sha,
    'review_item_id', review_item.id,
    'review_status', review_item.status,
    'review_decision_note', review_item.decision_note,
    'context', j.semantic_context,
    'result', j.semantic_result
  )
  into result
  from survival_ops.knowledge_semantic_jobs j
  left join lateral (
    select item.id, item.status, item.decision_note
    from survival_ops.archive_review_items item
    where item.source_worker = 'C_KNOWLEDGE'
      and item.item_type = 'KNOWLEDGE'
      and item.payload->>'brief_id' = coalesce(
        j.semantic_result->'brief'->>'id',
        j.semantic_context->'target'->>'brief_id'
      )
      and (
        (j.final_head_sha is not null and item.payload->>'head_sha' = j.final_head_sha)
        or (j.final_pr_number is not null and item.payload->>'pr_number' = j.final_pr_number::text)
      )
    order by item.created_at desc, item.id desc
    limit 1
  ) review_item on true
  where j.job_id = p_job_id;

  if result is null then
    raise exception using errcode='P0002', message='SURVIVAL_ARCHIVE_KNOWLEDGE_JOB_NOT_FOUND';
  end if;
  return result;
end;
$$;

revoke all on function public.archive_operator_knowledge_inbox() from public, anon;
revoke all on function public.archive_operator_knowledge_job_detail(uuid) from public, anon;
grant execute on function public.archive_operator_knowledge_inbox() to authenticated;
grant execute on function public.archive_operator_knowledge_job_detail(uuid) to authenticated;
