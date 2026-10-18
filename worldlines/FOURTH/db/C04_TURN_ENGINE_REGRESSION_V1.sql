-- Trusted-operator integration tests. All test Save/RAW/session writes roll back.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
DO $qa$
DECLARE
 before_save jsonb; before_session text; before_raw text; before_af text;
 ctx jsonb; a jsonb; b jsonb; c jsonb; ticket jsonb; diff jsonb;
 tc jsonb; ticket_case jsonb; changes_case jsonb; user_case text; gm_case text;
 got_code text; results jsonb:='[]'::jsonb;
 long_story text:=repeat('검증용 문장입니다. ',500);
 baseline_n bigint; baseline_events integer;
BEGIN
 SELECT to_jsonb(s) INTO before_save FROM survival_rpg.saves s WHERE worldline_id='WORLDLINE_04' FOR UPDATE;
 SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY id),'')) INTO before_session FROM survival_rpg.transcript_sessions t WHERE worldline_id='WORLDLINE_04';
 SELECT md5(coalesce(string_agg(to_jsonb(m)::text,',' ORDER BY id),'')),count(*) INTO before_raw,baseline_n FROM survival_rpg.transcript_messages m WHERE worldline_id='WORLDLINE_04';
 SELECT md5(to_jsonb(s)::text) INTO before_af FROM survival_rpg.saves s WHERE worldline_id='AFTERFALL';
 BEGIN
  ctx:=survival_rpg.get_c04_turn_context_v1(8);
  baseline_events:=jsonb_array_length(before_save#>'{state,recent_events}');
  IF (ctx#>>'{ticket,expected_version}')::integer<>(before_save->>'save_version')::integer
    OR jsonb_array_length(ctx#>'{state,recent_events}')<>least(8,baseline_events)
    OR (SELECT to_jsonb(s) FROM survival_rpg.saves s WHERE worldline_id='WORLDLINE_04') IS DISTINCT FROM before_save THEN
    RAISE EXCEPTION 'READ_OR_PROJECTION_FAILED';
  END IF;
  results:=results||jsonb_build_array('context_readonly_and_history_projection');
  diff:='[{"target":"state","op":"set","path":["supplies","qa_probe"],"value":1},{"target":"state","op":"append","path":["recent_events"],"value":{"event":"QA_ONLY_NOT_PLAY"}}]'::jsonb;
  a:=survival_rpg.commit_c04_turn_v1(ctx->'ticket','ㄱ',long_story,diff);
  IF a->>'status'<>'COMMITTED' OR (a->>'save_version')::integer<>(before_save->>'save_version')::integer+1
     OR (SELECT state#>>'{supplies,qa_probe}' FROM survival_rpg.saves WHERE worldline_id='WORLDLINE_04')<>'1'
     OR (SELECT jsonb_array_length(state->'recent_events') FROM survival_rpg.saves WHERE worldline_id='WORLDLINE_04')<>baseline_events+1 THEN
    RAISE EXCEPTION 'ATOMIC_DELTA_FAILED';
  END IF;
  results:=results||jsonb_build_array('atomic_state_and_raw','history_append_preserves_previous');
  IF (SELECT content FROM survival_rpg.transcript_messages WHERE id::text=a->>'gm_message_id') IS DISTINCT FROM long_story
     OR (SELECT content_sha256 FROM survival_rpg.transcript_messages WHERE id::text=a->>'gm_message_id') IS DISTINCT FROM
     encode(extensions.digest(convert_to(long_story,'UTF8'),'sha256'),'hex') THEN
    RAISE EXCEPTION 'LONG_EXACT_RAW_FAILED';
  END IF;
  results:=results||jsonb_build_array('long_korean_raw_exact_hash');
  b:=survival_rpg.commit_c04_turn_v1(ctx->'ticket','ㄱ',long_story,diff);
  IF b->>'replayed'<>'true' OR a->>'gm_message_id' IS DISTINCT FROM b->>'gm_message_id'
    OR (SELECT count(*) FROM survival_rpg.transcript_messages WHERE worldline_id='WORLDLINE_04')<>baseline_n+2 THEN
    RAISE EXCEPTION 'RETRY_FAILED';
  END IF;
  results:=results||jsonb_build_array('exact_retry_no_duplicate');
  got_code:=NULL;
  BEGIN PERFORM survival_rpg.commit_c04_turn_v1(ctx->'ticket','ㄱ',long_story||'DIFFERENT',diff);
  EXCEPTION WHEN OTHERS THEN got_code:=SQLSTATE; END;
  IF got_code IS DISTINCT FROM '23505' THEN RAISE EXCEPTION 'RETRY_BODY_CONFLICT_FAILED %',got_code; END IF;
  results:=results||jsonb_build_array('retry_changed_body_rejected');
  got_code:=NULL;
  BEGIN PERFORM survival_rpg.commit_c04_turn_v1(ctx->'ticket','ㄱ',long_story,'[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN got_code:=SQLSTATE; END;
  IF got_code IS DISTINCT FROM '23505' THEN RAISE EXCEPTION 'RETRY_DELTA_CONFLICT_FAILED %',got_code; END IF;
  results:=results||jsonb_build_array('retry_changed_delta_rejected');
  b:=survival_rpg.commit_c04_turn_v1(a->'next_ticket','USER_NEXT','GM_NEXT','[]'::jsonb);
  IF b->>'save_version' IS DISTINCT FROM a->>'save_version' OR b->>'state_changed'<>'false' THEN
    RAISE EXCEPTION 'NO_CHANGE_VERSION_FAILED';
  END IF;
  results:=results||jsonb_build_array('cached_next_ticket','no_change_no_narrative_version_increment');
  c:=survival_rpg.commit_c04_turn_v1(a->'next_ticket','USER_NEXT','GM_NEXT','[]'::jsonb);
  IF c->>'replayed'<>'true' THEN RAISE EXCEPTION 'RETRY_NO_CHANGE_FAILED'; END IF;
  results:=results||jsonb_build_array('no_change_exact_retry');
  ticket:=b->'next_ticket';
  FOR tc IN SELECT x FROM jsonb_array_elements('[
   {"name":"tool_diagnostic","user":"Codex could not read the local image","code":"22023"},
   {"name":"wrong_worldline","ticket":{"worldline_id":"AFTERFALL"},"code":"22023"},
   {"name":"missing_ticket_fields","empty_ticket":true,"code":"22023"},
   {"name":"stale_version","ticket":{"expected_version":1},"code":"40001"},
   {"name":"stale_snapshot_digest","ticket":{"base_digest":"bad"},"code":"40001"},
   {"name":"wrong_turn_order","ticket":{"turn_no":999999},"code":"23505"},
   {"name":"protected_world_identity","changes":[{"target":"state","op":"set","path":["worldline"],"value":"AFTERFALL"}],"code":"22023"},
   {"name":"protected_session_pointer","changes":[{"target":"gm_state","op":"set","path":["current_session_id"],"value":"other"}],"code":"22023"},
   {"name":"history_replacement","changes":[{"target":"state","op":"set","path":["recent_events"],"value":[]}],"code":"22023"},
   {"name":"missing_nested_parent","changes":[{"target":"state","op":"set","path":["__qa_missing__","x"],"value":1}],"code":"22023"},
   {"name":"container_null","changes":[{"target":"state","op":"set","path":["supplies"],"value":null}],"code":"22023"},
   {"name":"player_clock_rewind","changes":[{"target":"state","op":"set","path":["game_time"],"value":"D0 00:00"}],"code":"22023"},
   {"name":"invalid_clock_hour","changes":[{"target":"state","op":"set","path":["game_time"],"value":"D0 29:00"}],"code":"22023"},
   {"name":"null_changes","changes":null,"code":"22023"},
   {"name":"empty_gm","gm":"","code":"22023"},
   {"name":"array_index_missing","changes":[{"target":"state","op":"set","path":["vehicles","99999"],"value":{}}],"code":"22023"},
   {"name":"value_precondition","changes":[{"target":"state","op":"set","path":["supplies","qa_probe"],"expect":99,"value":2}],"code":"40001"}
  ]'::jsonb) x LOOP
   ticket_case:=ticket||coalesce(tc->'ticket','{}'::jsonb);
   IF tc->>'empty_ticket'='true' THEN ticket_case:='{}'::jsonb; END IF;
   changes_case:=CASE WHEN tc?'changes' THEN tc->'changes' ELSE '[]'::jsonb END;
   user_case:=coalesce(tc->>'user','QA_USER'); gm_case:=coalesce(tc->>'gm','QA_GM'); got_code:=NULL;
   BEGIN
    PERFORM survival_rpg.commit_c04_turn_v1(ticket_case,user_case,gm_case,changes_case);
   EXCEPTION WHEN OTHERS THEN got_code:=SQLSTATE; END;
   IF got_code IS DISTINCT FROM tc->>'code' THEN
    RAISE EXCEPTION 'NEGATIVE_CASE_FAILED % expected % got %',tc->>'name',tc->>'code',got_code;
   END IF;
   results:=results||jsonb_build_array(tc->>'name');
  END LOOP;
  got_code:=NULL;
  BEGIN
   UPDATE survival_rpg.saves SET state=jsonb_set(state,'{qa_external_change}','true') WHERE worldline_id='WORLDLINE_04';
   PERFORM survival_rpg.commit_c04_turn_v1(ticket,'QA','QA','[]');
  EXCEPTION WHEN SQLSTATE '40001' THEN got_code:=SQLSTATE; END;
  IF got_code IS DISTINCT FROM '40001' THEN RAISE EXCEPTION 'SAME_VERSION_EXTERNAL_CHANGE_NOT_CAUGHT'; END IF;
  results:=results||jsonb_build_array('unversioned_external_change_rejected');
  got_code:=NULL;
  BEGIN
   UPDATE survival_rpg.transcript_sessions SET status='CLOSED',closed_at=now() WHERE id::text=ticket->>'session_id';
   PERFORM survival_rpg.commit_c04_turn_v1(ticket,'QA','QA','[]');
  EXCEPTION WHEN SQLSTATE '55000' THEN got_code:=SQLSTATE; END;
  IF got_code IS DISTINCT FROM '55000' THEN RAISE EXCEPTION 'CLOSED_SESSION_NOT_CAUGHT'; END IF;
  results:=results||jsonb_build_array('closed_session_rejected');
  got_code:=NULL;
  BEGIN PERFORM survival_rpg.commit_c04_turn_v1(ctx->'ticket','ㄱ',long_story,diff);
  EXCEPTION WHEN SQLSTATE '40001' THEN got_code:=SQLSTATE; END;
  IF got_code IS DISTINCT FROM '40001' THEN RAISE EXCEPTION 'OLDER_REPLAY_NOT_BLOCKED'; END IF;
  results:=results||jsonb_build_array('older_retry_fail_closed');
  IF (SELECT count(*) FROM survival_rpg.transcript_messages WHERE worldline_id='WORLDLINE_04')<>baseline_n+4 THEN
    RAISE EXCEPTION 'NEGATIVE_CASE_PARTIAL_WRITE';
  END IF;
  results:=results||jsonb_build_array('all_rejections_leave_no_partial_raw');
  RAISE EXCEPTION 'rollback synthetic story and Save changes' USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 IF before_save IS DISTINCT FROM (SELECT to_jsonb(s) FROM survival_rpg.saves s WHERE worldline_id='WORLDLINE_04')
   OR before_session IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY id),'')) FROM survival_rpg.transcript_sessions t WHERE worldline_id='WORLDLINE_04')
   OR before_raw IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(m)::text,',' ORDER BY id),'')) FROM survival_rpg.transcript_messages m WHERE worldline_id='WORLDLINE_04')
   OR before_af IS DISTINCT FROM (SELECT md5(to_jsonb(s)::text) FROM survival_rpg.saves s WHERE worldline_id='AFTERFALL') THEN
   RAISE EXCEPTION 'ROLLBACK_PRESERVATION_FAILED';
 END IF;
 results:=results||jsonb_build_array('full_save_raw_session_and_afterfall_preserved');
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='survival_rpg' AND p.proname IN ('get_c04_turn_context_v1','commit_c04_turn_v1')
   AND (p.prosecdef OR has_function_privilege('anon',p.oid,'EXECUTE')
     OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE'))) THEN
   RAISE EXCEPTION 'FUNCTION_PRIVILEGE_FAILED';
 END IF;
 results:=results||jsonb_build_array('invoker_and_operator_only_execute');
 PERFORM set_config('c04.qa_result',jsonb_build_object('passed',jsonb_array_length(results),'tests',results,
   'long_story_characters',char_length(long_story),'actual_save_version',before_save->'save_version',
   'actual_raw_rows',baseline_n,'test_writes_retained',0,'separate_connection_race_tested',false)::text,true);
END;
$qa$;
SELECT current_setting('c04.qa_result')::jsonb AS test_report;
ROLLBACK;
