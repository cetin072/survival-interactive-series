\set ON_ERROR_STOP on
-- Isolated CI database only. Everything inside this block is rolled back.
begin;
do $verify$
declare
  v_gm text := '장태훈은 이송배관부터 살폈다. 경유를 전부 곧바로 쓸 수 있는 것은 아니다. 장비별 규격도 맞춰야 하고 상태 확인도 필요하다. 그는 일부 시료만 확인했다.';
  v_job jsonb;
  v_extractor jsonb;
  v_proposal jsonb;
  v_review_job jsonb;
  v_review_result jsonb;
  v_response jsonb;
  v_correction jsonb;
  v_invalid jsonb;
  v_original_id uuid;
  v_revised_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_revised jsonb;
  v_binding text;
  v_review_binding text;
  v_revision_sha text;
begin
  if has_function_privilege('anon','public.archive_a_wiki_native_job_revise_human_relation(uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.archive_a_wiki_native_job_revise_human_relation(uuid,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.archive_a_wiki_native_job_revise_human_relation(uuid,jsonb)','EXECUTE')
     or has_table_privilege('authenticated','survival_ops.a_wiki_native_review_revision_audits','SELECT')
     or has_table_privilege('service_role','survival_ops.a_wiki_native_review_revision_audits','UPDATE')
     or not (select relrowsecurity from pg_class
       where oid='survival_ops.a_wiki_native_review_revision_audits'::regclass) then
     raise exception 'revision privileges exposed';
  end if;

  v_job := jsonb_build_object(
    'version','wiki-fact-job-v1','job_id','wiki-job-'||repeat('1',64),
    'chronicle_id','C03-AFTERFALL','worldline_id','AFTERFALL',
    'visibility','PUBLIC_ARCHIVE','season_id','S04','graph_sha256',repeat('a',64),
    'source',jsonb_build_object('session_id','SESSION_002',
      'manifest_ref','archive/content/transcripts/C03-AFTERFALL/S04/SESSION_002/SOURCE_MANIFEST.json',
      'manifest_sha256',repeat('b',64),
      'gm_blocks',jsonb_build_array(jsonb_build_object(
        'block_id','005','text',v_gm,'sha256',
        encode(extensions.digest(convert_to(v_gm,'UTF8'),'sha256'),'hex')
      ))
    )
  );
  v_response := public.archive_a_wiki_native_job_prepare(v_job,repeat('1',40));
  v_original_id := (v_response->>'job_id')::uuid;
  v_binding := v_response->>'binding_sha256';
  if v_response->>'status'<>'EXTRACTOR_READY' then raise exception 'prepare failed'; end if;

  v_extractor := jsonb_build_object(
    'version','wiki-fact-result-v1','job_id',v_job->>'job_id',
    'decision','FACTS_READY','coverage',jsonb_build_object('status','COMPLETE',
      'reviewed_blocks',jsonb_build_array('005')),
    'nodes',jsonb_build_array(),
    'relations',jsonb_build_array(jsonb_build_object(
      'from','char-taehoon','to','new:fuel-type-storage-inspection',
      'kind','participated_in','label','저장구역 이송배관 점검 및 경유 규격·품질 확인',
      'evidence',jsonb_build_array('site_inspect','taehoon_fuel')
    )),
    'citations',jsonb_build_array(
      jsonb_build_object('id','site_inspect','block_id','005',
        'quote','장태훈은 이송배관부터 살폈다.'),
      jsonb_build_object('id','taehoon_fuel','block_id','005',
        'quote','장비별 규격도 맞춰야 하고 상태 확인도 필요하다.')
    ),
    'deferred',jsonb_build_array(),'note','synthetic negative-review fixture'
  );
  v_response := public.archive_a_wiki_native_job_submit(
    v_original_id,'EXTRACTOR_READY',v_binding,v_extractor);
  if v_response->>'status'<>'ACCEPTED' then raise exception 'extractor submit failed'; end if;

  v_proposal := jsonb_build_object('version','wiki-fact-proposal-v1',
    'proposal_sha256',repeat('c',64));
  v_review_job := jsonb_build_object('version','wiki-fact-review-job-v1',
    'proposal',v_proposal);
  v_response := public.archive_a_wiki_native_job_advance(
    v_original_id,'EXTRACTOR_SUBMITTED','REVIEW_READY',
    p_proposal=>v_proposal,p_review_job=>v_review_job);
  if v_response->>'status'<>'REVIEW_READY' then raise exception 'review ready failed'; end if;
  select review_job_sha256 into v_review_binding from survival_ops.a_wiki_native_jobs
  where job_id=v_original_id;
  v_review_result := jsonb_build_object(
    'version','wiki-fact-review-v1','proposal_sha256',repeat('c',64),
    'decision','HUMAN_REVIEW',
    'note','Claim suggests full diesel quality verification, but source only supports a limited sample.');
  v_response := public.archive_a_wiki_native_job_submit(
    v_original_id,'REVIEW_READY',v_review_binding,v_review_result);
  if v_response->>'status'<>'ACCEPTED' then raise exception 'review submit failed'; end if;
  perform public.archive_a_wiki_native_job_advance(
    v_original_id,'REVIEW_SUBMITTED','HUMAN_REVIEW',
    p_blocker_code=>'REVIEWER_HUMAN_REVIEW');

  select to_jsonb(j) into v_before from survival_ops.a_wiki_native_jobs j
  where job_id=v_original_id;
  v_correction := jsonb_build_object(
    'version','a-wiki-human-relation-revision-v1',
    'old_job_id',v_original_id::text,
    'expected_review_sha256',v_before->>'review_result_sha256',
    'expected_extractor_sha256',v_before->>'extractor_result_sha256',
    'source_sha256',v_before->>'source_sha256',
    'graph_sha256',v_before->>'graph_sha256',
    'relation_from','char-taehoon',
    'relation_to','new:fuel-type-storage-inspection',
    'old_label','저장구역 이송배관 점검 및 경유 규격·품질 확인',
    'new_label','이송배관을 살피고 경유의 장비별 규격·상태는 추가 확인이 필요하다고 설명',
    'reason','Human approved: only partial sample reviewed; verification is incomplete.'
  );

  foreach v_invalid in array array[
    v_correction||jsonb_build_object('old_job_id','00000000-0000-0000-0000-000000000000'),
    v_correction||jsonb_build_object('expected_review_sha256',repeat('0',64)),
    v_correction||jsonb_build_object('expected_extractor_sha256',repeat('0',64)),
    v_correction||jsonb_build_object('source_sha256',repeat('0',64)),
    v_correction||jsonb_build_object('graph_sha256',repeat('0',64)),
    v_correction||jsonb_build_object('relation_to','new:unrelated'),
    v_correction||jsonb_build_object('old_label','unrelated old text'),
    v_correction||jsonb_build_object('new_label',''),
    v_correction||jsonb_build_object('reason',''),
    v_correction||jsonb_build_object('extra','must be rejected'),
    v_correction-'reason'
  ] loop
    v_response := public.archive_a_wiki_native_job_revise_human_relation(v_original_id,v_invalid);
    if v_response->>'status'<>'REJECTED' then raise exception 'bad correction accepted: %',v_invalid; end if;
    if (select to_jsonb(j) from survival_ops.a_wiki_native_jobs j where job_id=v_original_id)
       is distinct from v_before then raise exception 'bad correction mutated original'; end if;
  end loop;

  begin
    update survival_ops.a_wiki_native_jobs set review_result='{}'::jsonb where job_id=v_original_id;
    raise exception 'immutable human review modified directly';
  exception when raise_exception then
    if sqlerrm<>'A_WIKI_NATIVE_TERMINAL_IMMUTABLE' then raise; end if;
  end;

  v_response := public.archive_a_wiki_native_job_revise_human_relation(v_original_id,v_correction);
  v_revised_id := (v_response->>'job_id')::uuid;
  v_revision_sha := v_response->>'result_sha256';
  if v_response->>'status'<>'EXTRACTOR_SUBMITTED' or v_revised_id=v_original_id
    or v_response->>'review_revision'<>'1' then
    raise exception 'revision not admitted: %',v_response;
  end if;
  select to_jsonb(j) into v_after from survival_ops.a_wiki_native_jobs j
  where job_id=v_original_id;
  if v_after->>'status'<>'SUPERSEDED'
    or (v_after-array['status','updated_at']) is distinct from
      (v_before-array['status','updated_at']) then
    raise exception 'prior independently reviewed row was erased';
  end if;
  if v_after->'review_result' is distinct from v_before->'review_result'
    or v_after->'extractor_result' is distinct from v_before->'extractor_result' then
    raise exception 'prior facts or human-review reason overwritten';
  end if;

  select to_jsonb(j) into v_revised from survival_ops.a_wiki_native_jobs j
  where job_id=v_revised_id;
  if v_revised->>'status'<>'EXTRACTOR_SUBMITTED'
    or v_revised->>'supersedes_job_id'<>v_original_id::text
    or v_revised->>'review_revision'<>'1'
    or v_revised->'review_result' is not null
    or v_revised->'review_job' is not null
    or v_revised->'proposal' is not null
    or v_revised->'prepared_job' is distinct from v_before->'prepared_job'
    or v_revised->>'extractor_result_sha256'<>v_revision_sha then
    raise exception 'revision copied stale approval or changed source binding';
  end if;
  if v_revised->'extractor_result'->'nodes' is distinct from v_before->'extractor_result'->'nodes'
    or v_revised->'extractor_result'->'citations' is distinct from v_before->'extractor_result'->'citations'
    or v_revised->'extractor_result'->'relations'->0->>'label'
      <>v_correction->>'new_label' then
    raise exception 'revision changed unrelated evidence';
  end if;
  if public.archive_a_wiki_native_job_current()->>'status'<>'EXTRACTOR_SUBMITTED'
    or public.archive_a_wiki_native_job_recovery_current()->>'job_id'<>v_revised_id::text then
    raise exception 'revision did not unblock ordinary program worker';
  end if;
  if (select count(*) from survival_ops.a_wiki_native_review_revision_audits
    where prior_job_id=v_original_id and revised_job_id=v_revised_id
      and prior_review_sha256=v_before->>'review_result_sha256'
      and revised_extractor_sha256=v_revision_sha)<>1 then
    raise exception 'append-only revision audit missing';
  end if;

  v_response := public.archive_a_wiki_native_job_revise_human_relation(v_original_id,v_correction);
  if v_response->>'status'<>'ALREADY_REVISED' or v_response->>'job_id'<>v_revised_id::text then
    raise exception 'revision not idempotent';
  end if;
  v_response := public.archive_a_wiki_native_job_revise_human_relation(v_original_id,
    v_correction||jsonb_build_object('new_label','different'));
  if v_response->>'reason'<>'REVISION_ALREADY_EXISTS' then
    raise exception 'conflicting correction accepted';
  end if;
  begin
    update survival_ops.a_wiki_native_jobs set status='REVIEW_READY' where job_id=v_original_id;
    raise exception 'superseded review revived';
  exception when raise_exception then
    if sqlerrm<>'A_WIKI_NATIVE_TERMINAL_IMMUTABLE' then raise; end if;
  end;
  if (select count(*) from survival_ops.a_wiki_native_jobs
      where status not in ('PUBLISHED','SUPERSEDED'))<>1 then
    raise exception 'one-active ledger violated';
  end if;
end;
$verify$;
rollback;
