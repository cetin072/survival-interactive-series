-- System supersession is separate from a human decision. Keep all original
-- review payloads, actor fields, decisions and consumption receipts intact.
alter table survival_ops.archive_review_items
  add column superseded_by uuid references survival_ops.archive_review_items(id),
  add column superseded_at timestamptz;
alter table survival_ops.archive_review_items drop constraint archive_review_items_status_check;
alter table survival_ops.archive_review_items add constraint archive_review_items_status_check
  check (status in ('PENDING','APPROVED','HOLD','REJECTED','SUPERSEDED'));
alter table survival_ops.archive_review_items drop constraint archive_review_items_check;
alter table survival_ops.archive_review_items add constraint archive_review_items_check check (
  (status = 'PENDING' and decided_at is null and decided_by is null and superseded_by is null and superseded_at is null)
  or (status in ('APPROVED','HOLD','REJECTED') and decided_at is not null and decided_by is not null and superseded_by is null and superseded_at is null)
  or (status = 'SUPERSEDED' and source_worker='C_KNOWLEDGE' and item_type='KNOWLEDGE'
      and decided_at is null and decided_by is null and superseded_by is not null
      and superseded_by <> id and superseded_at is not null)
);

create function survival_ops.supersede_knowledge_revalidated_reviews(p_job_id uuid, p_approved_item_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  job survival_ops.knowledge_semantic_jobs%rowtype;
  approved survival_ops.archive_review_items%rowtype;
  affected integer;
begin
  select * into job from survival_ops.knowledge_semantic_jobs where job_id=p_job_id for update;
  select * into approved from survival_ops.archive_review_items where id=p_approved_item_id for update;
  if job.status is distinct from 'PUBLISHED' or job.merge_sha is null or job.published_at is null
    or approved.status is distinct from 'APPROVED' or approved.source_worker <> 'C_KNOWLEDGE'
    or approved.item_type <> 'KNOWLEDGE'
    or approved.payload->>'brief_id' is distinct from job.semantic_result->'brief'->>'id'
    or approved.payload->>'pr_number' is distinct from job.final_pr_number::text
    or not exists (select 1 from survival_ops.archive_review_decisions d where d.item_id=approved.id and d.decision='APPROVED')
    or not exists (select 1 from survival_ops.archive_review_consumption_receipts r
      where r.item_id=approved.id and r.outcome='CONSUMED'
      and r.result->>'brief_id'=approved.payload->>'brief_id'
      and r.result->>'merge_sha'=job.merge_sha and r.result->>'prepared_sha'=job.final_head_sha)
    or not exists (select 1 from survival_ops.knowledge_ex001_review_revalidations link
      where link.job_id=job.job_id and link.source_sha256=job.source_sha256
      and link.new_review_item_id=approved.id and link.new_head_sha=approved.payload->>'head_sha'
      and link.new_pr_number=job.final_pr_number) then
    return jsonb_build_object('status','REJECTED','reason','APPROVED_OUTCOME_BINDING_MISMATCH');
  end if;

  update survival_ops.archive_review_items item
    set status='SUPERSEDED', superseded_by=approved.id, superseded_at=clock_timestamp(), updated_at=clock_timestamp()
    where item.status='PENDING' and item.source_worker='C_KNOWLEDGE' and item.item_type='KNOWLEDGE'
      and item.payload->>'brief_id'=approved.payload->>'brief_id'
      and item.created_at < approved.created_at
      and item.idempotency_key='C_KNOWLEDGE:' || (approved.payload->>'brief_id') || ':' || (item.payload->>'head_sha')
      and item.source_ref='https://github.com/cetin072/survival-interactive-series/blob/' || (item.payload->>'head_sha')
        || '/knowledge/content/briefs/' || (approved.payload->>'brief_id') || '.json'
      and exists (select 1 from survival_ops.knowledge_ex001_review_revalidations link
        where link.job_id=job.job_id and link.source_sha256=job.source_sha256
          and link.old_pr_number::text=item.payload->>'pr_number'
          and link.old_head_ref=item.payload->>'head_ref');
  get diagnostics affected = row_count;
  return jsonb_build_object('status','SUPERSEDED','count',affected,'approved_item_id',approved.id);
end;
$$;
revoke all on function survival_ops.supersede_knowledge_revalidated_reviews(uuid,uuid) from public,anon,authenticated,service_role;
