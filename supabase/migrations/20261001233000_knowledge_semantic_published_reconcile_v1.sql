begin;

create or replace function survival_ops.guard_knowledge_semantic_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  repair_job text;
  repair_allowed boolean := false;
begin
  if tg_op = 'UPDATE' then
    repair_job := pg_catalog.current_setting('survival_ops.knowledge_semantic_repair_job', true);
    repair_allowed :=
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
      and new.published_at is not null;

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

create or replace function survival_ops.repair_knowledge_semantic_published(
  p_job_id uuid,
  p_pr_number integer,
  p_old_head_sha text,
  p_prepared_head_sha text,
  p_merge_sha text
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
     or p_pr_number is null or p_pr_number <= 0
     or p_old_head_sha !~ '^[a-f0-9]{40}$'
     or p_prepared_head_sha !~ '^[a-f0-9]{40}$'
     or p_merge_sha !~ '^[a-f0-9]{40}$'
     or p_old_head_sha = p_prepared_head_sha then
    raise exception 'KNOWLEDGE_SEMANTIC_REPAIR_ARGUMENT_INVALID';
  end if;

  select * into target
  from survival_ops.knowledge_semantic_jobs
  where job_id = p_job_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status','NOT_FOUND');
  end if;

  if target.status <> 'BLOCKED'
     or target.result_decision <> 'BRIEF_READY'
     or target.blocker_code <> 'PR_HEAD_CHANGED'
     or target.blocker_stage <> 'PR_RECONCILE' then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','REPAIR_STATE_NOT_ELIGIBLE');
  end if;
  if target.final_pr_number is distinct from p_pr_number
     or target.final_head_sha is distinct from p_old_head_sha then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','REPAIR_BINDING_MISMATCH');
  end if;

  perform pg_catalog.set_config('survival_ops.knowledge_semantic_repair_job', p_job_id::text, true);

  update survival_ops.knowledge_semantic_jobs j
  set status = 'PUBLISHED',
      blocker_code = null,
      blocker_stage = null,
      final_head_sha = p_prepared_head_sha,
      merge_sha = p_merge_sha,
      published_at = clock_timestamp(),
      finalized_at = clock_timestamp()
  where j.job_id = p_job_id
  returning j.* into updated;

  return pg_catalog.jsonb_build_object(
    'status', updated.status,
    'job_id', updated.job_id,
    'pr_number', updated.final_pr_number,
    'final_head_sha', updated.final_head_sha,
    'merge_sha', updated.merge_sha
  );
end;
$$;

revoke all on function survival_ops.repair_knowledge_semantic_published(uuid,integer,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function survival_ops.repair_knowledge_semantic_published(uuid,integer,text,text,text)
  to postgres;

commit;
