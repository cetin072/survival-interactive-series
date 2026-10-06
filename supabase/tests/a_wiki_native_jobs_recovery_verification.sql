\set ON_ERROR_STOP on
-- Isolated CI database only. Every fixture and mutation rolls back.
begin;
truncate survival_ops.a_wiki_native_jobs cascade;
select pg_catalog.set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001"}',true);

do $verify$
declare
  v_job jsonb := jsonb_build_object(
    'version','wiki-fact-job-v1','job_id','wiki-job-'||repeat('1',64),
    'chronicle_id','C03-AFTERFALL','worldline_id','AFTERFALL','visibility','PUBLIC_ARCHIVE','season_id','S03',
    'graph_sha256',repeat('a',64),'source',jsonb_build_object(
      'session_id','SESSION_001','manifest_ref','archive/content/transcripts/C03-AFTERFALL/S03/SESSION_001/SOURCE_MANIFEST.json',
      'manifest_sha256',repeat('b',64)));
  v_next jsonb;
  v_evidence jsonb;
  v_result jsonb;
  v_id uuid;
  v_blocked_id uuid;
  v_replacement_id uuid;
  v_binding text;
  v_before jsonb;
  v_after jsonb;
  v_published_at timestamptz := '2026-10-04T15:08:36Z';
  v_signature text;
begin
  if not (select relrowsecurity from pg_class where oid='survival_ops.a_wiki_native_jobs'::regclass) then
    raise exception 'RLS disabled';
  end if;
  if has_table_privilege('service_role','survival_ops.a_wiki_native_jobs','SELECT,INSERT,UPDATE')
    or has_table_privilege('authenticated','survival_ops.a_wiki_native_jobs','SELECT,INSERT,UPDATE') then
    raise exception 'private ledger table grants widened';
  end if;
  foreach v_signature in array array[
    'public.archive_a_wiki_native_job_recovery_current()',
    'public.archive_a_wiki_native_job_current()',
    'public.archive_a_wiki_native_job_prepare(jsonb,text)',
    'public.archive_a_wiki_native_job_reconcile_publication(uuid,text,jsonb)',
    'public.archive_a_wiki_native_job_supersede_reprepare(uuid,text,jsonb,text)',
    'public.archive_a_wiki_native_job_retry_blocked(uuid,text)'
  ] loop
    if has_function_privilege('anon',v_signature,'EXECUTE')
      or has_function_privilege('authenticated',v_signature,'EXECUTE')
      or not has_function_privilege('service_role',v_signature,'EXECUTE') then
      raise exception 'recovery RPC grant incorrect: %',v_signature;
    end if;
  end loop;
  if has_function_privilege('anon','public.archive_operator_system_status()','EXECUTE')
    or not has_function_privilege('authenticated','public.archive_operator_system_status()','EXECUTE')
    or has_function_privilege('authenticated','survival_ops.archive_operator_system_status_without_a_wiki_v1()','EXECUTE') then
    raise exception 'operator wrapper grants widened';
  end if;
  -- The existing catalog/program contract permits 2-3 digit seasons from S03.
  perform survival_ops.validate_a_wiki_native_prepare(
    v_job || jsonb_build_object('season_id','S100','source',v_job->'source'||jsonb_build_object(
      'manifest_ref','archive/content/transcripts/C03-AFTERFALL/S100/SESSION_001/SOURCE_MANIFEST.json')),repeat('1',40));
  begin
    perform survival_ops.validate_a_wiki_native_prepare(
      v_job || jsonb_build_object('season_id','S02'),repeat('1',40));
    raise exception 'retired season accepted as a new native source';
  exception when raise_exception then
    if sqlerrm <> 'A_WIKI_NATIVE_PREPARE_INVALID' then raise; end if;
  end;

  v_result := public.archive_a_wiki_native_job_prepare(v_job,repeat('1',40));
  v_id := (v_result->>'job_id')::uuid;
  v_binding := v_result->>'binding_sha256';
  if v_result->>'status' <> 'EXTRACTOR_READY' then raise exception 'prepare failed: %',v_result; end if;
  select to_jsonb(j) into v_before from survival_ops.a_wiki_native_jobs j where job_id=v_id;
  if public.archive_a_wiki_native_job_recovery_current()->>'job_id' <> v_id::text then
    raise exception 'recovery reader did not return the stale row';
  end if;
  v_evidence := jsonb_build_object(
    'version','a-wiki-publication-evidence-v1','origin','EXTERNAL_REVIEWED_MERGE',
    'source_ref',v_job->'source'->>'manifest_ref','source_sha256',repeat('b',64),'prepared_job_sha256',v_binding,
    'fact_ref','archive/content/public-facts/C03-AFTERFALL/S03/AWIKI_SESSION_001_'||repeat('b',64)||'.json',
    'fact_sha256',repeat('c',64),
    'receipt_ref','archive/content/public-facts/C03-AFTERFALL/S03/receipts/AWIKI_SESSION_001_'||repeat('b',64)||'.json',
    'receipt_sha256',repeat('d',64),'receipt_job_id','wiki-job-'||repeat('2',64),
    'proposal_sha256',repeat('e',64),'review_sha256',repeat('f',64),
    'graph_before_sha256',repeat('2',64),'graph_after_sha256',repeat('3',64),
    'outcome','APPLIED','pr_number',397,'head_ref','codex/a-wiki-session-007-review',
    'head_sha',repeat('2',40),'merge_sha',repeat('3',40),'merged_at','2026-10-04T15:08:36Z',
    'verified_main_sha',repeat('4',40));
  -- Receipt job/graph deliberately differ from the stale native prepared package.
  -- The public source binding and external provenance must match, not a made-up
  -- native Extractor/Reviewer history.
  begin
    perform public.archive_a_wiki_native_job_reconcile_publication(v_id,'EXTRACTOR_READY',
      v_evidence || jsonb_build_object('source_sha256',repeat('0',64)));
    raise exception 'wrong source was accepted';
  exception when raise_exception then
    if sqlerrm <> 'A_WIKI_NATIVE_PUBLICATION_EVIDENCE_INVALID' then raise; end if;
  end;
  begin
    perform public.archive_a_wiki_native_job_reconcile_publication(v_id,'EXTRACTOR_READY',v_evidence-'review_sha256');
    raise exception 'missing review binding was accepted';
  exception when raise_exception then
    if sqlerrm <> 'A_WIKI_NATIVE_PUBLICATION_EVIDENCE_INVALID' then raise; end if;
  end;
  begin
    perform public.archive_a_wiki_native_job_reconcile_publication(v_id,'EXTRACTOR_READY',
      v_evidence || '{"receipt_ref":"archive/content/public-facts/C03-AFTERFALL/S04/receipts/other.json"}'::jsonb);
    raise exception 'wrong season receipt was accepted';
  exception when raise_exception then
    if sqlerrm <> 'A_WIKI_NATIVE_PUBLICATION_EVIDENCE_INVALID' then raise; end if;
  end;
  begin
    update survival_ops.a_wiki_native_jobs set status='PUBLISHED',final_pr_number=1,
      final_head_sha=repeat('1',40),merge_sha=repeat('1',40),published_at=clock_timestamp() where job_id=v_id;
    raise exception 'normal transition bypassed independent review';
  exception when raise_exception then
    if sqlerrm <> 'A_WIKI_NATIVE_TRANSITION_INVALID' then raise; end if;
  end;
  v_result := public.archive_a_wiki_native_job_reconcile_publication(v_id,'EXTRACTOR_READY',v_evidence);
  if v_result->>'status' <> 'PUBLISHED' then raise exception 'reconcile failed: %',v_result; end if;
  select to_jsonb(j) into v_after from survival_ops.a_wiki_native_jobs j where job_id=v_id;
  if (v_before - array['status','completion_origin','completion_evidence','blocker_code','final_pr_number',
      'final_head_ref','final_head_sha','merge_sha','published_at','updated_at'])
    is distinct from (v_after - array['status','completion_origin','completion_evidence','blocker_code','final_pr_number',
      'final_head_ref','final_head_sha','merge_sha','published_at','updated_at'])
    or (v_after->>'published_at')::timestamptz <> v_published_at
    or v_after->>'extractor_submitted_at' is not null or v_after->>'review_submitted_at' is not null then
    raise exception 'recovery fabricated native history or rewrote its binding';
  end if;
  v_result := public.archive_a_wiki_native_job_reconcile_publication(v_id,'EXTRACTOR_READY',v_evidence);
  if v_result->>'status' <> 'ALREADY_RECONCILED' then raise exception 'reconcile was not idempotent: %',v_result; end if;
  if (select to_jsonb(j) from survival_ops.a_wiki_native_jobs j where job_id=v_id) is distinct from v_after then
    raise exception 'idempotent reconcile changed published row';
  end if;
  v_result := public.archive_a_wiki_native_job_reconcile_publication(v_id,'EXTRACTOR_READY',v_evidence||'{"pr_number":398}'::jsonb);
  if v_result->>'status' <> 'STATE_MISMATCH' then raise exception 'conflicting publication changed terminal row'; end if;
  if public.archive_a_wiki_native_job_current()->>'status' <> 'NO_JOB'
    or public.archive_a_wiki_native_job_recovery_current()->>'status' <> 'NO_JOB' then
    raise exception 'published stale row still blocks consumption';
  end if;
  begin
    insert into survival_ops.a_wiki_native_jobs (
      status,session_id,source_ref,source_sha256,graph_sha256,main_sha_at_prepare,
      prepared_job,prepared_job_sha256,completion_evidence
    ) values ('EXTRACTOR_READY','SESSION_999',
      'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_999/SOURCE_MANIFEST.json',
      repeat('b',64),repeat('a',64),repeat('1',40),v_job,v_binding,'{}');
    raise exception 'NULL completion origin bypassed evidence pair constraint';
  exception when check_violation then null;
  end;

  -- The same SESSION number/hash in a different public season is a different source.
  v_job := v_job || jsonb_build_object('season_id','S04','job_id','wiki-job-'||repeat('4',64),
    'source',v_job->'source'||'{"manifest_ref":"archive/content/transcripts/C03-AFTERFALL/S04/SESSION_001/SOURCE_MANIFEST.json"}'::jsonb);
  v_result := public.archive_a_wiki_native_job_prepare(v_job,repeat('5',40));
  v_blocked_id := (v_result->>'job_id')::uuid;
  if v_result->>'status' <> 'EXTRACTOR_READY' or v_blocked_id=v_id then
    raise exception 'same session across seasons collided: %',v_result;
  end if;
  update survival_ops.a_wiki_native_jobs
  set status='EXTRACTOR_SUBMITTED',extractor_result='{"decision":"FACTS_READY"}',
    extractor_result_sha256=repeat('6',64),extractor_submitted_at=clock_timestamp() where job_id=v_blocked_id;
  perform public.archive_a_wiki_native_job_advance(v_blocked_id,'EXTRACTOR_SUBMITTED','REVIEW_READY',
    '{"version":"wiki-fact-proposal-v1","proposal_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}'::jsonb,
    '{"version":"wiki-fact-review-job-v1","proposal":{"version":"wiki-fact-proposal-v1","proposal_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}}'::jsonb);
  if public.archive_a_wiki_native_job_current()->>'proposal_sha256' <> repeat('c',64) then
    raise exception 'semantic proposal SHA contract regressed';
  end if;
  update survival_ops.a_wiki_native_jobs set status='REVIEW_SUBMITTED',review_result='{"decision":"APPROVE"}',
    review_result_sha256=repeat('7',64),review_submitted_at=clock_timestamp() where job_id=v_blocked_id;
  perform public.archive_a_wiki_native_job_advance(v_blocked_id,'REVIEW_SUBMITTED','FINALIZING');
  perform public.archive_a_wiki_native_job_advance(v_blocked_id,'FINALIZING','BLOCKED',
    p_blocker_code=>'A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED');
  select to_jsonb(j) into v_before from survival_ops.a_wiki_native_jobs j where job_id=v_blocked_id;
  v_result := public.archive_a_wiki_native_job_retry_blocked(v_blocked_id,'A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED');
  if v_result->>'reason' <> 'GRAPH_REPREPARE_REQUIRED' then raise exception 'graph drift allowed same-package retry'; end if;
  v_result := public.archive_a_wiki_native_job_supersede_reprepare(v_blocked_id,'BLOCKED',v_job,repeat('5',40));
  if v_result->>'reason' <> 'GRAPH_UNCHANGED' then raise exception 'unchanged graph created a new revision'; end if;
  v_next := v_job || jsonb_build_object('job_id','wiki-job-'||repeat('8',64),'graph_sha256',repeat('8',64));
  begin
    perform public.archive_a_wiki_native_job_supersede_reprepare(v_blocked_id,'BLOCKED',
      jsonb_set(v_next,'{source,manifest_sha256}',to_jsonb(repeat('0',64))),repeat('8',40));
    raise exception 'source drift was silently rebound';
  exception when raise_exception then
    if sqlerrm <> 'A_WIKI_NATIVE_REPREPARE_SOURCE_MISMATCH' then raise; end if;
  end;
  v_result := public.archive_a_wiki_native_job_supersede_reprepare(v_blocked_id,'BLOCKED',v_next,repeat('8',40));
  v_replacement_id := (v_result->>'job_id')::uuid;
  if v_result->>'status' <> 'EXTRACTOR_READY' or v_replacement_id=v_blocked_id then
    raise exception 'reprepare failed: %',v_result;
  end if;
  select to_jsonb(j) into v_after from survival_ops.a_wiki_native_jobs j where job_id=v_blocked_id;
  if v_after->>'status' <> 'SUPERSEDED'
    or (v_before-array['status','updated_at']) is distinct from (v_after-array['status','updated_at']) then
    raise exception 'supersession erased old evidence';
  end if;
  select to_jsonb(j) into v_after from survival_ops.a_wiki_native_jobs j where job_id=v_replacement_id;
  if v_after->>'supersedes_job_id' <> v_blocked_id::text or v_after->>'extractor_result' is not null
    or v_after->>'review_result' is not null or v_after->'prepared_job' is distinct from v_next then
    raise exception 'replacement copied old semantic approval or lost provenance';
  end if;
  v_result := public.archive_a_wiki_native_job_supersede_reprepare(v_blocked_id,'BLOCKED',v_next,repeat('8',40));
  if v_result->>'status' <> 'ALREADY_REPREPARED' or v_result->>'job_id' <> v_replacement_id::text then
    raise exception 'reprepare was not idempotent';
  end if;
  v_result := public.archive_a_wiki_native_job_prepare(v_job,repeat('5',40));
  if v_result->>'status' <> 'ACTIVE_JOB_EXISTS' or v_result->>'job_id' <> v_replacement_id::text then
    raise exception 'old superseded binding shadowed active replacement: %',v_result;
  end if;
  if public.archive_a_wiki_native_job_current()->>'job_id' <> v_replacement_id::text
    or public.archive_a_wiki_native_job_recovery_current()->>'job_id' <> v_replacement_id::text then
    raise exception 'superseded row is still consumed';
  end if;
  begin
    update survival_ops.a_wiki_native_jobs set status='BLOCKED' where job_id=v_blocked_id;
    raise exception 'superseded row was reopened';
  exception when raise_exception then
    if sqlerrm <> 'A_WIKI_NATIVE_TERMINAL_IMMUTABLE' then raise; end if;
  end;
  v_result := public.archive_operator_system_status();
  if (v_result-'a_wiki') is distinct from (survival_ops.archive_operator_system_status_without_a_wiki_v1()-'a_wiki')
    or not v_result ?& array['archive','visual','review','knowledge_semantic','a_wiki'] then
    raise exception 'operator wrapper dropped or changed other automation payloads';
  end if;
  if (v_result->'a_wiki'->>'job_count')::integer <> 2
    or (v_result->'a_wiki'->>'active_count')::integer <> 1
    or (v_result->'a_wiki'->>'published_count')::integer <> 1
    or v_result->'a_wiki'->'latest_job'->>'season_id' <> 'S04' then
    raise exception 'superseded revision inflated operator counts: %',v_result->'a_wiki';
  end if;

  -- NO_FACTS has a receipt and reviewed unchanged graph, but no invented fact file.
  v_evidence := v_evidence || jsonb_build_object(
    'source_ref',v_next->'source'->>'manifest_ref','prepared_job_sha256',v_after->>'prepared_job_sha256',
    'fact_ref',null,'fact_sha256',null,'outcome','NO_FACTS',
    'receipt_ref','archive/content/public-facts/C03-AFTERFALL/S04/receipts/AWIKI_SESSION_001_'||repeat('b',64)||'.json',
    'graph_before_sha256',repeat('8',64),'graph_after_sha256',repeat('8',64));
  begin
    perform public.archive_a_wiki_native_job_reconcile_publication(v_replacement_id,'EXTRACTOR_READY',
      v_evidence||jsonb_build_object('graph_after_sha256',repeat('9',64)));
    raise exception 'NO_FACTS accepted a changed graph';
  exception when raise_exception then
    if sqlerrm <> 'A_WIKI_NATIVE_PUBLICATION_EVIDENCE_INVALID' then raise; end if;
  end;
  v_result := public.archive_a_wiki_native_job_reconcile_publication(v_replacement_id,'EXTRACTOR_READY',v_evidence);
  if v_result->>'status' <> 'PUBLISHED'
    or public.archive_operator_a_wiki_status()->'latest_job'->>'completion_origin' <> 'EXTERNAL_REVIEWED_MERGE' then
    raise exception 'NO_FACTS completion or provenance failed';
  end if;
  -- The native FINALIZING -> PUBLISHED route keeps its existing exact-head gate.
  v_next := v_next || jsonb_build_object('job_id','wiki-job-'||repeat('9',64),
    'source',v_next->'source'||jsonb_build_object('session_id','SESSION_002',
      'manifest_ref','archive/content/transcripts/C03-AFTERFALL/S04/SESSION_002/SOURCE_MANIFEST.json'));
  v_result := public.archive_a_wiki_native_job_prepare(v_next,repeat('9',40));
  v_id := (v_result->>'job_id')::uuid;
  update survival_ops.a_wiki_native_jobs set status='EXTRACTOR_SUBMITTED',
    extractor_result='{"decision":"FACTS_READY"}',extractor_result_sha256=repeat('6',64),
    extractor_submitted_at=clock_timestamp() where job_id=v_id;
  perform public.archive_a_wiki_native_job_advance(v_id,'EXTRACTOR_SUBMITTED','REVIEW_READY',
    '{"version":"wiki-fact-proposal-v1"}'::jsonb,
    '{"version":"wiki-fact-review-job-v1","proposal":{"version":"wiki-fact-proposal-v1"}}'::jsonb);
  update survival_ops.a_wiki_native_jobs set status='REVIEW_SUBMITTED',review_result='{"decision":"APPROVE"}',
    review_result_sha256=repeat('7',64),review_submitted_at=clock_timestamp() where job_id=v_id;
  perform public.archive_a_wiki_native_job_advance(v_id,'REVIEW_SUBMITTED','FINALIZING');
  v_result := public.archive_a_wiki_native_job_advance(v_id,'FINALIZING','PUBLISHED',
    p_pr_number=>400,p_head_ref=>'codex/fixture-native-publish',p_head_sha=>repeat('a',40),p_merge_sha=>repeat('b',40));
  if v_result->>'status' <> 'PUBLISHED'
    or public.archive_operator_a_wiki_status()->'latest_job'->>'completion_origin' <> 'NATIVE_REVIEWED_MERGE'
    or exists(select 1 from survival_ops.a_wiki_native_jobs where job_id=v_id and completion_evidence is not null) then
    raise exception 'normal native publication regressed or was mislabeled external';
  end if;
  -- Production authorization stays in the existing operator gate.
  perform pg_catalog.set_config('request.jwt.claims','{}',true);
  begin
    perform public.archive_operator_system_status();
    raise exception 'operator wrapper bypassed operator authorization';
  exception when raise_exception then
    if sqlerrm <> 'ARCHIVE_OPERATOR_REQUIRED' then raise; end if;
  end;
end;
$verify$;
rollback;
