-- Forward recovery after EX-001 pilot; count all new rows, including later BLOCKED outcomes.
-- Extend the merged EX-001 source contract for deterministic seed selection and four daily runs.
-- EX-001 only: admit an explicitly prepared user experience as question provenance.
-- Existing scheduled C-PREP selection and public source kinds are unchanged.
alter table survival_ops.knowledge_semantic_jobs drop constraint if exists knowledge_semantic_jobs_source_kind_check;
alter table survival_ops.knowledge_semantic_jobs add constraint knowledge_semantic_jobs_source_kind_check check (source_kind in ('PUBLIC_ARCHIVE','PUBLIC_READER','USER_REPORTED_EXPERIENCE'));

create or replace function public.archive_knowledge_semantic_job_prepare(
  p_job_type text,
  p_source_kind text,
  p_source_ref text,
  p_source_sha256 text,
  p_work_key text,
  p_policy_version text,
  p_policy_sha256 text,
  p_policy_pin jsonb,
  p_main_sha text,
  p_semantic_context jsonb,
  p_initial_status text default 'PREPARED',
  p_blocker_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created survival_ops.knowledge_semantic_jobs%rowtype;
  active_job survival_ops.knowledge_semantic_jobs%rowtype;
begin
  if p_job_type is null or p_job_type not in ('FRESH_BRIEF','BACKFILL_BRIEF')
     or p_source_kind is null or p_source_kind not in ('PUBLIC_ARCHIVE','PUBLIC_READER','USER_REPORTED_EXPERIENCE')
     or (p_source_kind = 'USER_REPORTED_EXPERIENCE' and (p_job_type <> 'FRESH_BRIEF' or p_source_ref !~ '^knowledge/content/experience-seeds/EX-[0-9]{3,}-[a-z0-9-]+[.]json$'))
     or p_source_ref is null or p_work_key is null or p_policy_version is null
     or p_policy_sha256 is null or p_source_sha256 is null or p_main_sha is null
     or p_source_sha256 !~ '^[a-f0-9]{64}$'
     or p_policy_sha256 !~ '^[a-f0-9]{64}$'
     or p_main_sha !~ '^[a-f0-9]{40}$'
     or p_initial_status is null or p_initial_status not in ('PREPARED','BLOCKED')
     or p_policy_pin is null or pg_catalog.jsonb_typeof(p_policy_pin) is distinct from 'object'
     or p_semantic_context is null or pg_catalog.jsonb_typeof(p_semantic_context) is distinct from 'object' then
    raise exception 'KNOWLEDGE_SEMANTIC_PREPARE_INVALID';
  end if;

  -- Serialize admission, then reuse an existing job before applying the new-job cap.
  perform pg_catalog.pg_advisory_xact_lock(724015);
  select * into active_job from survival_ops.knowledge_semantic_jobs
    where source_kind=p_source_kind and source_ref=p_source_ref and source_sha256=p_source_sha256 and job_type=p_job_type;
  if found then
    return pg_catalog.jsonb_build_object('status','EXISTING_JOB','job_id',active_job.job_id,'job_status',active_job.status);
  end if;
  if (select count(*) from survival_ops.knowledge_semantic_jobs
      where (created_at at time zone 'Asia/Seoul')::date = (clock_timestamp() at time zone 'Asia/Seoul')::date) >= 4 then
    return pg_catalog.jsonb_build_object('status','DAILY_LIMIT_REACHED','created',false);
  end if;

  insert into survival_ops.knowledge_semantic_jobs (
    job_type, status, source_kind, source_ref, source_sha256, work_key,
    policy_version, policy_sha256, policy_pin, main_sha_at_prepare,
    semantic_context, blocker_code, blocker_stage, finalized_at
  ) values (
    p_job_type, p_initial_status, p_source_kind, p_source_ref, p_source_sha256, p_work_key,
    p_policy_version, p_policy_sha256, p_policy_pin, p_main_sha,
    p_semantic_context, p_blocker_code,
    case when p_initial_status = 'BLOCKED' then 'PREP' else null end,
    case when p_initial_status = 'BLOCKED' then clock_timestamp() else null end
  )
  on conflict (source_kind, source_ref, source_sha256, job_type) do nothing
  returning * into created;

  if found then
    return pg_catalog.jsonb_build_object('status',created.status,'job_id',created.job_id,'created',true);
  end if;

  select * into active_job from survival_ops.knowledge_semantic_jobs
    where source_kind=p_source_kind and source_ref=p_source_ref and source_sha256=p_source_sha256 and job_type=p_job_type;
  if found then
    return pg_catalog.jsonb_build_object('status','EXISTING_JOB','job_id',active_job.job_id,'job_status',active_job.status);
  end if;

  select * into active_job from survival_ops.knowledge_semantic_jobs
    where status not in ('PUBLISHED','HOLD','BLOCKED') order by prepared_at limit 1;
  if found then
    return pg_catalog.jsonb_build_object('status','ACTIVE_JOB_EXISTS','job_id',active_job.job_id,'job_status',active_job.status);
  end if;

  raise exception 'KNOWLEDGE_SEMANTIC_PREPARE_RACE';
exception when unique_violation then
  select * into active_job from survival_ops.knowledge_semantic_jobs
    where status not in ('PUBLISHED','HOLD','BLOCKED') order by prepared_at limit 1;
  if found then
    return pg_catalog.jsonb_build_object('status','ACTIVE_JOB_EXISTS','job_id',active_job.job_id,'job_status',active_job.status);
  end if;
  raise;
end;
$$;

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
$function$;

revoke all on function public.archive_knowledge_semantic_job_prepare(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.archive_knowledge_semantic_job_prepare(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text) to service_role;
revoke all on function public.archive_knowledge_semantic_job_submit(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.archive_knowledge_semantic_job_submit(uuid,text,text,jsonb) to service_role;

-- Keep the same named C-PREP jobs and finalizer. pg_cron updates a named schedule in place.
select cron.schedule('afterfall-knowledge-semantic-prep-am', '45 20,2 * * *',
  $$select survival_ops.dispatch_knowledge_semantic_prep('supabase_cron_am');$$);
select cron.schedule('afterfall-knowledge-semantic-prep-pm', '45 8,14 * * *',
  $$select survival_ops.dispatch_knowledge_semantic_prep('supabase_cron_pm');$$);
