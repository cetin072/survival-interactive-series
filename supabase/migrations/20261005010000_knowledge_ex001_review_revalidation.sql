begin;

-- One EX-001 recovery transition for a closed, stale human-review PR.
-- The original prepared source and semantic result stay immutable.
create table if not exists survival_ops.knowledge_ex001_review_revalidations (
  id bigint generated always as identity primary key,
  job_id uuid not null references survival_ops.knowledge_semantic_jobs(job_id),
  review_item_id uuid not null references survival_ops.archive_review_items(id),
  old_pr_number integer not null,
  old_head_ref text not null,
  old_head_sha text not null,
  new_pr_number integer not null,
  new_head_ref text not null,
  new_head_sha text not null,
  revalidated_main_sha text not null check (revalidated_main_sha ~ '^[a-f0-9]{40}$'),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (job_id, new_head_sha)
);
revoke all on survival_ops.knowledge_ex001_review_revalidations from public, anon, authenticated, service_role;

create or replace function survival_ops.guard_knowledge_semantic_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  repair_job text;
  retry_job text;
  revalidate_job text;
  repair_allowed boolean := false;
begin
  if tg_op = 'UPDATE' then
    repair_job := pg_catalog.current_setting('survival_ops.knowledge_semantic_repair_job', true);
    retry_job := pg_catalog.current_setting('survival_ops.knowledge_semantic_retry_job', true);
    revalidate_job := pg_catalog.current_setting('survival_ops.knowledge_ex001_revalidate_job', true);

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
      )
      or
      (
        old.status = 'BLOCKED'
        and old.source_kind = 'USER_REPORTED_EXPERIENCE'
        and old.source_ref = 'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json'
        and old.result_decision = 'HUMAN_REVIEW'
        and old.blocker_code = 'MAIN_MOVED_REVALIDATION_REQUIRED'
        and old.blocker_stage = 'PR_RECONCILE'
        and revalidate_job = old.job_id::text
        and new.status = 'HUMAN_REVIEW'
        and new.final_pr_number > 0
        and new.final_pr_number <> old.final_pr_number
        and new.final_head_ref ~ '^knowledge/worker/[A-Za-z0-9._/-]+$'
        and new.final_head_sha ~ '^[a-f0-9]{40}$'
        and new.final_head_sha <> old.final_head_sha
        and new.blocker_code is null
        and new.blocker_stage is null
        and (pg_catalog.to_jsonb(new) - array['status','final_pr_number','final_head_ref','final_head_sha','blocker_code','blocker_stage'])
            = (pg_catalog.to_jsonb(old) - array['status','final_pr_number','final_head_ref','final_head_sha','blocker_code','blocker_stage'])
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

create or replace function survival_ops.revalidate_ex001_human_review(
  p_job_id uuid,
  p_review_item_id uuid,
  p_old_pr_number integer,
  p_old_head_sha text,
  p_new_pr_number integer,
  p_new_head_ref text,
  p_new_head_sha text,
  p_new_main_sha text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target survival_ops.knowledge_semantic_jobs%rowtype;
  review_row survival_ops.archive_review_items%rowtype;
begin
  if p_job_id is null or p_review_item_id is null
     or p_old_pr_number is null or p_old_pr_number <= 0
     or p_new_pr_number is null or p_new_pr_number <= 0 or p_new_pr_number = p_old_pr_number
     or p_old_head_sha is null or p_old_head_sha !~ '^[a-f0-9]{40}$'
     or p_new_head_sha is null or p_new_head_sha !~ '^[a-f0-9]{40}$' or p_new_head_sha = p_old_head_sha
     or p_new_main_sha is null or p_new_main_sha !~ '^[a-f0-9]{40}$'
     or p_new_head_ref is null or p_new_head_ref !~ '^knowledge/worker/[A-Za-z0-9._/-]+$' then
    raise exception 'EX001_REVALIDATION_ARGUMENT_INVALID';
  end if;

  select * into target from survival_ops.knowledge_semantic_jobs
    where job_id = p_job_id for update;
  if not found then return pg_catalog.jsonb_build_object('status','NOT_FOUND'); end if;
  if target.status <> 'BLOCKED'
     or target.blocker_code <> 'MAIN_MOVED_REVALIDATION_REQUIRED'
     or target.blocker_stage <> 'PR_RECONCILE'
     or target.source_kind <> 'USER_REPORTED_EXPERIENCE'
     or target.source_ref <> 'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json'
     or target.result_decision <> 'HUMAN_REVIEW'
     or target.final_pr_number is distinct from p_old_pr_number
     or target.final_head_sha is distinct from p_old_head_sha
     or target.merge_sha is not null
     or target.published_at is not null
     or target.semantic_result->'brief'->>'id' is distinct from 'K-014' then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','EX001_REVALIDATION_JOB_MISMATCH');
  end if;
  if exists (select 1 from survival_ops.knowledge_operator_drafts where job_id=p_job_id) then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','EX001_DRAFT_ALREADY_EXISTS');
  end if;

  select * into review_row from survival_ops.archive_review_items
    where id=p_review_item_id for update;
  if not found or review_row.status <> 'PENDING'
     or review_row.source_worker <> 'C_KNOWLEDGE'
     or review_row.item_type <> 'KNOWLEDGE'
     or review_row.payload->>'brief_id' is distinct from 'K-014'
     or review_row.payload->>'head_sha' is distinct from p_old_head_sha
     or review_row.payload->>'pr_number' is distinct from p_old_pr_number::text then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','EX001_REVALIDATION_REVIEW_MISMATCH');
  end if;

  insert into survival_ops.knowledge_ex001_review_revalidations (
    job_id, review_item_id, old_pr_number, old_head_ref, old_head_sha,
    new_pr_number, new_head_ref, new_head_sha, revalidated_main_sha, source_sha256
  ) values (
    p_job_id, p_review_item_id, p_old_pr_number, target.final_head_ref, p_old_head_sha,
    p_new_pr_number, p_new_head_ref, p_new_head_sha, p_new_main_sha, target.source_sha256
  );

  perform pg_catalog.set_config('survival_ops.knowledge_ex001_revalidate_job',p_job_id::text,true);
  update survival_ops.knowledge_semantic_jobs
    set status='HUMAN_REVIEW',
        final_pr_number=p_new_pr_number,
        final_head_ref=p_new_head_ref,
        final_head_sha=p_new_head_sha,
        blocker_code=null,
        blocker_stage=null
    where job_id=p_job_id;

  update survival_ops.archive_review_items
    set idempotency_key='C_KNOWLEDGE:K-014:' || p_new_head_sha,
        source_ref='https://github.com/cetin072/survival-interactive-series/blob/' || p_new_head_sha || '/knowledge/content/briefs/K-014.json',
        payload=review_row.payload || pg_catalog.jsonb_build_object(
          'head_sha',p_new_head_sha,'pr_number',p_new_pr_number,'head_ref',p_new_head_ref
        ),
        updated_at=clock_timestamp()
    where id=p_review_item_id;

  return pg_catalog.jsonb_build_object(
    'status','HUMAN_REVIEW','job_id',p_job_id,'review_item_id',p_review_item_id,
    'pr_number',p_new_pr_number,'head_sha',p_new_head_sha
  );
end;
$$;

revoke all on function survival_ops.revalidate_ex001_human_review(uuid,uuid,integer,text,integer,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function survival_ops.revalidate_ex001_human_review(uuid,uuid,integer,text,integer,text,text,text)
  to postgres;

commit;
