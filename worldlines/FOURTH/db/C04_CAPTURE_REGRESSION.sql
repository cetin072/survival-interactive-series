-- Run as trusted migration/test operator only; ALWAYS ROLLBACK.
-- Checks C04-only append, deterministic idempotency, SHA, and tool-diagnostic rejection.
BEGIN;
SET LOCAL statement_timeout = '15000ms';
DO $test$
DECLARE a record; b record; reject_seen boolean := false; msg_count integer; sha_count integer;
BEGIN
 PERFORM survival_rpg.open_public_transcript_session(
   'a10d01aa-7777-4444-8888-000000000404'::uuid,
   'WORLDLINE_04','C04','S01',NULL,'QA_ONLY','QA_ONLY');
 SELECT * INTO a FROM survival_rpg.append_c04_public_turn(
   'a10d01aa-7777-4444-8888-000000000404'::uuid,0,
   'QA_USER_NOT_PLAY','QA_GM_NOT_PLAY',NULL,NULL,'QA_ONLY','QA_ONLY','RECOVERY');
 SELECT * INTO b FROM survival_rpg.append_c04_public_turn(
   'a10d01aa-7777-4444-8888-000000000404'::uuid,0,
   'QA_USER_NOT_PLAY','QA_GM_NOT_PLAY',NULL,NULL,'QA_ONLY','QA_ONLY','RECOVERY');
 IF a.user_message_id IS DISTINCT FROM b.user_message_id
 OR a.gm_message_id IS DISTINCT FROM b.gm_message_id
 OR a.user_message_order <> 0 OR a.gm_message_order <> 1 THEN
   RAISE EXCEPTION 'C04_REGRESSION_IDEMPOTENCY';
 END IF;
 BEGIN
   PERFORM survival_rpg.append_c04_public_turn(
     'a10d01aa-7777-4444-8888-000000000404'::uuid,1,
     'Codex could not read the local image','QA_GM',NULL,NULL,'QA_ONLY','QA_ONLY','RECOVERY');
 EXCEPTION WHEN SQLSTATE '22023' THEN reject_seen := true;
 END;
 IF NOT reject_seen THEN RAISE EXCEPTION 'C04_REGRESSION_TOOL_DIAGNOSTIC'; END IF;
 SELECT count(*),count(*) FILTER(
   WHERE content_sha256=encode(extensions.digest(convert_to(content,'UTF8'),'sha256'),'hex'))
 INTO msg_count,sha_count FROM survival_rpg.transcript_messages
 WHERE session_id='a10d01aa-7777-4444-8888-000000000404'::uuid;
 IF msg_count <> 2 OR sha_count <> 2 THEN
   RAISE EXCEPTION 'C04_REGRESSION_HASH_OR_ROWCOUNT';
 END IF;
 IF has_function_privilege('anon',
   'survival_rpg.append_c04_public_turn(uuid,integer,text,text,integer,integer,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'survival_rpg.append_c04_public_turn(uuid,integer,text,text,integer,integer,text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'survival_rpg.append_c04_public_turn(uuid,integer,text,text,integer,integer,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'C04_REGRESSION_PRIVILEGES'; END IF;
END $test$;
SELECT 'C04_CAPTURE_QA_PASS_BEFORE_ROLLBACK' AS result;
ROLLBACK;
