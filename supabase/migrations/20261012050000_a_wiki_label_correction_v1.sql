-- One immutable source-bound overlay; never edit the original semantic payload.
begin;
alter table survival_ops.a_wiki_native_jobs add column label_correction jsonb,
  add constraint a_wiki_label_correction_envelope check (label_correction is null
    or (jsonb_typeof(label_correction)='object' and pg_column_size(label_correction)<=8192));

create function survival_ops.a_wiki_label_correction_valid(
  p_row survival_ops.a_wiki_native_jobs,p_correction jsonb
) returns boolean language plpgsql set search_path = '' as $$
declare
  v_node jsonb;
  v_citation jsonb;
  v_block jsonb;
  v_count integer;
  v_start integer;
begin
  if p_correction is null or pg_catalog.jsonb_typeof(p_correction) is distinct from 'object'
    or pg_catalog.pg_column_size(p_correction)>8192 then return false; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_correction))<>12
    or not (p_correction ?& array['version','job_id','extractor_result_sha256','prepared_job_sha256',
      'source_sha256','graph_sha256','node_key','old_label','new_label','citation_id','block_id','reason'])
    or exists(select 1 from pg_catalog.jsonb_each(p_correction) e where pg_catalog.jsonb_typeof(e.value)<>'string')
    or p_correction->>'version' is distinct from 'a-wiki-label-correction-v1'
    or p_correction->>'job_id' is distinct from p_row.job_id::text
    or p_row.extractor_result_sha256 is null or p_row.extractor_result is null
    or p_correction->>'extractor_result_sha256' is distinct from p_row.extractor_result_sha256
    or p_correction->>'prepared_job_sha256' is distinct from p_row.prepared_job_sha256
    or p_correction->>'source_sha256' is distinct from p_row.source_sha256
    or p_correction->>'graph_sha256' is distinct from p_row.graph_sha256
    or p_row.source_sha256 is distinct from p_row.prepared_job->'source'->>'manifest_sha256'
    or p_row.graph_sha256 is distinct from p_row.prepared_job->>'graph_sha256'
    or p_row.extractor_result_sha256 is distinct from pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_row.extractor_result::text,'UTF8'),'sha256'),'hex')
    or p_row.prepared_job_sha256 is distinct from pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_row.prepared_job::text,'UTF8'),'sha256'),'hex')
    or pg_catalog.length(pg_catalog.btrim(p_correction->>'new_label')) not between 1 and 120
    or pg_catalog.length(p_correction->>'old_label') not between 1 and 120
    or pg_catalog.length(pg_catalog.btrim(p_correction->>'reason')) not between 1 and 1000
    or p_correction->>'new_label'=p_correction->>'old_label' then return false; end if;
  select pg_catalog.count(*),pg_catalog.jsonb_agg(n)->0 into v_count,v_node
    from pg_catalog.jsonb_array_elements(p_row.extractor_result->'nodes') n
    where n->>'key'=p_correction->>'node_key';
  if v_count<>1 or v_node->'existing_id' is distinct from 'null'::jsonb
    or v_node->>'type' not in ('location','character')
    or v_node->>'label' is distinct from p_correction->>'old_label'
    or not coalesce(v_node->'evidence'->'label' ? (p_correction->>'citation_id'),false) then return false; end if;
  select pg_catalog.count(*),pg_catalog.jsonb_agg(c)->0 into v_count,v_citation
    from pg_catalog.jsonb_array_elements(p_row.extractor_result->'citations') c
    where c->>'id'=p_correction->>'citation_id';
  if v_count<>1 or v_citation->>'block_id' is distinct from p_correction->>'block_id'
    or coalesce(pg_catalog.strpos(v_citation->>'quote',p_correction->>'new_label'),0)<1 then return false; end if;
  select pg_catalog.count(*),pg_catalog.jsonb_agg(b)->0 into v_count,v_block
    from pg_catalog.jsonb_array_elements(p_row.prepared_job->'source'->'gm_blocks') b
    where b->>'block_id'=p_correction->>'block_id';
  if v_count<>1 or v_citation->>'quote' is null or pg_catalog.length(v_citation->>'quote')=0 then return false; end if;
  v_start := pg_catalog.strpos(v_block->>'text',v_citation->>'quote');
  if coalesce(v_start,0)<1 or pg_catalog.strpos(pg_catalog.substr(v_block->>'text',v_start+1),v_citation->>'quote')>0
    or v_block->>'sha256' is distinct from pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_block->>'text','UTF8'),'sha256'),'hex') then return false; end if;
  return true;
exception when invalid_parameter_value then return false;
end;
$$;
revoke all on function survival_ops.a_wiki_label_correction_valid(survival_ops.a_wiki_native_jobs,jsonb) from public,anon,authenticated;

-- Existing guard, with only the validated one-time transition added below.
create or replace function survival_ops.guard_a_wiki_native_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
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
    if old.status in ('PUBLISHED','HUMAN_REVIEW','REJECT','SUPERSEDED') then
      raise exception 'A_WIKI_NATIVE_TERMINAL_IMMUTABLE';
    end if;
    if old.job_id is distinct from new.job_id
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
$;

create function public.archive_a_wiki_native_job_correct_label(p_job_id uuid,p_correction jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target survival_ops.a_wiki_native_jobs%rowtype;
begin
  select * into target from survival_ops.a_wiki_native_jobs where job_id=p_job_id for update;
  if not found then return pg_catalog.jsonb_build_object('status','NOT_FOUND'); end if;
  if target.label_correction is not null then
    if target.label_correction=p_correction then
      return pg_catalog.jsonb_build_object('status','ALREADY_APPLIED','job_id',target.job_id,'job_status',target.status);
    end if;
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','CORRECTION_ALREADY_EXISTS');
  end if;
  if target.status is distinct from 'BLOCKED'
    or target.blocker_code is distinct from 'WIKI_NEW_NAME_NOT_IN_EVIDENCE' then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','BLOCKER_MISMATCH');
  end if;
  if not survival_ops.a_wiki_label_correction_valid(target,p_correction) then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','CORRECTION_INVALID');
  end if;
  update survival_ops.a_wiki_native_jobs set label_correction=p_correction,
    status='EXTRACTOR_SUBMITTED',blocker_code=null
    where job_id=p_job_id and status='BLOCKED';
  return pg_catalog.jsonb_build_object('status','EXTRACTOR_SUBMITTED','job_id',target.job_id);
end;
$$;
revoke all on function public.archive_a_wiki_native_job_correct_label(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.archive_a_wiki_native_job_correct_label(uuid,jsonb) to service_role;
commit;
