\set ON_ERROR_STOP on
begin;

do $verify$
declare
  prepared jsonb;
  submitted jsonb;
  claimed jsonb;
  blocked jsonb;
  retried jsonb;
  wrong jsonb;
  current_row survival_ops.knowledge_semantic_jobs%rowtype;
  v_job_id uuid;
  source_ref text := 'synthetic://c3-finalizer-retry';
  source_sha text := repeat('a',64);
  result jsonb;
  result_sha text;
begin
  if has_function_privilege(
       'service_role',
       'survival_ops.retry_knowledge_semantic_blocked_finalizer(uuid,text,text)',
       'EXECUTE'
     ) then
    raise exception 'retry RPC must not be executable by service_role';
  end if;
  if not has_function_privilege(
       'postgres',
       'survival_ops.retry_knowledge_semantic_blocked_finalizer(uuid,text,text)',
       'EXECUTE'
     ) then
    raise exception 'retry RPC must be executable by postgres';
  end if;

  prepared := public.archive_knowledge_semantic_job_prepare(
    'FRESH_BRIEF','PUBLIC_ARCHIVE',source_ref,source_sha,
    'synthetic-c3-finalizer-retry','c3-test-v1',repeat('b',64),
    '{"synthetic":true}'::jsonb,repeat('1',40),
    '{"source":{"kind":"PUBLIC_ARCHIVE"},"target":{"brief_id":"K-999","candidate_id":"KC-finalizer-retry"}}'::jsonb,
    'PREPARED',null
  );
  if prepared->>'status' <> 'PREPARED' then
    raise exception 'prepare failed: %',prepared;
  end if;
  v_job_id := (prepared->>'job_id')::uuid;

  result := jsonb_build_object(
    'version','knowledge-semantic-result-v1',
    'job_id',v_job_id::text,
    'decision','BRIEF_READY',
    'candidate',jsonb_build_object(
      'id','KC-finalizer-retry',
      'brief_id','K-999',
      'topic_id','T-RETRY',
      'status','BRIEF_PROPOSED',
      'question','Synthetic retry question',
      'source_kind','PUBLIC_ARCHIVE',
      'source_manifest_ref',source_ref,
      'source_manifest_sha256',source_sha
    ),
    'evidence',jsonb_build_object(
      'brief_id','K-999',
      'question','Synthetic retry question',
      'claims',jsonb_build_array(jsonb_build_object(
        'claim','Synthetic claim',
        'source_ids',jsonb_build_array('S1'),
        'context','Synthetic context',
        'limitation','Synthetic limitation'
      ))
    ),
    'brief',jsonb_build_object(
      'id','K-999',
      'topic_id','T-RETRY',
      'title','Synthetic retry question',
      'content_type','BRIEF',
      'status','READY',
      'risk_level','LOW',
      'publication_policy','AUTO_LOW_RISK',
      'semantic_qa_status','PASS'
    )
  );

  submitted := public.archive_knowledge_semantic_job_submit(v_job_id,source_ref,source_sha,result);
  if submitted->>'status' <> 'ACCEPTED' then
    raise exception 'submit failed: %',submitted;
  end if;
  result_sha := submitted->>'result_sha256';

  claimed := public.archive_knowledge_semantic_job_claim_finalizer();
  if claimed->>'status' <> 'FINALIZING' or claimed->>'job_id' <> v_job_id::text then
    raise exception 'claim failed: %',claimed;
  end if;

  blocked := public.archive_knowledge_semantic_job_update(
    v_job_id,'FINALIZING','BLOCKED','KNOWLEDGE_CONTRACT','FINALIZER'
  );
  if blocked->>'status' <> 'BLOCKED' then
    raise exception 'block transition failed: %',blocked;
  end if;

  wrong := survival_ops.retry_knowledge_semantic_blocked_finalizer(
    v_job_id,repeat('f',64),'KNOWLEDGE_CONTRACT'
  );
  if wrong->>'status' <> 'REJECTED' or wrong->>'reason' <> 'RETRY_BINDING_MISMATCH' then
    raise exception 'wrong result SHA was not rejected: %',wrong;
  end if;

  retried := survival_ops.retry_knowledge_semantic_blocked_finalizer(
    v_job_id,result_sha,'KNOWLEDGE_CONTRACT'
  );
  if retried->>'status' <> 'SUBMITTED'
     or retried->>'semantic_result_sha256' <> result_sha then
    raise exception 'retry failed: %',retried;
  end if;

  select * into current_row
  from survival_ops.knowledge_semantic_jobs
  where survival_ops.knowledge_semantic_jobs.job_id = v_job_id;

  if current_row.status <> 'SUBMITTED'
     or current_row.semantic_result is distinct from result
     or current_row.semantic_result_sha256 <> result_sha
     or current_row.blocker_code is not null
     or current_row.blocker_stage is not null
     or current_row.finalizing_at is not null
     or current_row.finalized_at is not null
     or current_row.finalizer_attempt_count <> 0 then
    raise exception 'retried row state mismatch';
  end if;

  claimed := public.archive_knowledge_semantic_job_claim_finalizer();
  if claimed->>'status' <> 'FINALIZING' or claimed->>'job_id' <> v_job_id::text then
    raise exception 'retried job was not claimable: %',claimed;
  end if;
end
$verify$;

rollback;
