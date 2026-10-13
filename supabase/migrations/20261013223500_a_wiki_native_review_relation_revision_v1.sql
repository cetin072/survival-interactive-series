-- A-Wiki immutable independent Reviewer hold correction, scoped to one
-- existing source-bound relation label. NEVER rewrite original semantic or
-- review payloads. The corrected candidate enters the ordinary Native program
-- as EXTRACTOR_SUBMITTED and requires a *new* independently submitted review.
begin;

alter table survival_ops.a_wiki_native_jobs
  add column review_revision integer not null default 0
    constraint a_wiki_review_revision_range check (review_revision between 0 and 5);

-- Historical original and corrected semantic versions may share the same
-- approved public SOURCE and Graph; the revision number preserves uniqueness.
alter table survival_ops.a_wiki_native_jobs
  drop constraint a_wiki_native_jobs_source_graph_key,
  add constraint a_wiki_native_jobs_source_graph_revision_key
    unique (source_ref,source_sha256,graph_sha256,review_revision);

create table survival_ops.a_wiki_native_review_revision_audits (
  prior_job_id uuid primary key references survival_ops.a_wiki_native_jobs(job_id),
  revised_job_id uuid not null unique references survival_ops.a_wiki_native_jobs(job_id),
  correction jsonb not null check (
    pg_catalog.jsonb_typeof(correction)='object'
    and pg_catalog.pg_column_size(correction)<=8192
  ),
  prior_extractor_sha256 text not null check (prior_extractor_sha256 ~ '^[a-f0-9]{64}$'),
  prior_review_sha256 text not null check (prior_review_sha256 ~ '^[a-f0-9]{64}$'),
  revised_extractor_sha256 text not null check (revised_extractor_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table survival_ops.a_wiki_native_review_revision_audits enable row level security;
revoke all on table survival_ops.a_wiki_native_review_revision_audits from public,anon,authenticated,service_role;

-- Keep the existing trigger implementation EXACTLY, except for one narrow,
-- content-preserving terminal supersession and immutable revision binding.
CREATE OR REPLACE FUNCTION survival_ops.guard_a_wiki_native_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op='INSERT' and new.label_correction is not null then
    raise exception 'A_WIKI_LABEL_CORRECTION_RPC_REQUIRED';
  end if;
  if tg_op='UPDATE' then
    if old.label_correction is distinct from new.label_correction then
      if old.label_correction is null and new.label_correction is not null
        and old.status='BLOCKED' and old.blocker_code='WIKI_NEW_NAME_NOT_IN_EVIDENCE'
        and new.status='EXTRACTOR_SUBMITTED' and new.blocker_code is null
        and survival_ops.a_wiki_label_correction_valid(old,new.label_correction)
        and (pg_catalog.to_jsonb(old) - array['status','blocker_code','label_correction','updated_at'])
          = (pg_catalog.to_jsonb(new) - array['status','blocker_code','label_correction','updated_at']) then
        new.updated_at := pg_catalog.clock_timestamp();
        return new;
      end if;
      raise exception 'A_WIKI_LABEL_CORRECTION_IMMUTABLE';
    end if;
    -- An independently rejected REVIEWER_HUMAN_REVIEW may be retained as an
    -- immutable SUPERSEDED revision. Its semantic payload, review decision,
    -- source and timestamps are never edited. Only a service-only revision
    -- RPC creates a fresh job with the correction and a new independent review.
    if old.status='HUMAN_REVIEW'
      and old.blocker_code='REVIEWER_HUMAN_REVIEW'
      and old.review_result->>'decision'='HUMAN_REVIEW'
      and new.status='SUPERSEDED'
      and (pg_catalog.to_jsonb(old)-array['status','updated_at'])
        = (pg_catalog.to_jsonb(new)-array['status','updated_at']) then
      new.updated_at := pg_catalog.clock_timestamp();
      return new;
    end if;
    if old.status in ('PUBLISHED','HUMAN_REVIEW','REJECT','SUPERSEDED') then
      raise exception 'A_WIKI_NATIVE_TERMINAL_IMMUTABLE';
    end if;
    if old.review_revision is distinct from new.review_revision
      or old.job_id is distinct from new.job_id
      or old.session_id is distinct from new.session_id
      or old.created_at is distinct from new.created_at
      or old.supersedes_job_id is distinct from new.supersedes_job_id
      or old.prepared_job is distinct from new.prepared_job
      or old.prepared_job_sha256 is distinct from new.prepared_job_sha256
      or old.source_ref is distinct from new.source_ref
      or old.source_sha256 is distinct from new.source_sha256
      or old.graph_sha256 is distinct from new.graph_sha256
      or old.main_sha_at_prepare is distinct from new.main_sha_at_prepare then
      raise exception 'A_WIKI_NATIVE_BINDING_IMMUTABLE';
    end if;

    -- The general advance RPC cannot supply this evidence. All native semantic
    -- payloads and timestamps must remain exactly as they were before recovery.
    if new.status='PUBLISHED' and new.completion_origin='EXTERNAL_REVIEWED_MERGE'
      and old.completion_evidence is null
      and survival_ops.a_wiki_publication_evidence_valid(
        old.source_ref,old.source_sha256,old.prepared_job_sha256,new.completion_evidence
      )
      and (pg_catalog.to_jsonb(old) - array[
        'status','completion_origin','completion_evidence','blocker_code',
        'final_pr_number','final_head_ref','final_head_sha','merge_sha','published_at','updated_at'
      ]) = (pg_catalog.to_jsonb(new) - array[
        'status','completion_origin','completion_evidence','blocker_code',
        'final_pr_number','final_head_ref','final_head_sha','merge_sha','published_at','updated_at'
      ])
      and new.final_pr_number = (new.completion_evidence->>'pr_number')::integer
      and new.final_head_ref = new.completion_evidence->>'head_ref'
      and new.final_head_sha = new.completion_evidence->>'head_sha'
      and new.merge_sha = new.completion_evidence->>'merge_sha'
      and new.published_at = (new.completion_evidence->>'merged_at')::timestamptz then
      new.updated_at := pg_catalog.clock_timestamp();
      return new;
    end if;
    if old.completion_origin is distinct from new.completion_origin
      or old.completion_evidence is distinct from new.completion_evidence then
      raise exception 'A_WIKI_NATIVE_PUBLICATION_EVIDENCE_IMMUTABLE';
    end if;

    -- Retire only the graph-bound blocked package; never erase or rebind it.
    if old.status='BLOCKED'
      and old.blocker_code='A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED'
      and new.status='SUPERSEDED'
      and (pg_catalog.to_jsonb(old) - array['status','updated_at'])
        = (pg_catalog.to_jsonb(new) - array['status','updated_at']) then
      new.updated_at := pg_catalog.clock_timestamp();
      return new;
    end if;
    if old.status='EXTRACTOR_READY' and new.status not in ('EXTRACTOR_READY','EXTRACTOR_SUBMITTED','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='EXTRACTOR_SUBMITTED' and new.status not in ('EXTRACTOR_SUBMITTED','REVIEW_READY','HUMAN_REVIEW','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='REVIEW_READY' and new.status not in ('REVIEW_READY','REVIEW_SUBMITTED','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='REVIEW_SUBMITTED' and new.status not in ('REVIEW_SUBMITTED','FINALIZING','HUMAN_REVIEW','REJECT','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='FINALIZING' and new.status not in ('FINALIZING','PUBLISHED','HUMAN_REVIEW','REJECT','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='BLOCKED' and (new.status not in ('BLOCKED','FINALIZING')
      or (new.status='FINALIZING' and old.blocker_code='A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED')) then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    end if;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$


create or replace function public.archive_a_wiki_native_job_revise_human_relation(
  p_job_id uuid,p_correction jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $revision$
declare
  old_row survival_ops.a_wiki_native_jobs%rowtype;
  new_row survival_ops.a_wiki_native_jobs%rowtype;
  audit_row survival_ops.a_wiki_native_review_revision_audits%rowtype;
  original_relation jsonb;
  corrected_relations jsonb;
  corrected_result jsonb;
  corrected_sha text;
  target_count integer;
  dispatch_id bigint;
begin
  if p_job_id is null or p_correction is null
    or pg_catalog.jsonb_typeof(p_correction)<>'object'
    or pg_catalog.pg_column_size(p_correction)>8192 then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','CORRECTION_ENVELOPE_INVALID');
  end if;
  -- Same lease as the standard Prepare RPC. This prevents a concurrent
  -- publication/prepare from winning the single active job slot.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('a_wiki_native_job_admission',0));
  select * into old_row from survival_ops.a_wiki_native_jobs where job_id=p_job_id for update;
  if not found then return pg_catalog.jsonb_build_object('status','NOT_FOUND'); end if;

  select * into audit_row from survival_ops.a_wiki_native_review_revision_audits
  where prior_job_id=p_job_id;
  if found then
    if audit_row.correction=p_correction then
      return pg_catalog.jsonb_build_object('status','ALREADY_REVISED',
        'prior_job_id',p_job_id,'job_id',audit_row.revised_job_id);
    end if;
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','REVISION_ALREADY_EXISTS');
  end if;

  if old_row.status<>'HUMAN_REVIEW'
    or old_row.blocker_code is distinct from 'REVIEWER_HUMAN_REVIEW'
    or old_row.review_result->>'decision' is distinct from 'HUMAN_REVIEW'
    or old_row.review_revision>=5 then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','HUMAN_REVIEW_STATE_REQUIRED');
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_correction))<>11
    or not (p_correction ?& array[
      'version','old_job_id','expected_review_sha256',
      'expected_extractor_sha256','source_sha256','graph_sha256',
      'relation_from','relation_to','old_label','new_label','reason'])
    or exists(select 1 from pg_catalog.jsonb_each(p_correction) e
      where pg_catalog.jsonb_typeof(e.value)<>'string')
    or p_correction->>'version' is distinct from 'a-wiki-human-relation-revision-v1'
    or p_correction->>'old_job_id' is distinct from p_job_id::text
    or p_correction->>'expected_review_sha256' is distinct from old_row.review_result_sha256
    or p_correction->>'expected_extractor_sha256' is distinct from old_row.extractor_result_sha256
    or p_correction->>'source_sha256' is distinct from old_row.source_sha256
    or p_correction->>'graph_sha256' is distinct from old_row.graph_sha256
    or pg_catalog.length(pg_catalog.btrim(p_correction->>'new_label')) not between 1 and 160
    or pg_catalog.length(p_correction->>'old_label') not between 1 and 160
    or pg_catalog.length(pg_catalog.btrim(p_correction->>'reason')) not between 1 and 1000
    or p_correction->>'old_label'=p_correction->>'new_label' then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','CORRECTION_BINDING_INVALID');
  end if;

  if old_row.prepared_job->'source'->>'manifest_ref' is distinct from old_row.source_ref
    or old_row.prepared_job->'source'->>'manifest_sha256' is distinct from old_row.source_sha256
    or old_row.prepared_job->>'graph_sha256' is distinct from old_row.graph_sha256
    or old_row.extractor_result->>'job_id' is distinct from old_row.prepared_job->>'job_id'
    or old_row.prepared_job_sha256 is distinct from pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(old_row.prepared_job::text,'UTF8'),'sha256'),'hex')
    or old_row.extractor_result_sha256 is distinct from pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(old_row.extractor_result::text,'UTF8'),'sha256'),'hex')
    or old_row.review_result_sha256 is distinct from pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(old_row.review_result::text,'UTF8'),'sha256'),'hex')
    or old_row.review_result->>'proposal_sha256'
       is distinct from old_row.review_job->'proposal'->>'proposal_sha256' then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','ORIGINAL_PROVENANCE_MISMATCH');
  end if;

  select count(*),pg_catalog.jsonb_agg(r.value)->0 into target_count,original_relation
  from pg_catalog.jsonb_array_elements(old_row.extractor_result->'relations') r(value)
  where r.value->>'from'=p_correction->>'relation_from'
    and r.value->>'to'=p_correction->>'relation_to'
    and r.value->>'kind'='participated_in'
    and r.value->>'label'=p_correction->>'old_label';
  if target_count<>1
    or pg_catalog.jsonb_typeof(original_relation->'evidence')<>'array'
    or pg_catalog.jsonb_array_length(original_relation->'evidence')<1
    or exists (
      select 1 from pg_catalog.jsonb_array_elements_text(original_relation->'evidence') e(id)
      where not exists (
        select 1 from pg_catalog.jsonb_array_elements(old_row.extractor_result->'citations') c
        where c->>'id'=e.id)
    ) then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','RELATION_EVIDENCE_MISMATCH');
  end if;

  select pg_catalog.jsonb_agg(
    case when r.value->>'from'=p_correction->>'relation_from'
      and r.value->>'to'=p_correction->>'relation_to'
      and r.value->>'kind'='participated_in'
      and r.value->>'label'=p_correction->>'old_label'
      then pg_catalog.jsonb_set(r.value,'{label}',pg_catalog.to_jsonb(p_correction->>'new_label'),false)
      else r.value end order by r.n
  ) into corrected_relations
  from pg_catalog.jsonb_array_elements(old_row.extractor_result->'relations')
    with ordinality r(value,n);

  corrected_result := pg_catalog.jsonb_set(old_row.extractor_result,
    '{relations}',corrected_relations,false);
  corrected_sha := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(corrected_result::text,'UTF8'),'sha256'),'hex');
  if corrected_sha=old_row.extractor_result_sha256 then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','NO_SEMANTIC_CHANGE');
  end if;

  -- Original survives with every byte of the old source, Extractor,
  -- fixed proposal and independent Reviewer decision, including HUMAN_REVIEW.
  update survival_ops.a_wiki_native_jobs
    set status='SUPERSEDED' where job_id=old_row.job_id and status='HUMAN_REVIEW';

  insert into survival_ops.a_wiki_native_jobs (
    status,session_id,source_ref,source_sha256,graph_sha256,main_sha_at_prepare,
    prepared_job,prepared_job_sha256,extractor_result,extractor_result_sha256,
    extractor_submitted_at,supersedes_job_id,review_revision
  ) values (
    'EXTRACTOR_SUBMITTED',old_row.session_id,old_row.source_ref,
    old_row.source_sha256,old_row.graph_sha256,old_row.main_sha_at_prepare,
    old_row.prepared_job,old_row.prepared_job_sha256,corrected_result,
    corrected_sha,pg_catalog.clock_timestamp(),old_row.job_id,
    old_row.review_revision+1
  ) returning * into new_row;

  insert into survival_ops.a_wiki_native_review_revision_audits (
    prior_job_id,revised_job_id,correction,prior_extractor_sha256,
    prior_review_sha256,revised_extractor_sha256
  ) values (
    old_row.job_id,new_row.job_id,p_correction,old_row.extractor_result_sha256,
    old_row.review_result_sha256,corrected_sha
  );

  begin
    dispatch_id := survival_ops.dispatch_a_wiki_native_finalizer('human_review_revision');
  exception when others then
    dispatch_id := null;
  end;

  return pg_catalog.jsonb_build_object(
    'status','EXTRACTOR_SUBMITTED','job_id',new_row.job_id,
    'prior_job_id',old_row.job_id,'review_revision',new_row.review_revision,
    'result_sha256',corrected_sha,'dispatch_request_id',dispatch_id
  );
end;
$revision$;

revoke all on function public.archive_a_wiki_native_job_revise_human_relation(uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.archive_a_wiki_native_job_revise_human_relation(uuid,jsonb)
  to service_role;

commit;
