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
  revalidate_job text;
  publish_job text;
  repair_allowed boolean := false;
begin
  if tg_op = 'UPDATE' then
    repair_job := pg_catalog.current_setting('survival_ops.knowledge_semantic_repair_job', true);
    retry_job := pg_catalog.current_setting('survival_ops.knowledge_semantic_retry_job', true);
    revalidate_job := pg_catalog.current_setting('survival_ops.knowledge_ex001_revalidate_job', true);
    publish_job := pg_catalog.current_setting('survival_ops.knowledge_ex001_publish_job', true);

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
      )
      or
      (
        old.job_id = '83ee5b52-0732-4d47-a56c-e1046cf18a33'::uuid
        and old.status = 'BLOCKED'
        and old.source_kind = 'USER_REPORTED_EXPERIENCE'
        and old.source_ref = 'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json'
        and old.result_decision = 'HUMAN_REVIEW'
        and old.blocker_code = 'PR_HEAD_CHANGED'
        and old.blocker_stage = 'PR_RECONCILE'
        and old.final_pr_number = 416
        and old.final_head_sha = '0e5db34a41d1b80a9bf1267c8be50e54621f7ddf'
        and publish_job = old.job_id::text
        and new.status = 'PUBLISHED'
        and new.final_head_sha = '6183501036e1388f48d42e30f8845f0c84176d79'
        and new.merge_sha = 'd00c351cedeebc8703afdfdf817a3104cd4c608c'
        and new.blocker_code is null
        and new.blocker_stage is null
        and new.published_at is not null
        and (pg_catalog.to_jsonb(new) - array['status','final_head_sha','merge_sha','blocker_code','blocker_stage','published_at','finalized_at','updated_at'])
          = (pg_catalog.to_jsonb(old) - array['status','final_head_sha','merge_sha','blocker_code','blocker_stage','published_at','finalized_at','updated_at'])
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


-- This repair is deliberately bound to the already verified EX-001 approval,
-- publication commit, and merge. It cannot publish another job.
create or replace function survival_ops.repair_ex001_human_approved_publication()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target survival_ops.knowledge_semantic_jobs%rowtype;
  review_row survival_ops.archive_review_items%rowtype;
  receipt survival_ops.archive_review_consumption_receipts%rowtype;
  draft survival_ops.knowledge_operator_drafts%rowtype;
  updated survival_ops.knowledge_semantic_jobs%rowtype;
begin
  select * into target from survival_ops.knowledge_semantic_jobs
    where job_id='83ee5b52-0732-4d47-a56c-e1046cf18a33'::uuid for update;
  if not found then return pg_catalog.jsonb_build_object('status','NOT_FOUND'); end if;
  if target.status <> 'BLOCKED'
     or target.blocker_code <> 'PR_HEAD_CHANGED'
     or target.blocker_stage <> 'PR_RECONCILE'
     or target.source_kind <> 'USER_REPORTED_EXPERIENCE'
     or target.source_ref <> 'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json'
     or target.result_decision <> 'HUMAN_REVIEW'
     or target.semantic_result->'brief'->>'id' is distinct from 'K-014'
     or target.final_pr_number is distinct from 416
     or target.final_head_sha is distinct from '0e5db34a41d1b80a9bf1267c8be50e54621f7ddf'
     or target.merge_sha is not null or target.published_at is not null then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','EX001_JOB_MISMATCH');
  end if;

  select * into review_row from survival_ops.archive_review_items
    where id='f5fe94be-4c0a-4904-8841-bc1d2378f986'::uuid for update;
  if not found or review_row.status <> 'APPROVED'
     or review_row.source_worker <> 'C_KNOWLEDGE'
     or review_row.item_type <> 'KNOWLEDGE'
     or review_row.decided_at is null
     or review_row.payload->>'operator_job_id' is distinct from target.job_id::text
     or review_row.payload->>'brief_id' is distinct from 'K-014'
     or review_row.payload->>'pr_number' is distinct from '416'
     or review_row.payload->>'head_sha' is distinct from target.final_head_sha
     or review_row.payload->>'operator_draft_revision' is distinct from '1' then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','EX001_APPROVAL_MISMATCH');
  end if;

  select * into draft from survival_ops.knowledge_operator_drafts
    where job_id=target.job_id for update;
  if not found or draft.revision <> 1
     or draft.draft_sha256 is distinct from review_row.payload->>'operator_draft_sha256' then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','EX001_DRAFT_MISMATCH');
  end if;

  select * into receipt from survival_ops.archive_review_consumption_receipts
    where item_id=review_row.id for update;
  if not found or receipt.outcome <> 'CONSUMED'
     or receipt.result->>'brief_id' is distinct from 'K-014'
     or receipt.result->>'prepared_sha' is distinct from '6183501036e1388f48d42e30f8845f0c84176d79'
     or receipt.result->>'merge_sha' is distinct from 'd00c351cedeebc8703afdfdf817a3104cd4c608c'
     or receipt.result->>'production' is distinct from 'BATCHED_RELEASE_GATE' then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','EX001_CONSUMPTION_MISMATCH');
  end if;

  perform pg_catalog.set_config('survival_ops.knowledge_ex001_publish_job',target.job_id::text,true);
  update survival_ops.knowledge_semantic_jobs
    set status='PUBLISHED', blocker_code=null, blocker_stage=null,
        final_head_sha='6183501036e1388f48d42e30f8845f0c84176d79',
        merge_sha='d00c351cedeebc8703afdfdf817a3104cd4c608c',
        published_at=clock_timestamp(), finalized_at=clock_timestamp()
    where job_id=target.job_id returning * into updated;
  return pg_catalog.jsonb_build_object('status',updated.status,'job_id',updated.job_id,
    'final_head_sha',updated.final_head_sha,'merge_sha',updated.merge_sha);
end;
$$;
revoke all on function survival_ops.repair_ex001_human_approved_publication()
  from public, anon, authenticated, service_role;
grant execute on function survival_ops.repair_ex001_human_approved_publication() to postgres;

commit;
