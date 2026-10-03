-- Tighten the C3 semantic submit boundary so malformed packages never leave PREPARED.
create or replace function public.archive_knowledge_semantic_job_submit(
  p_job_id uuid,
  p_source_ref text,
  p_source_sha256 text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target survival_ops.knowledge_semantic_jobs%rowtype;
  result_sha text;
  decision text;
  candidate jsonb;
  evidence jsonb;
  brief jsonb;
  source jsonb;
  target_ids jsonb;
begin
  if p_job_id is null or p_source_ref is null or p_source_sha256 is null or p_source_sha256 !~ '^[a-f0-9]{64}$'
     or p_result is null or pg_catalog.jsonb_typeof(p_result) <> 'object'
     or pg_catalog.pg_column_size(p_result) > 524288 then
    raise exception 'KNOWLEDGE_SEMANTIC_SUBMIT_INVALID';
  end if;

  if p_result->>'version' is distinct from 'knowledge-semantic-result-v1'
     or p_result->>'job_id' is distinct from p_job_id::text then
    raise exception 'KNOWLEDGE_SEMANTIC_RESULT_CONTRACT_INVALID';
  end if;

  decision := p_result->>'decision';
  if decision is null or decision not in ('BRIEF_READY','HOLD','HUMAN_REVIEW') then
    raise exception 'KNOWLEDGE_SEMANTIC_DECISION_INVALID';
  end if;

  if decision in ('BRIEF_READY','HUMAN_REVIEW') and (
       pg_catalog.jsonb_typeof(p_result->'candidate') is distinct from 'object'
       or pg_catalog.jsonb_typeof(p_result->'evidence') is distinct from 'object'
       or pg_catalog.jsonb_typeof(p_result->'brief') is distinct from 'object') then
    raise exception 'KNOWLEDGE_SEMANTIC_BRIEF_PACKAGE_REQUIRED';
  end if;

  if decision in ('HOLD','HUMAN_REVIEW') and
      (pg_catalog.jsonb_typeof(p_result->'code') is distinct from 'string'
       or pg_catalog.jsonb_typeof(p_result->'note') is distinct from 'string') then
    raise exception 'KNOWLEDGE_SEMANTIC_DISPOSITION_REQUIRED';
  end if;

  select * into target
  from survival_ops.knowledge_semantic_jobs
  where job_id = p_job_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','JOB_NOT_FOUND');
  end if;

  if target.source_ref <> p_source_ref or target.source_sha256 <> p_source_sha256 then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','SOURCE_BINDING_MISMATCH');
  end if;

  result_sha := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_result::text,'UTF8'),'sha256'),
    'hex'
  );

  -- Preserve duplicate-submit idempotency for already handled historical jobs.
  if target.status <> 'PREPARED' then
    if target.semantic_result_sha256 = result_sha then
      return pg_catalog.jsonb_build_object('status','ALREADY_SUBMITTED','job_id',target.job_id);
    end if;
    if target.semantic_result_sha256 is not null then
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','RESULT_CONFLICT');
    end if;
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','JOB_NOT_PREPARED');
  end if;

  if decision in ('BRIEF_READY','HUMAN_REVIEW') then
    candidate := p_result->'candidate';
    evidence := p_result->'evidence';
    brief := p_result->'brief';
    source := target.semantic_context->'source';
    target_ids := target.semantic_context->'target';

    if candidate->>'status' is distinct from 'BRIEF_PROPOSED'
       or brief->>'content_type' is distinct from 'BRIEF'
       or brief->>'status' is distinct from 'READY'
       or nullif(pg_catalog.btrim(candidate->>'question'),'') is null
       or candidate->>'question' is distinct from evidence->>'question'
       or candidate->>'question' is distinct from brief->>'title' then
      return pg_catalog.jsonb_build_object(
        'status','REJECTED','reason','PACKAGE_CORE_CONTRACT_INVALID'
      );
    end if;

    if candidate->>'id' is distinct from target_ids->>'candidate_id'
       or brief->>'id' is distinct from target_ids->>'brief_id'
       or candidate->>'brief_id' is distinct from brief->>'id'
       or evidence->>'brief_id' is distinct from brief->>'id'
       or candidate->>'topic_id' is distinct from brief->>'topic_id'
       or (p_result ? 'topic' and p_result->'topic'->>'id' is distinct from brief->>'topic_id') then
      return pg_catalog.jsonb_build_object(
        'status','REJECTED','reason','PACKAGE_BINDING_INVALID'
      );
    end if;

    if candidate->>'source_kind' is distinct from target.source_kind
       or candidate->>'source_kind' is distinct from source->>'kind' then
      return pg_catalog.jsonb_build_object(
        'status','REJECTED','reason','PACKAGE_SOURCE_BINDING_INVALID'
      );
    end if;

    if target.source_kind = 'PUBLIC_ARCHIVE' then
      if candidate->>'source_manifest_ref' is distinct from target.source_ref
         or candidate->>'source_manifest_sha256' is distinct from target.source_sha256 then
        return pg_catalog.jsonb_build_object(
          'status','REJECTED','reason','PACKAGE_SOURCE_BINDING_INVALID'
        );
      end if;
    elsif target.source_kind = 'PUBLIC_READER' then
      if candidate->>'reader_book_ref' is distinct from 'archive/content/stories/C03-AFTERFALL/BOOK.json'
         or candidate->>'reader_book_sha256' is distinct from source->>'reader_book_sha256'
         or candidate->>'reader_chapter_id' is distinct from source->>'chapter_id'
         or candidate->>'reader_chapter_sha256' is distinct from source->>'chapter_sha256'
         or candidate->'source_refs' is distinct from source->'refs'
         or candidate->'source_hashes' is distinct from source->'hashes' then
        return pg_catalog.jsonb_build_object(
          'status','REJECTED','reason','PACKAGE_SOURCE_BINDING_INVALID'
        );
      end if;
    end if;

    if pg_catalog.jsonb_typeof(evidence->'claims') is distinct from 'array'
       or pg_catalog.jsonb_array_length(evidence->'claims') = 0 then
      return pg_catalog.jsonb_build_object(
        'status','REJECTED','reason','PACKAGE_EVIDENCE_REQUIRED'
      );
    end if;

    if decision = 'BRIEF_READY' and (
         brief->>'risk_level' is distinct from 'LOW'
         or brief->>'publication_policy' is distinct from 'AUTO_LOW_RISK'
         or brief->>'semantic_qa_status' is distinct from 'PASS'
         or p_result ? 'code'
         or p_result ? 'note') then
      return pg_catalog.jsonb_build_object(
        'status','REJECTED','reason','PACKAGE_AUTO_POLICY_INVALID'
      );
    elsif decision = 'HUMAN_REVIEW' and
          brief->>'publication_policy' is distinct from 'HUMAN_APPROVED' then
      return pg_catalog.jsonb_build_object(
        'status','REJECTED','reason','PACKAGE_REVIEW_POLICY_INVALID'
      );
    end if;
  end if;

  update survival_ops.knowledge_semantic_jobs
    set semantic_result = p_result,
        semantic_result_sha256 = result_sha,
        result_decision = decision,
        status = 'SUBMITTED',
        submitted_at = clock_timestamp(),
        finalized_at = null,
        blocker_code = null,
        blocker_stage = null
  where job_id = p_job_id and status = 'PREPARED';

  return pg_catalog.jsonb_build_object(
    'status','ACCEPTED',
    'job_id',p_job_id,
    'result_sha256',result_sha
  );
end;
$function$;

revoke all on function public.archive_knowledge_semantic_job_submit(uuid,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.archive_knowledge_semantic_job_submit(uuid,text,text,jsonb)
  to service_role;
