-- Guarded human approval for C3 jobs whose original BRIEF_READY was routed
-- to HUMAN_REVIEW by the actual publication gate. Only current HUMAN_REVIEW
-- jobs can be edited; exact job/review bindings, operator auth, draft revision,
-- locked evidence fields and the existing downstream publication checks remain.
-- Never rewrite historical semantic_result or risk/QA status in this migration.

CREATE OR REPLACE FUNCTION survival_ops.private_validate_knowledge_operator_draft(p_job_id uuid, p_draft_brief jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  j survival_ops.knowledge_semantic_jobs%rowtype;
  original_brief jsonb;
  section_value jsonb;
  block_value jsonb;
  field_name text;
begin
  select * into j from survival_ops.knowledge_semantic_jobs where job_id=p_job_id;
  if not found then
    raise exception using errcode='P0002', message='KNOWLEDGE_OPERATOR_JOB_NOT_FOUND';
  end if;
  if j.status <> 'HUMAN_REVIEW' or (j.result_decision IS NULL OR j.result_decision NOT IN ('HUMAN_REVIEW','BRIEF_READY')) then
    raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_JOB_NOT_EDITABLE';
  end if;
  if j.semantic_result_sha256 is null or j.semantic_result is null then
    raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_BASE_RESULT_MISSING';
  end if;
  original_brief := j.semantic_result->'brief';
  if jsonb_typeof(original_brief) <> 'object' or jsonb_typeof(p_draft_brief) <> 'object' then
    raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_DRAFT_BRIEF_REQUIRED';
  end if;

  -- Keep machine-owned identity, evidence boundary and source metadata fixed in v1.
  foreach field_name in array array[
    'id','slug','topic_id','content_type','title','risk_level','risk_domains',
    'publication_policy','sources','tools','story_refs','related_brief_ids',
    'guide_id','source_checked_at','ai_assisted'
  ] loop
    if p_draft_brief->field_name is distinct from original_brief->field_name then
      raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_DRAFT_METADATA_LOCKED';
    end if;
  end loop;

  if p_draft_brief->>'status' <> 'READY' then
    raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_DRAFT_STATUS_INVALID';
  end if;
  if coalesce(p_draft_brief->>'semantic_qa_status','') not in ('REVIEW','PASS') then
    raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_DRAFT_QA_INVALID';
  end if;
  foreach field_name in array array[
    'summary','meta_description','lead','label','scope','basis','footer','editorial_note'
  ] loop
    if nullif(btrim(p_draft_brief->>field_name),'') is null then
      raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_DRAFT_TEXT_REQUIRED';
    end if;
  end loop;

  if jsonb_typeof(p_draft_brief->'sections') <> 'array'
     or jsonb_array_length(p_draft_brief->'sections') < 1 then
    raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_DRAFT_SECTIONS_REQUIRED';
  end if;

  for section_value in select value from jsonb_array_elements(p_draft_brief->'sections') loop
    if nullif(btrim(section_value->>'heading'),'') is null
       or jsonb_typeof(section_value->'blocks') <> 'array'
       or jsonb_array_length(section_value->'blocks') < 1 then
      raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_DRAFT_SECTION_INVALID';
    end if;
    for block_value in select value from jsonb_array_elements(section_value->'blocks') loop
      if block_value->>'type' not in (
        'prose','note','table','ordered_list','unordered_list','download/tool','image','youtube'
      ) then
        raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_DRAFT_BLOCK_INVALID';
      end if;
      if block_value->>'type' in ('prose','note')
         and nullif(btrim(block_value->>'text'),'') is null then
        raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_DRAFT_BLOCK_TEXT_REQUIRED';
      end if;
      if block_value->>'type' in ('ordered_list','unordered_list')
         and (jsonb_typeof(block_value->'items') <> 'array' or jsonb_array_length(block_value->'items') < 1) then
        raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_DRAFT_LIST_REQUIRED';
      end if;
      if block_value->>'type'='image'
         and ((block_value->>'src') !~ '^https://'
              or nullif(btrim(block_value->>'alt'),'') is null) then
        raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_DRAFT_IMAGE_INVALID';
      end if;
      if block_value->>'type'='youtube'
         and ((block_value->>'url') !~ '^https://([^/]+\.)?(youtube\.com|youtu\.be)/'
              or nullif(btrim(block_value->>'title'),'') is null) then
        raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_DRAFT_YOUTUBE_INVALID';
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'brief_id',original_brief->>'id',
    'candidate_id',j.semantic_result->'candidate'->>'id',
    'base_semantic_result_sha256',j.semantic_result_sha256
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.archive_operator_knowledge_publish(p_job_id uuid, p_expected_revision integer, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  j survival_ops.knowledge_semantic_jobs%rowtype;
  d survival_ops.knowledge_operator_drafts%rowtype;
  review_row survival_ops.archive_review_items%rowtype;
  note_value text := nullif(btrim(p_note),'');
begin
  actor_id := survival_ops.private_require_archive_operator();
  if note_value is not null and char_length(note_value)>1000 then
    raise exception using errcode='22023', message='SURVIVAL_ARCHIVE_DECISION_NOTE_TOO_LONG';
  end if;

  select * into j from survival_ops.knowledge_semantic_jobs where job_id=p_job_id for update;
  if not found or j.status<>'HUMAN_REVIEW' or (j.result_decision IS NULL OR j.result_decision NOT IN ('HUMAN_REVIEW','BRIEF_READY')) then
    raise exception using errcode='22023', message='KNOWLEDGE_OPERATOR_JOB_NOT_PUBLISHABLE';
  end if;
  select * into d from survival_ops.knowledge_operator_drafts where job_id=p_job_id for update;
  if not found or d.revision is distinct from p_expected_revision then
    raise exception using errcode='40001', message='KNOWLEDGE_OPERATOR_DRAFT_REVISION_CONFLICT';
  end if;
  perform survival_ops.private_validate_knowledge_operator_draft(p_job_id,d.draft_brief);

  select * into review_row
  from survival_ops.archive_review_items item
  where item.source_worker='C_KNOWLEDGE'
    and item.item_type='KNOWLEDGE'
    and item.status='PENDING'
    and item.payload->>'brief_id'=d.brief_id
    and (
      (j.final_head_sha is not null and item.payload->>'head_sha'=j.final_head_sha)
      or (j.final_pr_number is not null and item.payload->>'pr_number'=j.final_pr_number::text)
    )
  order by item.created_at desc, item.id desc
  limit 1
  for update;
  if not found then
    raise exception using errcode='P0002', message='KNOWLEDGE_OPERATOR_REVIEW_ITEM_NOT_FOUND';
  end if;

  update survival_ops.archive_review_items
  set payload = payload || jsonb_build_object(
      'operator_job_id',p_job_id::text,
      'operator_candidate_id',j.semantic_result->'candidate'->>'id',
      'operator_draft_revision',d.revision,
      'operator_draft_sha256',d.draft_sha256
    ),
    updated_at=clock_timestamp()
  where id=review_row.id;

  return public.archive_operator_decide_review_item(review_row.id,'APPROVED',note_value);
end;
$function$;
