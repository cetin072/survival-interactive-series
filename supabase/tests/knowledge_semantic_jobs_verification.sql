\set ON_ERROR_STOP on
begin;

do $verify$
declare
  v_decision text;
  v_source_ref text;
  v_job_id uuid;
  v_result jsonb;
  v_changed jsonb;
  v_prepared jsonb;
  v_current jsonb;
  v_submitted jsonb;
  v_duplicate jsonb;
  v_conflict jsonb;
  v_wrong_source jsonb;
  v_invalid jsonb;
  v_rejected jsonb;
  v_second_prepare jsonb;
  v_claimed jsonb;
  v_updated jsonb;
  v_active jsonb;
  v_handled jsonb;
  v_operator jsonb;
  v_head_ref text;
  v_terminal_status text;
begin
  if public.archive_knowledge_semantic_job_current()->>'status' <> 'NO_JOB' then
    raise exception 'empty current-job path did not return NO_JOB';
  end if;
  v_operator := public.archive_operator_system_status();
  if v_operator->'knowledge_semantic'->>'active_count' <> '0'
     or v_operator->'knowledge_semantic'->'latest_job' <> 'null'::jsonb then
    raise exception 'operator empty-state observability failed: %', v_operator->'knowledge_semantic';
  end if;
  if has_function_privilege('anon','public.archive_knowledge_semantic_job_current()','EXECUTE')
     or has_function_privilege('authenticated','public.archive_knowledge_semantic_job_current()','EXECUTE')
     or not has_function_privilege('service_role','public.archive_knowledge_semantic_job_current()','EXECUTE')
     or has_function_privilege('anon','public.archive_knowledge_semantic_job_submit(uuid,text,text,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.archive_knowledge_semantic_job_submit(uuid,text,text,jsonb)','EXECUTE') then
    raise exception 'worker RPC execute grants are not restricted to service_role';
  end if;

  foreach v_decision in array array['BRIEF_READY','HOLD','HUMAN_REVIEW'] loop
    v_source_ref := 'synthetic://c3-ci/' || v_decision;
    v_prepared := public.archive_knowledge_semantic_job_prepare(
      'FRESH_BRIEF','PUBLIC_ARCHIVE',v_source_ref,repeat('a',64),
      'synthetic-c3-ci-' || lower(v_decision),'c3-test-v1',repeat('b',64),
      '{"synthetic":true}'::jsonb,repeat('1',40),
      '{"source":{"kind":"PUBLIC_ARCHIVE"},"target":{"brief_id":"K-999","candidate_id":"KC-synthetic"}}'::jsonb,
      'PREPARED',null
    );
    if v_prepared->>'status' <> 'PREPARED' or v_prepared->>'created' <> 'true' then
      raise exception 'prepare failed for %: %',v_decision,v_prepared;
    end if;
    v_job_id := (v_prepared->>'job_id')::uuid;

    v_current := public.archive_knowledge_semantic_job_current();
    if v_current->>'status' <> 'PREPARED' or v_current->'job'->>'job_id' <> v_job_id::text then
      raise exception 'current job did not return prepared job %: %',v_job_id,v_current;
    end if;

    -- Repeated current reads remain stable while a job is PREPARED.
    v_current := public.archive_knowledge_semantic_job_current();
    if v_current->>'status' <> 'PREPARED' or v_current->'job'->>'job_id' <> v_job_id::text then
      raise exception 'pre-submit worker recovery did not preserve job %: %',v_job_id,v_current;
    end if;

    v_second_prepare := public.archive_knowledge_semantic_job_prepare(
      'FRESH_BRIEF','PUBLIC_ARCHIVE',v_source_ref || '-second',repeat('c',64),
      'synthetic-c3-ci-second-' || lower(v_decision),'c3-test-v1',repeat('b',64),
      '{"synthetic":true}'::jsonb,repeat('1',40),'{"synthetic":true}'::jsonb,'PREPARED',null
    );
    if v_second_prepare->>'status' <> 'ACTIVE_JOB_EXISTS' then
      raise exception 'active-job guard failed: %',v_second_prepare;
    end if;

    v_result := jsonb_build_object(
      'version','knowledge-semantic-result-v1',
      'decision',v_decision,
      'job_id',v_job_id::text
    );
    if v_decision = 'HOLD' then
      v_result := v_result || jsonb_build_object('code','NO_DISTINCT_SAFE_QUESTION','note','synthetic HOLD lifecycle');
    else
      v_result := v_result || jsonb_build_object(
        'candidate',jsonb_build_object(
          'id','KC-synthetic',
          'brief_id','K-999',
          'topic_id','T-SYNTHETIC',
          'status','BRIEF_PROPOSED',
          'question','Synthetic semantic question',
          'source_kind','PUBLIC_ARCHIVE',
          'source_manifest_ref',v_source_ref,
          'source_manifest_sha256',repeat('a',64)
        ),
        'evidence',jsonb_build_object(
          'brief_id','K-999',
          'question','Synthetic semantic question',
          'claims',jsonb_build_array(jsonb_build_object(
            'claim','Synthetic claim',
            'source_ids',jsonb_build_array('S1'),
            'context','Synthetic context',
            'limitation','Synthetic limitation'
          ))
        ),
        'brief',jsonb_build_object(
          'id','K-999',
          'topic_id','T-SYNTHETIC',
          'title','Synthetic semantic question',
          'content_type','BRIEF',
          'status','READY',
          'risk_level',case when v_decision='HUMAN_REVIEW' then 'HIGH' else 'LOW' end,
          'publication_policy',case when v_decision='HUMAN_REVIEW' then 'HUMAN_APPROVED' else 'AUTO_LOW_RISK' end,
          'semantic_qa_status',case when v_decision='HUMAN_REVIEW' then 'REVIEW' else 'PASS' end
        )
      );
      if v_decision = 'HUMAN_REVIEW' then
        v_result := v_result || jsonb_build_object('code','SYNTHETIC_REVIEW','note','synthetic review lifecycle');
      end if;
    end if;

    v_wrong_source := public.archive_knowledge_semantic_job_submit(
      v_job_id,v_source_ref || '-wrong',repeat('a',64),v_result
    );
    if v_wrong_source->>'status' <> 'REJECTED' or v_wrong_source->>'reason' <> 'SOURCE_BINDING_MISMATCH' then
      raise exception 'wrong source binding was not rejected: %',v_wrong_source;
    end if;

    if v_decision <> 'HOLD' then
      v_invalid := v_result #- '{brief,content_type}';
      v_rejected := public.archive_knowledge_semantic_job_submit(
        v_job_id,v_source_ref,repeat('a',64),v_invalid
      );
      if v_rejected->>'status' <> 'REJECTED'
         or v_rejected->>'reason' <> 'PACKAGE_CORE_CONTRACT_INVALID' then
        raise exception 'malformed package was not rejected before SUBMITTED: %',v_rejected;
      end if;
      v_current := public.archive_knowledge_semantic_job_current();
      if v_current->>'status' <> 'PREPARED' or v_current->'job'->>'job_id' <> v_job_id::text then
        raise exception 'rejected malformed package mutated durable PREPARED job: %',v_current;
      end if;
    end if;

    v_submitted := public.archive_knowledge_semantic_job_submit(v_job_id,v_source_ref,repeat('a',64),v_result);
    if v_submitted->>'status' <> 'ACCEPTED' then
      raise exception 'first submit failed for %: %',v_decision,v_submitted;
    end if;
    v_duplicate := public.archive_knowledge_semantic_job_submit(v_job_id,v_source_ref,repeat('a',64),v_result);
    if v_duplicate->>'status' <> 'ALREADY_SUBMITTED' then
      raise exception 'identical duplicate was not idempotent for %: %',v_decision,v_duplicate;
    end if;
    v_changed := jsonb_set(v_result,'{note}',to_jsonb('changed duplicate result'::text),true);
    v_conflict := public.archive_knowledge_semantic_job_submit(v_job_id,v_source_ref,repeat('a',64),v_changed);
    if v_conflict->>'status' <> 'REJECTED' or v_conflict->>'reason' <> 'RESULT_CONFLICT' then
      raise exception 'changed duplicate was not rejected for %: %',v_decision,v_conflict;
    end if;

    if public.archive_knowledge_semantic_job_current()->>'status' <> 'NO_JOB' then
      raise exception 'submitted result remained visible as a PREPARED job';
    end if;
    -- A submitted job is no longer exposed to the semantic worker; finalization is independent.
    v_claimed := public.archive_knowledge_semantic_job_claim_finalizer();
    if v_claimed->>'job_id' <> v_job_id::text or v_claimed->>'status' <> 'FINALIZING' then
      raise exception 'finalizer did not claim exactly submitted job %: %',v_job_id,v_claimed;
    end if;

    v_head_ref := 'knowledge/worker/semantic-' || v_job_id::text;
    if v_decision = 'HOLD' then
      v_terminal_status := 'HOLD';
      v_updated := public.archive_knowledge_semantic_job_update(v_job_id,'FINALIZING','HOLD','SYNTHETIC_HOLD','TEST');
    elsif v_decision = 'HUMAN_REVIEW' then
      v_terminal_status := 'PUBLISHED';
      v_updated := public.archive_knowledge_semantic_job_update(
        v_job_id,'FINALIZING','HUMAN_REVIEW',null,null,101,v_head_ref,repeat('a',40),null
      );
      if v_updated->>'status' <> 'HUMAN_REVIEW' then
        raise exception 'human-review state update failed: %',v_updated;
      end if;
      v_updated := public.archive_knowledge_semantic_job_update(
        v_job_id,'HUMAN_REVIEW','PUBLISHED',null,null,101,v_head_ref,repeat('a',40),repeat('b',40)
      );
    else
      v_terminal_status := 'PUBLISHED';
      v_updated := public.archive_knowledge_semantic_job_update(
        v_job_id,'FINALIZING','PR_OPEN',null,null,100,v_head_ref,repeat('a',40),null
      );
      if v_updated->>'status' <> 'PR_OPEN' then
        raise exception 'PR_OPEN state update failed: %',v_updated;
      end if;
      v_updated := public.archive_knowledge_semantic_job_update(
        v_job_id,'PR_OPEN','PUBLISHED',null,null,100,v_head_ref,repeat('a',40),repeat('b',40)
      );
    end if;
    if v_updated->>'status' <> v_terminal_status then
      raise exception 'terminal outcome transition failed for %: %',v_decision,v_updated;
    end if;

    v_active := public.archive_knowledge_semantic_job_list_active();
    if jsonb_array_length(v_active) <> 0 then
      raise exception 'terminal job still appears active: %',v_active;
    end if;
    v_handled := public.archive_knowledge_semantic_job_list_handled();
    if not exists (
      select 1 from jsonb_array_elements(v_handled) as handled(item)
      where item->>'source_ref' = v_source_ref and item->>'status' = v_terminal_status
    ) then
      raise exception 'terminal job is missing from handled identities: %',v_handled;
    end if;
    v_operator := public.archive_operator_system_status();
    if v_operator->'knowledge_semantic'->>'active_count' <> '0'
       or v_operator->'knowledge_semantic'->'latest_job'->>'status' <> v_terminal_status then
      raise exception 'operator lifecycle observability failed: %',v_operator->'knowledge_semantic';
    end if;

    if v_terminal_status = 'PUBLISHED' then
      begin
        update survival_ops.knowledge_semantic_jobs set blocker_code='TAMPERED' where job_id=v_job_id;
        raise exception 'terminal job mutation unexpectedly succeeded';
      exception when others then
        if sqlerrm <> 'KNOWLEDGE_SEMANTIC_TERMINAL_IMMUTABLE' then raise; end if;
      end;
    end if;

    v_prepared := public.archive_knowledge_semantic_job_prepare(
      'FRESH_BRIEF','PUBLIC_ARCHIVE',v_source_ref,repeat('a',64),
      'synthetic-c3-ci-' || lower(v_decision),'c3-test-v1',repeat('b',64),
      '{"synthetic":true}'::jsonb,repeat('1',40),
      '{"source":{"kind":"PUBLIC_ARCHIVE"},"target":{"brief_id":"K-999","candidate_id":"KC-synthetic"}}'::jsonb,
      'PREPARED',null
    );
    if v_prepared->>'status' <> 'EXISTING_JOB' or v_prepared->>'job_id' <> v_job_id::text then
      raise exception 'handled identity was re-created: %',v_prepared;
    end if;
    perform pg_sleep(0.01);
  end loop;

  if (select count(*) from cron.job where jobname like 'afterfall-knowledge-semantic-%') <> 3 then
    raise exception 'semantic cron registration did not create three jobs';
  end if;
end
$verify$;

rollback;