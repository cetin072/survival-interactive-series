-- An operator's human-checked Knowledge brief must dispatch the existing
-- exact-revision publication consumer immediately (not wait for its cron).
-- Fail-safe: if the GitHub request cannot be queued, keep the approved revision
-- and the historical scheduled retry; never report public publication early.
-- No new token; reuse the private vault secret and existing worker.
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
  github_token text;
  dispatch_request_id bigint;
  decision_response jsonb;
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

  -- The operator's exact saved revision is approved once. No unreviewed
  -- source, evidence, or CI gate is bypassed by the immediate dispatch.
  decision_response := public.archive_operator_decide_review_item(review_row.id,'APPROVED',note_value);
  begin
    select ds.decrypted_secret into github_token
    from vault.decrypted_secrets ds
    where ds.name='archive_github_dispatch_token'
    order by ds.created_at desc limit 1;
    if github_token is null or pg_catalog.length(pg_catalog.btrim(github_token)) < 20 then
      return decision_response || pg_catalog.jsonb_build_object('publication_dispatch','PENDING_SCHEDULED_FALLBACK');
    end if;
    select net.http_post(
      url:='https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/knowledge-review-consumer.yml/dispatches',
      body:=pg_catalog.jsonb_build_object('ref','main'),
      headers:=pg_catalog.jsonb_build_object(
        'Accept','application/vnd.github+json',
        'Authorization','Bearer ' || github_token,
        'X-GitHub-Api-Version','2022-11-28',
        'Content-Type','application/json',
        'User-Agent','survival-diary-human-reviewed-direct-dispatch'
      ),
      timeout_milliseconds:=10000
    ) into dispatch_request_id;
    return decision_response || pg_catalog.jsonb_build_object(
      'publication_dispatch','QUEUED_FOR_VERIFICATION',
      'dispatch_request_id',dispatch_request_id
    );
  exception when others then
    -- Preserve the irreversible human-review receipt. Existing scheduled
    -- consumer remains the retry path; never auto-mark an article published.
    return decision_response || pg_catalog.jsonb_build_object('publication_dispatch','PENDING_SCHEDULED_FALLBACK');
  end;
end;
$function$
