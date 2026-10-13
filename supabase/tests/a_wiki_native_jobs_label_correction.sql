\set ON_ERROR_STOP on
-- Isolated CI only. No operating rows are touched; all fixtures roll back.
begin;
do $test$
declare
  v_text text := '체육시설 서비스도로 바깥에 확보한 위험물 부지는 사용권만 있고 저장시설은 미개설이다.';
  v_job jsonb;
  v_id uuid;
  v_result jsonb;
  v_correction jsonb;
  v_bad jsonb;
  v_before jsonb;
  v_after jsonb;
  v_sha text;
begin
  if has_function_privilege('anon','public.archive_a_wiki_native_job_correct_label(uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.archive_a_wiki_native_job_correct_label(uuid,jsonb)','EXECUTE')
    or not has_function_privilege('service_role','public.archive_a_wiki_native_job_correct_label(uuid,jsonb)','EXECUTE')
    or has_function_privilege('anon','survival_ops.a_wiki_label_correction_valid(survival_ops.a_wiki_native_jobs,jsonb)','EXECUTE')
    or has_table_privilege('service_role','survival_ops.a_wiki_native_jobs','UPDATE')
    or not (select relrowsecurity from pg_class where oid='survival_ops.a_wiki_native_jobs'::regclass) then
    raise exception 'label correction privileges widened';
  end if;
  v_job := jsonb_build_object('version','wiki-fact-job-v1','job_id','wiki-job-'||repeat('1',64),
    'chronicle_id','C03-AFTERFALL','worldline_id','AFTERFALL','visibility','PUBLIC_ARCHIVE','season_id','S04',
    'graph_sha256',repeat('a',64),'source',jsonb_build_object('session_id','SESSION_002',
      'manifest_ref','archive/content/transcripts/C03-AFTERFALL/S04/SESSION_002/SOURCE_MANIFEST.json',
      'manifest_sha256',repeat('b',64),'gm_blocks',jsonb_build_array(jsonb_build_object(
        'block_id','005','text',v_text,'sha256',encode(extensions.digest(convert_to(v_text,'UTF8'),'sha256'),'hex')))));
  v_result := public.archive_a_wiki_native_job_prepare(v_job,repeat('1',40));
  v_id := (v_result->>'job_id')::uuid;
  v_sha := v_result->>'binding_sha256';
  v_result := public.archive_a_wiki_native_job_submit(v_id,'EXTRACTOR_READY',v_sha,
    jsonb_build_object('version','wiki-fact-result-v1','job_id',v_job->>'job_id',
      'nodes',jsonb_build_array(jsonb_build_object('key','new:guild-fuel-hazard-site',
        'existing_id',null,'type','location','label','체육시설 서비스도로 바깥 위험물 부지',
        'changes',jsonb_build_object('summary','사용권만 확보; 저장시설 미개설'),
        'evidence',jsonb_build_object('label',jsonb_build_array('hazard_site')))),
      'citations',jsonb_build_array(jsonb_build_object('id','hazard_site','block_id','005','quote',v_text))));
  perform public.archive_a_wiki_native_job_advance(v_id,'EXTRACTOR_SUBMITTED','BLOCKED',
    p_blocker_code=>'WIKI_NEW_NAME_NOT_IN_EVIDENCE');
  select to_jsonb(j) into v_before from survival_ops.a_wiki_native_jobs j where job_id=v_id;
  v_correction := jsonb_build_object('version','a-wiki-label-correction-v1','job_id',v_id::text,
    'extractor_result_sha256',v_before->>'extractor_result_sha256','prepared_job_sha256',v_sha,
    'source_sha256',repeat('b',64),'graph_sha256',repeat('a',64),
    'node_key','new:guild-fuel-hazard-site','old_label','체육시설 서비스도로 바깥 위험물 부지',
    'new_label','체육시설 서비스도로 바깥에 확보한 위험물 부지',
    'citation_id','hazard_site','block_id','005','reason','Explicitly approved continuous source name; usage right only, no operating facility.');
  foreach v_bad in array array[
    v_correction||'{"job_id":"00000000-0000-0000-0000-000000000000"}'::jsonb,
    v_correction||jsonb_build_object('extractor_result_sha256',repeat('c',64)),
    v_correction||jsonb_build_object('prepared_job_sha256',repeat('c',64)),
    v_correction||jsonb_build_object('source_sha256',repeat('c',64)),
    v_correction||jsonb_build_object('graph_sha256',repeat('c',64)),
    v_correction||'{"node_key":"new:other"}'::jsonb,
    v_correction||'{"old_label":"wrong"}'::jsonb,
    v_correction||'{"new_label":"연료 저장시설 운영"}'::jsonb,
    v_correction||'{"citation_id":"other"}'::jsonb,
    v_correction||'{"block_id":"003"}'::jsonb,
    v_correction||'{"reason":""}'::jsonb,
    v_correction||'{"extra":"forbidden"}'::jsonb,
    v_correction-'reason'
  ] loop
    v_result := public.archive_a_wiki_native_job_correct_label(v_id,v_bad);
    if v_result->>'status'<>'REJECTED' then raise exception 'invalid correction accepted: %',v_bad; end if;
    select to_jsonb(j) into v_after from survival_ops.a_wiki_native_jobs j where job_id=v_id;
    if v_before<>v_after then raise exception 'rejection mutated original'; end if;
  end loop;
  begin
    update survival_ops.a_wiki_native_jobs set status='EXTRACTOR_SUBMITTED',blocker_code=null where job_id=v_id;
    raise exception 'unguarded reset accepted';
  exception when raise_exception then
    if sqlerrm<>'A_WIKI_NATIVE_TRANSITION_INVALID' then raise; end if;
  end;
  begin
    update survival_ops.a_wiki_native_jobs set status='EXTRACTOR_SUBMITTED',blocker_code=null,
      label_correction=v_correction,extractor_result=extractor_result||'{"note":"tamper"}'::jsonb where job_id=v_id;
    raise exception 'correction erased original evidence';
  exception when raise_exception then
    if sqlerrm<>'A_WIKI_LABEL_CORRECTION_IMMUTABLE' then raise; end if;
  end;
  v_result := public.archive_a_wiki_native_job_correct_label(v_id,v_correction);
  if v_result->>'status'<>'EXTRACTOR_SUBMITTED' then raise exception 'valid correction failed: %',v_result; end if;
  select to_jsonb(j) into v_after from survival_ops.a_wiki_native_jobs j where job_id=v_id;
  if (v_before-array['status','blocker_code','label_correction','updated_at'])
    <> (v_after-array['status','blocker_code','label_correction','updated_at']) then
    raise exception 'original payload, timestamps or hashes changed';
  end if;
  v_before := v_after;
  v_result := public.archive_a_wiki_native_job_correct_label(v_id,v_correction);
  if v_result->>'status'<>'ALREADY_APPLIED' then raise exception 'not idempotent'; end if;
  select to_jsonb(j) into v_after from survival_ops.a_wiki_native_jobs j where job_id=v_id;
  if v_before<>v_after then raise exception 'idempotent call changed row'; end if;
  v_result := public.archive_a_wiki_native_job_correct_label(v_id,v_correction||'{"reason":"different"}'::jsonb);
  if v_result->>'reason'<>'CORRECTION_ALREADY_EXISTS' then raise exception 'second correction accepted'; end if;
  begin
    update survival_ops.a_wiki_native_jobs set label_correction=null where job_id=v_id;
    raise exception 'correction deletion accepted';
  exception when raise_exception then
    if sqlerrm<>'A_WIKI_LABEL_CORRECTION_IMMUTABLE' then raise; end if;
  end;
  perform public.archive_a_wiki_native_job_advance(v_id,'EXTRACTOR_SUBMITTED','BLOCKED',p_blocker_code=>'WIKI_QUOTE_NOT_FOUND');
  v_result := public.archive_a_wiki_native_job_correct_label(v_id,v_correction);
  if v_result->>'status'<>'ALREADY_APPLIED' or v_result->>'job_status'<>'BLOCKED' then
    raise exception 'idempotent replay retried a new semantic blocker';
  end if;
end;
$test$;
rollback;
