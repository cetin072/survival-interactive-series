begin;
do $verify$
declare prepared jsonb; outcome jsonb; result jsonb; id uuid; before_count bigint; brief jsonb;
begin
  select count(*) into before_count from survival_ops.knowledge_semantic_jobs;
  perform survival_ops.set_knowledge_semantic_prep_enabled(false);
  if public.archive_knowledge_semantic_prep_enabled() then raise exception 'PAUSE_NOT_SHARED'; end if;
  outcome:=public.archive_knowledge_semantic_job_prepare(null,null,null,null,null,null,null,null,null,null);
  if outcome->>'status'<>'PREP_PAUSED' or (select count(*) from survival_ops.knowledge_semantic_jobs)<>before_count then raise exception 'PAUSED_FALLBACK_CREATED_JOB'; end if;
  perform survival_ops.set_knowledge_semantic_prep_enabled(true);
  if not public.archive_knowledge_semantic_prep_enabled() then raise exception 'PREP_RESUME_FAILED'; end if;
  prepared:=public.archive_knowledge_semantic_job_prepare('BACKFILL_BRIEF','PUBLIC_READER','qa-620',repeat('a',64),'qa-620','test',repeat('b',64),'{}',repeat('c',40),
    '{"target":{"brief_id":"K-999998","candidate_id":"KC-qa620"},"editorial_contract":{"version":"V2"}}');
  id:=(prepared->>'job_id')::uuid;
  if id is null then raise exception 'QA_PREPARE_FAILED: %',prepared; end if;
  result:=jsonb_build_object('version','knowledge-semantic-result-v1','job_id',id,'decision','BRIEF_READY','candidate','{}'::jsonb,'evidence','{}'::jsonb,'brief','{"story_refs":[]}'::jsonb);
  outcome:=public.archive_knowledge_semantic_job_submit(id,'qa-620',repeat('a',64),result);
  if outcome->>'reason'<>'SEMANTIC_BRIEF_SCHEMA_INVALID' then raise exception 'MISSING_FIELDS_ACCEPTED: %',outcome; end if;
  brief:='{"slug":"qa620","title":"Test","summary":"Test","meta_description":"Test","lead":"This is a sufficiently long test lead sentence.","label":"Test","scope":"Test","basis":"Test","footer":"Test","editorial_note":"Test","tools":[],"related_brief_ids":[],"story_refs":[],"sources":[{}],"sections":[{"heading":"Test","blocks":[{"type":"table","columns":["x"],"rows":[["y"]]}]}]}'::jsonb;
  result:=jsonb_set(result,'{brief}',brief);
  outcome:=public.archive_knowledge_semantic_job_submit(id,'qa-620',repeat('a',64),result);
  if outcome->>'reason'<>'SEMANTIC_TABLE_HEADERS_REQUIRED' then raise exception 'COLUMNS_ACCEPTED: %',outcome; end if;
  result:=jsonb_set(result,'{brief,lead}','""'::jsonb);
  outcome:=public.archive_knowledge_semantic_job_submit(id,'qa-620',repeat('a',64),result);
  if outcome->>'reason'<>'SEMANTIC_BRIEF_SCHEMA_INVALID' then raise exception 'MISSING_LEAD_ACCEPTED'; end if;
  if exists(select 1 from survival_ops.knowledge_semantic_jobs where job_id=id and semantic_result is not null) then raise exception 'REJECTED_RESULT_STORED'; end if;
  result:=jsonb_build_object('version','knowledge-semantic-result-v1','job_id',id,'decision','HOLD','code','SEMANTIC_DUPLICATE','note','Synthetic duplicate');
  outcome:=public.archive_knowledge_semantic_job_submit(id,'qa-620',repeat('a',64),result);
  if outcome->>'status'<>'ACCEPTED' then raise exception 'NORMAL_HOLD_REJECTED: %',outcome; end if;
  outcome:=public.archive_knowledge_semantic_job_submit(id,'qa-620',repeat('a',64),result);
  if outcome->>'status'<>'ALREADY_SUBMITTED' then raise exception 'HISTORICAL_IDEMPOTENCY_BROKEN'; end if;
end;
$verify$;
rollback;
