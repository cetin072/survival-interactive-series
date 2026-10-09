begin;

-- Reuse the existing five-minute finalizer pulse to recover one verified legacy
-- Finalizer failure when the machine slot is empty. No new cron or worker.
create or replace function survival_ops.dispatch_knowledge_semantic_finalizer()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id bigint;
  recovery survival_ops.knowledge_semantic_jobs%rowtype;
  verified jsonb;
  retried jsonb;
begin
  -- Share the semantic admission lock so PREP/recovery cannot claim the one
  -- machine slot concurrently.
  perform pg_catalog.pg_advisory_xact_lock(724015);

  -- Never recover historical work while PREPARED/SUBMITTED/FINALIZING/PR_OPEN
  -- already owns the machine execution slot.
  if not exists (
    select 1
    from survival_ops.knowledge_semantic_jobs
    where status in ('PREPARED','SUBMITTED','FINALIZING','PR_OPEN')
  ) then
    select *
      into recovery
    from survival_ops.knowledge_semantic_jobs
    where status = 'BLOCKED'
      and blocker_stage = 'FINALIZER'
      and blocker_code = 'SEMANTIC_TARGET_BRIEF_STALE'
      and result_decision in ('BRIEF_READY','HUMAN_REVIEW')
      and semantic_result is not null
      and semantic_result_sha256 ~ '^[a-f0-9]{64}$'
      and final_pr_number is null
      and final_head_ref is null
      and final_head_sha is null
      and merge_sha is null
      and published_at is null
    order by prepared_at, job_id
    limit 1
    for update;

    if found then
      verified := public.archive_knowledge_semantic_job_verify_reservation(
        recovery.job_id,
        recovery.semantic_context->'target'->>'brief_id',
        recovery.source_ref,
        recovery.source_sha256,
        recovery.policy_sha256,
        recovery.semantic_result_sha256
      );

      if verified->>'status' = 'VALID' then
        retried := survival_ops.retry_knowledge_semantic_blocked_finalizer(
          recovery.job_id,
          recovery.semantic_result_sha256,
          recovery.blocker_code
        );
        if retried->>'status' is distinct from 'SUBMITTED' then
          raise exception 'KNOWLEDGE_SEMANTIC_AUTO_RETRY_REJECTED';
        end if;
      end if;
    end if;
  end if;

  -- Existing dispatch behavior remains authoritative after an optional retry.
  if not exists (
    select 1
    from survival_ops.knowledge_semantic_jobs
    where status = 'SUBMITTED'
      or (status = 'FINALIZING' and finalizing_at < pg_catalog.clock_timestamp() - interval '15 minutes')
      or (status = 'PR_OPEN' and updated_at < pg_catalog.clock_timestamp() - interval '5 minutes')
  ) then
    return null;
  end if;

  request_id := survival_ops.dispatch_knowledge_workflow(
    'knowledge-semantic-finalizer.yml',
    'semantic_submit'
  );

  update survival_ops.knowledge_semantic_jobs
    set finalizer_dispatch_count = least(finalizer_dispatch_count + 1, 100000),
        finalizer_dispatch_at = pg_catalog.clock_timestamp(),
        finalizer_dispatch_request_id = request_id
  where status = 'SUBMITTED'
    or (status = 'FINALIZING' and finalizing_at < pg_catalog.clock_timestamp() - interval '15 minutes')
    or (status = 'PR_OPEN' and updated_at < pg_catalog.clock_timestamp() - interval '5 minutes');

  return request_id;
end;
$$;

commit;
