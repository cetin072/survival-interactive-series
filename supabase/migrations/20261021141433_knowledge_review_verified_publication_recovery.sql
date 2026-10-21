begin;
-- Preserve failed receipt snapshots before a single, explicitly requested retry.
create table survival_ops.knowledge_review_retry_audits (
  receipt_id uuid primary key,
  item_id uuid not null references survival_ops.archive_review_items(id),
  previous_receipt jsonb not null,
  approved_identity jsonb not null,
  validated_main_sha text not null check (validated_main_sha ~ '^[a-f0-9]{40}$'),
  recovered_at timestamptz not null default clock_timestamp()
);
alter table survival_ops.knowledge_review_retry_audits enable row level security;
revoke all on survival_ops.knowledge_review_retry_audits from public,anon,authenticated,service_role;

create function public.archive_worker_get_approved_review(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare result jsonb;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then
    raise exception using errcode='42501', message='SURVIVAL_ARCHIVE_WORKER_FORBIDDEN';
  end if;
  select jsonb_build_object('id',i.id,'idempotency_key',i.idempotency_key,
    'source_ref',i.source_ref,'payload',i.payload,'decided_at',i.decided_at,'decision',i.status)
  into result from survival_ops.archive_review_items i
  where i.id=p_item_id and i.status='APPROVED' and i.source_worker='C_KNOWLEDGE' and i.item_type='KNOWLEDGE'
    and not exists(select 1 from survival_ops.archive_review_consumption_receipts r where r.item_id=i.id and r.outcome<>'RETRYABLE');
  return result;
end;
$fn$;
revoke all on function public.archive_worker_get_approved_review(uuid) from public,anon,authenticated;
grant execute on function public.archive_worker_get_approved_review(uuid) to service_role;

create function public.archive_worker_retry_validated_review(
 p_item_id uuid,p_decided_at timestamptz,p_receipt_id uuid,p_draft_sha256 text,p_validated_main_sha text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r survival_ops.archive_review_items%rowtype;
  c survival_ops.archive_review_consumption_receipts%rowtype;
  j survival_ops.knowledge_semantic_jobs%rowtype;
  d survival_ops.knowledge_operator_drafts%rowtype;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then
    raise exception using errcode='42501', message='SURVIVAL_ARCHIVE_WORKER_FORBIDDEN';
  end if;
  select * into r from survival_ops.archive_review_items where id=p_item_id for update;
  if not found or r.status is distinct from 'APPROVED' or r.decided_at is distinct from p_decided_at
    or r.source_worker is distinct from 'C_KNOWLEDGE' or r.item_type is distinct from 'KNOWLEDGE'
    or p_validated_main_sha is null or p_validated_main_sha !~ '^[a-f0-9]{40}$'
    or not exists(select 1 from survival_ops.archive_review_decisions where item_id=r.id and decision='APPROVED' and actor_profile_id=r.decided_by)
    then raise exception 'KNOWLEDGE_RETRY_APPROVAL_CHANGED'; end if;
  select * into c from survival_ops.archive_review_consumption_receipts where item_id=r.id for update;
  if not found or c.id is distinct from p_receipt_id or c.outcome is distinct from 'BLOCKED'
    or c.result->>'reason' is distinct from 'CURRENT_MAIN_MACHINE_VALIDATION_FAILED'
    then raise exception 'KNOWLEDGE_RETRY_RECEIPT_CHANGED'; end if;
  select * into j from survival_ops.knowledge_semantic_jobs where job_id=(r.payload->>'operator_job_id')::uuid for update;
  select * into d from survival_ops.knowledge_operator_drafts where job_id=j.job_id for update;
  if j.status is distinct from 'HUMAN_REVIEW' or j.result_decision is distinct from 'HUMAN_REVIEW'
    or j.final_pr_number is distinct from (r.payload->>'pr_number')::integer
    or j.semantic_result_sha256 is distinct from d.base_semantic_result_sha256
    or d.revision is distinct from (r.payload->>'operator_draft_revision')::integer
    or d.draft_sha256 is distinct from r.payload->>'operator_draft_sha256'
    or d.draft_sha256 is distinct from p_draft_sha256
    or p_draft_sha256 is null
    then raise exception 'KNOWLEDGE_RETRY_DRAFT_CHANGED'; end if;
  -- Existing package validates semantic digest, approval decision and original/prepared head.
  perform public.archive_knowledge_review_package(r.id,r.decided_at);
  insert into survival_ops.knowledge_review_retry_audits(receipt_id,item_id,previous_receipt,approved_identity,validated_main_sha)
    values(c.id,r.id,to_jsonb(c),jsonb_build_object('decided_at',r.decided_at,'payload',r.payload),p_validated_main_sha);
  update survival_ops.archive_review_consumption_receipts
    set outcome='RETRYABLE', result=jsonb_build_object('reason','VALIDATED_MACHINE_FIX_RETRY','previous_receipt_id',c.id,
      'validated_main_sha',p_validated_main_sha),created_at=clock_timestamp()
    where id=c.id;
  return jsonb_build_object('status','RETRYABLE','item_id',r.id,'preserved_receipt_id',c.id);
end;
$fn$;
revoke all on function public.archive_worker_retry_validated_review(uuid,timestamptz,uuid,text,text) from public,anon,authenticated;
grant execute on function public.archive_worker_retry_validated_review(uuid,timestamptz,uuid,text,text) to service_role;

-- Preserve the existing consumption implementation and all its binding checks.
-- A merge receipt alone must never transition a C3 human-review job to PUBLISHED.
do $patch$
declare definition text;
begin
  select pg_get_functiondef('public.archive_worker_record_review_consumption(uuid,timestamptz,text,jsonb)'::regprocedure) into definition;
  if position('KNOWLEDGE_PUBLICATION_NOT_VERIFIED' in definition)=0 then
    if position('receipt := public.archive_worker_record_review_consumption_v1' in definition)=0 then
      raise exception 'KNOWLEDGE_CONSUMER_DEFINITION_CHANGED';
    end if;
    definition := replace(definition,'receipt := public.archive_worker_record_review_consumption_v1',
      $guard$if p_outcome='CONSUMED' and exists (
        select 1 from survival_ops.archive_review_items i join survival_ops.knowledge_semantic_jobs j
          on j.final_pr_number=(i.payload->>'pr_number')::integer and j.final_head_ref=i.payload->>'head_ref'
        where i.id=p_item_id and j.status='HUMAN_REVIEW'
      ) and (
        p_result->>'status' is distinct from 'LIVE_VERIFIED'
        or coalesce(p_result->>'public_url','') !~ '^https://survival-diary-archive\.netlify\.app/knowledge/[a-z0-9]+(-[a-z0-9]+)*/$'
        or coalesce(p_result->>'merge_sha','') !~ '^[a-f0-9]{40}$'
        or p_result->>'verified_at' is null
      ) then raise exception 'KNOWLEDGE_PUBLICATION_NOT_VERIFIED'; end if;
      receipt := public.archive_worker_record_review_consumption_v1$guard$);
    execute definition;
  end if;
end;
$patch$;
commit;
