begin;

-- The Knowledge PR gate already enqueues a review item for each exact PR head.
-- Bind the blocked EX-001 job to that existing item; preserve prior pending items.
alter table survival_ops.knowledge_ex001_review_revalidations
  add column if not exists new_review_item_id uuid
    references survival_ops.archive_review_items(id);

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
  old_review survival_ops.archive_review_items%rowtype;
  new_review survival_ops.archive_review_items%rowtype;
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

  select * into old_review from survival_ops.archive_review_items
    where id=p_review_item_id for update;
  if not found or old_review.status <> 'PENDING'
     or old_review.source_worker <> 'C_KNOWLEDGE'
     or old_review.item_type <> 'KNOWLEDGE'
     or old_review.payload->>'brief_id' is distinct from 'K-014'
     or old_review.payload->>'head_sha' is distinct from p_old_head_sha
     or old_review.payload->>'pr_number' is distinct from p_old_pr_number::text then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','EX001_REVALIDATION_REVIEW_MISMATCH');
  end if;

  select * into new_review from survival_ops.archive_review_items
    where idempotency_key='C_KNOWLEDGE:K-014:' || p_new_head_sha for update;
  if not found or new_review.status <> 'PENDING'
     or new_review.id = old_review.id
     or new_review.source_worker <> 'C_KNOWLEDGE'
     or new_review.item_type <> 'KNOWLEDGE'
     or new_review.payload->>'brief_id' is distinct from 'K-014'
     or new_review.payload->>'head_sha' is distinct from p_new_head_sha
     or new_review.payload->>'pr_number' is distinct from p_new_pr_number::text
     or new_review.payload->>'head_ref' is distinct from p_new_head_ref
     or new_review.source_ref is distinct from
       'https://github.com/cetin072/survival-interactive-series/blob/' || p_new_head_sha || '/knowledge/content/briefs/K-014.json' then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','EX001_REVALIDATION_NEW_REVIEW_MISMATCH');
  end if;

  insert into survival_ops.knowledge_ex001_review_revalidations (
    job_id, review_item_id, new_review_item_id, old_pr_number, old_head_ref, old_head_sha,
    new_pr_number, new_head_ref, new_head_sha, revalidated_main_sha, source_sha256
  ) values (
    p_job_id, old_review.id, new_review.id, p_old_pr_number, target.final_head_ref, p_old_head_sha,
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

  return pg_catalog.jsonb_build_object(
    'status','HUMAN_REVIEW','job_id',p_job_id,'review_item_id',new_review.id,
    'pr_number',p_new_pr_number,'head_sha',p_new_head_sha
  );
end;
$$;

revoke all on function survival_ops.revalidate_ex001_human_review(uuid,uuid,integer,text,integer,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function survival_ops.revalidate_ex001_human_review(uuid,uuid,integer,text,integer,text,text,text)
  to postgres;

commit;
