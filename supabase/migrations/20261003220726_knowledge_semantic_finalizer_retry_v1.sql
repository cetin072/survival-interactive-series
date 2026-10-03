begin;

create or replace function survival_ops.guard_knowledge_semantic_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  repair_job text;
  retry_job text;
  repair_allowed boolean := false;
begin
  if tg_op = 'UPDATE' then
    repair_job := pg_catalog.current_setting('survival_ops.knowledge_semantic_repair_job', true);
    retry_job := pg_catalog.current_setting('survival_ops.knowledge_semantic_retry_job', true);

    repair_allowed :=
      (
        old.status = 'BLOCKED'
        and old.result_decision = 'BRIEF_READY'
        and old.blocker_code = 'PR_HEAD_CHANGED'
        and old.blocker_stage = 'PR_RECONCILE'
        and new.status = 'PUBLISHED'
        and repair_job = old.job_id::text
        and new.semantic_result is not distinct from old.semantic_result
        and new.final_pr_number is not distinct from old.final_pr_number
        and new.final_head_ref is not distinct from old.final_head_ref
        and new.final_head_sha ~ '^[a-f0-9]{40}$'
        and new.merge_sha ~ '^[a-f0-9]{40}$'
        and new.blocker_code is null
        and new.blocker_stage is null
        and new.published_at is not null
      )
      or
      (
        old.status = 'BLOCKED'
        and old.blocker_stage = 'FINALIZER'
        and old.result_decision in ('BRIEF_READY','HUMAN_REVIEW')
        and new.status = 'SUBMITTED'
        and retry_job = old.job_id::text
        and new.semantic_result is not distinct from old.semantic_result
        and new.semantic_result_sha256 is not distinct from old.semantic_result_sha256
        and new.result_decision is not distinct from old.result_decision
        and new.final_pr_number is null
        and new.final_head_ref is null
        and new.final_head_sha is null
        and new.merge_sha is null
        and new.blocker_code is null
        and new.blocker_stage is null
        and new.finalizing_at is null
        and new.finalized_at is null
        and new.published_at is null
        and new.finalizer_attempt_count = 0
      );

    if old.status in ('PUBLISHED','HOLD','BLOCKED') and not repair_allowed then
      raise exception 'KNOWLEDGE_SEMANTIC_TERMINAL_IMMUTABLE';
    end if;
    if old.status <> 'PREPARED' and new.semantic_result is distinct from old.semantic_result then
      raise exception 'KNOWLEDGE_SEMANTIC_RESULT_IMMUTABLE';
    end if;
    if not repair_allowed then
      if old.status = 'PREPARED' and new.status not in ('PREPARED','SUBMITTED','HOLD','BLOCKED') then
        raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
      elsif old.status = 'SUBMITTED' and new.status not in ('SUBMITTED','FINALIZING','HOLD','BLOCKED') then
        raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
      elsif old.status = 'FINALIZING' and new.status not in ('FINALIZING','SUBMITTED','PR_OPEN','HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED') then
        raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
      elsif old.status = 'PR_OPEN' and new.status not in ('PR_OPEN','HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED') then
        raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
      elsif old.status = 'HUMAN_REVIEW' and new.status not in ('HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED') then
        raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
      end if;
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function survival_ops.retry_knowledge_semantic_blocked_finalizer(
  p_job_id uuid,
  p_expected_result_sha256 text,
  p_expected_blocker_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target survival_ops.knowledge_semantic_jobs%rowtype;
  updated survival_ops.knowledge_semantic_jobs%rowtype;
begin
  if p_job_id is null
     or p_expected_result_sha256 !~ '^[a-f0-9]{64}$'
     or p_expected_blocker_code is null
     or pg_catalog.btrim(p_expected_blocker_code) = '' then
    raise exception 'KNOWLEDGE_SEMANTIC_RETRY_ARGUMENT_INVALID';
  end if;

  select * into target
  from survival_ops.knowledge_semantic_jobs
  where job_id = p_job_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status','NOT_FOUND');
  end if;

  if target.status <> 'BLOCKED'
     or target.blocker_stage <> 'FINALIZER'
     or target.result_decision not in ('BRIEF_READY','HUMAN_REVIEW')
     or target.semantic_result is null
     or target.final_pr_number is not null
     or target.final_head_ref is not null
     or target.final_head_sha is not null
     or target.merge_sha is not null
     or target.published_at is not null then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','RETRY_STATE_NOT_ELIGIBLE');
  end if;

  if target.semantic_result_sha256 is distinct from p_expected_result_sha256
     or target.blocker_code is distinct from p_expected_blocker_code then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','RETRY_BINDING_MISMATCH');
  end if;

  perform pg_catalog.set_config('survival_ops.knowledge_semantic_retry_job', p_job_id::text, true);

  update survival_ops.knowledge_semantic_jobs j
  set status = 'SUBMITTED',
      blocker_code = null,
      blocker_stage = null,
      finalizing_at = null,
      finalized_at = null,
      finalizer_attempt_count = 0
  where j.job_id = p_job_id
  returning j.* into updated;

  return pg_catalog.jsonb_build_object(
    'status', updated.status,
    'job_id', updated.job_id,
    'result_decision', updated.result_decision,
    'semantic_result_sha256', updated.semantic_result_sha256
  );
end;
$$;

revoke all on function survival_ops.retry_knowledge_semantic_blocked_finalizer(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function survival_ops.retry_knowledge_semantic_blocked_finalizer(uuid,text,text)
  to postgres;

commit;
