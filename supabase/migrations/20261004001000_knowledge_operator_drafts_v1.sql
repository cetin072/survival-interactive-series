-- Knowledge Operator structured draft editor v1.
-- Keep immutable C3 semantic_result as the audit source; human edits live in a small overlay.

create table if not exists survival_ops.knowledge_operator_drafts (
  job_id uuid primary key references survival_ops.knowledge_semantic_jobs(job_id) on delete restrict,
  brief_id text not null check (brief_id ~ '^K-[0-9]+$'),
  base_semantic_result_sha256 text not null check (base_semantic_result_sha256 ~ '^[a-f0-9]{64}$'),
  draft_brief jsonb not null check (jsonb_typeof(draft_brief)='object' and pg_column_size(draft_brief) <= 262144),
  draft_sha256 text not null check (draft_sha256 ~ '^[a-f0-9]{64}$'),
  revision integer not null default 1 check (revision > 0),
  edited_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table survival_ops.knowledge_operator_drafts enable row level security;
drop policy if exists knowledge_operator_drafts_client_deny on survival_ops.knowledge_operator_drafts;
create policy knowledge_operator_drafts_client_deny
  on survival_ops.knowledge_operator_drafts for all to anon, authenticated
  using (false) with check (false);
revoke all on survival_ops.knowledge_operator_drafts from public, anon, authenticated, service_role;

create or replace function survival_ops.private_validate_knowledge_operator_draft(
  p_job_id uuid,
  p_draft_brief jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
  if j.status <> 'HUMAN_REVIEW' or j.result_decision <> 'HUMAN_REVIEW' then
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
$$;
revoke all on function survival_ops.private_validate_knowledge_operator_draft(uuid,jsonb) from public, anon, authenticated, service_role;

create or replace function public.archive_operator_knowledge_draft_get(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid;
  j survival_ops.knowledge_semantic_jobs%rowtype;
  d survival_ops.knowledge_operator_drafts%rowtype;
  review_row survival_ops.archive_review_items%rowtype;
begin
  actor_id := survival_ops.private_require_archive_operator();
  select * into j from survival_ops.knowledge_semantic_jobs where job_id=p_job_id;
  if not found then
    raise exception using errcode='P0002', message='KNOWLEDGE_OPERATOR_JOB_NOT_FOUND';
  end if;
  select * into d from survival_ops.knowledge_operator_drafts where job_id=p_job_id;

  select * into review_row
  from survival_ops.archive_review_items item
  where item.source_worker='C_KNOWLEDGE'
    and item.item_type='KNOWLEDGE'
    and item.payload->>'brief_id'=coalesce(j.semantic_result->'brief'->>'id',j.semantic_context->'target'->>'brief_id')
    and (
      (j.final_head_sha is not null and item.payload->>'head_sha'=j.final_head_sha)
      or (j.final_pr_number is not null and item.payload->>'pr_number'=j.final_pr_number::text)
    )
  order by item.created_at desc, item.id desc
  limit 1;

  return jsonb_build_object(
    'job_id',j.job_id,
    'editable',j.status='HUMAN_REVIEW' and coalesce(review_row.status,'')='PENDING',
    'review_item_id',review_row.id,
    'review_status',review_row.status,
    'revision',coalesce(d.revision,0),
    'draft_sha256',d.draft_sha256,
    'updated_at',d.updated_at,
    'brief',coalesce(d.draft_brief,j.semantic_result->'brief')
  );
end;
$$;

create or replace function public.archive_operator_knowledge_draft_save(
  p_job_id uuid,
  p_expected_revision integer,
  p_draft_brief jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid;
  validated jsonb;
  existing survival_ops.knowledge_operator_drafts%rowtype;
  next_revision integer;
  next_sha text;
  approved_count integer;
begin
  actor_id := survival_ops.private_require_archive_operator();
  validated := survival_ops.private_validate_knowledge_operator_draft(p_job_id,p_draft_brief);

  select count(*) into approved_count
  from survival_ops.archive_review_items item
  join survival_ops.knowledge_semantic_jobs j on j.job_id=p_job_id
  where item.source_worker='C_KNOWLEDGE'
    and item.item_type='KNOWLEDGE'
    and item.status='APPROVED'
    and item.payload->>'brief_id'=validated->>'brief_id'
    and (
      (j.final_head_sha is not null and item.payload->>'head_sha'=j.final_head_sha)
      or (j.final_pr_number is not null and item.payload->>'pr_number'=j.final_pr_number::text)
    );
  if approved_count > 0 then
    raise exception using errcode='40001', message='KNOWLEDGE_OPERATOR_DRAFT_ALREADY_APPROVED';
  end if;

  select * into existing from survival_ops.knowledge_operator_drafts where job_id=p_job_id for update;
  if found then
    if p_expected_revision is distinct from existing.revision then
      raise exception using errcode='40001', message='KNOWLEDGE_OPERATOR_DRAFT_REVISION_CONFLICT';
    end if;
    next_revision := existing.revision + 1;
  else
    if coalesce(p_expected_revision,0) <> 0 then
      raise exception using errcode='40001', message='KNOWLEDGE_OPERATOR_DRAFT_REVISION_CONFLICT';
    end if;
    next_revision := 1;
  end if;

  next_sha := encode(extensions.digest(convert_to(p_draft_brief::text,'UTF8'),'sha256'),'hex');

  insert into survival_ops.knowledge_operator_drafts(
    job_id,brief_id,base_semantic_result_sha256,draft_brief,draft_sha256,revision,edited_by
  ) values (
    p_job_id,validated->>'brief_id',validated->>'base_semantic_result_sha256',
    p_draft_brief,next_sha,next_revision,actor_id
  )
  on conflict (job_id) do update set
    draft_brief=excluded.draft_brief,
    draft_sha256=excluded.draft_sha256,
    revision=excluded.revision,
    edited_by=excluded.edited_by,
    updated_at=clock_timestamp();

  return jsonb_build_object(
    'job_id',p_job_id,'brief_id',validated->>'brief_id',
    'revision',next_revision,'draft_sha256',next_sha,'brief',p_draft_brief
  );
end;
$$;

create or replace function public.archive_operator_knowledge_publish(
  p_job_id uuid,
  p_expected_revision integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
  if not found or j.status<>'HUMAN_REVIEW' or j.result_decision<>'HUMAN_REVIEW' then
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
$$;

create or replace function public.archive_worker_knowledge_operator_draft(
  p_job_id uuid,
  p_revision integer,
  p_draft_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  trusted_role text := auth.jwt()->>'role';
  j survival_ops.knowledge_semantic_jobs%rowtype;
  d survival_ops.knowledge_operator_drafts%rowtype;
begin
  if trusted_role is distinct from 'service_role' then
    raise exception using errcode='42501', message='KNOWLEDGE_OPERATOR_WORKER_FORBIDDEN';
  end if;
  select * into j from survival_ops.knowledge_semantic_jobs where job_id=p_job_id;
  select * into d from survival_ops.knowledge_operator_drafts
    where job_id=p_job_id and revision=p_revision and draft_sha256=p_draft_sha256;
  if not found then
    raise exception using errcode='P0002', message='KNOWLEDGE_OPERATOR_DRAFT_BINDING_NOT_FOUND';
  end if;
  return jsonb_build_object(
    'job_id',d.job_id,
    'brief_id',d.brief_id,
    'candidate_id',j.semantic_result->'candidate'->>'id',
    'revision',d.revision,
    'draft_sha256',d.draft_sha256,
    'brief',d.draft_brief
  );
end;
$$;

revoke all on function public.archive_operator_knowledge_draft_get(uuid) from public, anon;
revoke all on function public.archive_operator_knowledge_draft_save(uuid,integer,jsonb) from public, anon;
revoke all on function public.archive_operator_knowledge_publish(uuid,integer,text) from public, anon;
revoke all on function public.archive_worker_knowledge_operator_draft(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.archive_operator_knowledge_draft_get(uuid) to authenticated;
grant execute on function public.archive_operator_knowledge_draft_save(uuid,integer,jsonb) to authenticated;
grant execute on function public.archive_operator_knowledge_publish(uuid,integer,text) to authenticated;
grant execute on function public.archive_worker_knowledge_operator_draft(uuid,integer,text) to service_role;
