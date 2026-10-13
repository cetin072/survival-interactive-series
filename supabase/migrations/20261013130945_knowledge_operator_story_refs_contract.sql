begin;

-- Invoked inside the existing authenticated Operator RPC; no new table or API.
create or replace function survival_ops.knowledge_operator_status_v2()
returns jsonb language sql stable security invoker set search_path = ''
as $function$
  with jobs as (
    select j.*, j.semantic_context#>>'{target,brief_id}' as brief_id,
      case
        when j.status='PREPARED' and clock_timestamp()-j.prepared_at > interval '12 hours' then 'SEMANTIC_WORKER_NOT_CONSUMED'
        when j.status in ('SUBMITTED','FINALIZING') and clock_timestamp()-coalesce(j.finalizing_at,j.submitted_at,j.updated_at) > interval '15 minutes' then 'FINALIZER_STALLED'
        when j.status='PR_OPEN' and clock_timestamp()-j.updated_at > interval '6 hours' then 'KNOWLEDGE_PR_STALLED'
        else null end as stalled_code,
      j.status='BLOCKED' and not exists (
        -- Legacy reused reservations cannot be recovered once their brief ID
        -- is published. Keep those immutable rows as historical evidence.
        select 1 from survival_ops.knowledge_semantic_jobs done
        where done.status='PUBLISHED'
          and done.semantic_context#>>'{target,brief_id}'=j.semantic_context#>>'{target,brief_id}'
      ) as actionable
    from survival_ops.knowledge_semantic_jobs j
  ), summaries as (
    select j.*, jsonb_build_object(
      'job_id',job_id,'brief_id',brief_id,'job_type',job_type,'status',status,
      'source_kind',source_kind,'source_ref',source_ref,'prepared_at',prepared_at,
      'submitted_at',submitted_at,'published_at',published_at,'stalled_code',stalled_code,
      'result_decision',result_decision,'final_pr_number',final_pr_number,
      'final_head_sha',final_head_sha,'merge_sha',merge_sha,
      'blocker_code',case when status='BLOCKED' then blocker_code else null end,
      'blocker_stage',case when status='BLOCKED' then blocker_stage else null end,
      'disposition_code',case when status='HOLD' then blocker_code else null end,
      'finalizer_attempt_count',finalizer_attempt_count
    ) as summary from jobs j
  )
  select jsonb_build_object(
    'machine_active_count',count(*) filter(where status in ('PREPARED','SUBMITTED','FINALIZING','PR_OPEN')),
    'active_count',count(*) filter(where status in ('PREPARED','SUBMITTED','FINALIZING','PR_OPEN')),
    'human_review_count',count(*) filter(where status='HUMAN_REVIEW'),
    'unresolved_blocked_count',count(*) filter(where actionable),
    'machine_stalled_count',count(*) filter(where stalled_code is not null),
    'latest_job',(select summary from summaries order by prepared_at desc,job_id desc limit 1),
    'latest_published_job',(select summary from summaries where status='PUBLISHED' order by published_at desc nulls last,prepared_at desc,job_id desc limit 1),
    'latest_blocked_job',(select summary from summaries where actionable order by prepared_at desc,job_id desc limit 1),
    'latest_machine_job',(select summary from summaries where status in ('PREPARED','SUBMITTED','FINALIZING','PR_OPEN') order by prepared_at desc,job_id desc limit 1),
    'latest_stalled_job',(select summary from summaries where stalled_code is not null order by prepared_at desc,job_id desc limit 1),
    'prep',(select jsonb_build_object('last_status',last_status,'last_stage',last_stage,
      'blocker_code',blocker_code,'source_ref',source_ref,'source_sha256',source_sha256,
      'main_sha',main_sha,'backfill_last_attempted_at',backfill_last_attempted_at,'checked_at',checked_at)
      from survival_ops.knowledge_semantic_prep_runs where singleton)
  ) from summaries;
$function$;
revoke all on function survival_ops.knowledge_operator_status_v2() from public,anon,authenticated,service_role;

-- Preserve the existing authenticated public RPC and all A/B/inbox fields.
-- Main has a private base function; isolated older DB fixtures have it public.
-- Fail closed if neither known definition can be upgraded.
do $migration$
declare fn regprocedure; definition text; old_block text; new_definition text; changed integer := 0;
begin
  foreach fn in array array[
    to_regprocedure('survival_ops.archive_operator_system_status_without_a_wiki_v1()'),
    to_regprocedure('public.archive_operator_system_status()')
  ] loop
    if fn is null then continue; end if;
    definition := pg_get_functiondef(fn);
    if position('-- C · Semantic: keep the current live semantic job/prep source.' in definition)=0 then continue; end if;
    new_definition := regexp_replace(definition,
      '  -- C · Semantic: keep the current live semantic job/prep source\.[\s\S]*?  return pg_catalog.jsonb_build_object',
      '  return pg_catalog.jsonb_build_object');
    old_block := '''knowledge_semantic'', pg_catalog.jsonb_build_object(
      ''active_count'', knowledge_active_count,
      ''latest_job'', knowledge_latest,
      ''prep'', knowledge_prep
    )';
    if position(old_block in new_definition)=0 then raise exception 'KNOWLEDGE_OPERATOR_UPGRADE_CONTRACT_CHANGED'; end if;
    new_definition := replace(new_definition,old_block,
      '''knowledge_semantic'', survival_ops.knowledge_operator_status_v2()');
    execute new_definition;
    changed := changed+1;
  end loop;
  if changed=0 then raise exception 'KNOWLEDGE_OPERATOR_BASE_MISSING'; end if;
end;
$migration$;

CREATE OR REPLACE FUNCTION public.archive_knowledge_semantic_job_submit(p_job_id uuid, p_source_ref text, p_source_sha256 text, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- New submissions use registry IDs from PREP; legacy prepared contexts
    -- without a registry list can safely submit only []. Stored results are
    -- never rewritten, including ALREADY_SUBMITTED duplicate requests.
    if jsonb_typeof(p_result#>'{brief,story_refs}') is distinct from 'array' then
      return jsonb_build_object('status','REJECTED','reason','PACKAGE_STORY_REFS_INVALID');
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_result#>'{brief,story_refs}') ref
      where jsonb_typeof(ref) is distinct from 'string'
        or (ref#>>'{}') !~ '^[a-z0-9][a-z0-9-]*$'
        or not coalesce(target.semantic_context->'story_registry_ids','[]'::jsonb) @> jsonb_build_array(ref)
    ) then
      return jsonb_build_object('status','REJECTED','reason','PACKAGE_STORY_REFS_INVALID');
    end if;

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
    elsif target.source_kind = 'USER_REPORTED_EXPERIENCE' then
      if target.source_ref !~ '^knowledge/content/experience-seeds/EX-[0-9]{3,}-[a-z0-9-]+[.]json$'
         or candidate->>'source_ref' is distinct from target.source_ref
         or candidate->>'source_sha256' is distinct from target.source_sha256
         or decision <> 'HUMAN_REVIEW'
         or evidence->>'story_source_status' is distinct from 'USER_REPORTED_EXPERIENCE'
         or evidence->'experience_provenance'->>'source_ref' is distinct from target.source_ref
         or evidence->'experience_provenance'->>'source_sha256' is distinct from target.source_sha256
         or (target.source_ref = 'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json'
           and (brief->>'risk_level' is distinct from 'HIGH'
             or coalesce(brief->'risk_domains' ? 'ELECTRICAL', false) is not true)) then
        return pg_catalog.jsonb_build_object(
          'status','REJECTED','reason','PACKAGE_EXPERIENCE_SOURCE_INVALID'
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
$function$

;

commit;
