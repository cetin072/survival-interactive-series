-- Two C04/S01 functions only. No tables, external APIs, paid workers, or legacy writes.
-- Both run as the caller; current deployment uses the existing trusted postgres SQL connector.
-- Do not grant table access or switch to SECURITY DEFINER to make another caller work.

CREATE OR REPLACE FUNCTION survival_rpg.get_c04_turn_context_v1(p_recent_limit integer DEFAULT 8)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, survival_rpg AS $fn$
DECLARE
  s survival_rpg.saves%ROWTYPE;
  t survival_rpg.transcript_sessions%ROWTYPE;
  tail jsonb;
  n integer;
  total integer;
  max_order integer;
  pair_ok boolean;
BEGIN
  IF p_recent_limit IS NULL OR p_recent_limit < 0 OR p_recent_limit > 50 THEN
    RAISE EXCEPTION 'C04_INVALID_CONTEXT_LIMIT' USING ERRCODE='22023';
  END IF;
  SELECT * INTO s FROM survival_rpg.saves WHERE worldline_id='WORLDLINE_04';
  IF NOT FOUND OR s.state->>'worldline' IS DISTINCT FROM 'WORLDLINE_04'
    OR s.state->>'chronicle_id' IS DISTINCT FROM 'C04'
    OR s.state->>'season' IS DISTINCT FROM '1'
    OR s.state->>'status' IS DISTINCT FROM 'PLAYING' THEN
    RAISE EXCEPTION 'C04_LIVE_IDENTITY_REQUIRED' USING ERRCODE='55000';
  END IF;
  SELECT * INTO t FROM survival_rpg.transcript_sessions
   WHERE id::text=s.gm_state->>'current_session_id';
  IF NOT FOUND OR t.worldline_id IS DISTINCT FROM 'WORLDLINE_04'
    OR t.chronicle_id IS DISTINCT FROM 'C04' OR t.season_id IS DISTINCT FROM 'S01'
    OR t.status IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'C04_ACTIVE_SESSION_REQUIRED' USING ERRCODE='55000';
  END IF;
  IF (SELECT count(*) FROM survival_rpg.transcript_sessions
      WHERE worldline_id='WORLDLINE_04' AND status='OPEN') <> 1
      OR t.last_message_order < -1 OR mod(t.last_message_order+1,2)<>0 THEN
    RAISE EXCEPTION 'C04_SESSION_OR_PAIR_AMBIGUOUS' USING ERRCODE='55000';
  END IF;
  SELECT max(message_order) INTO max_order FROM survival_rpg.transcript_messages WHERE session_id=t.id;
  IF coalesce(max_order,-1)<>t.last_message_order THEN
    RAISE EXCEPTION 'C04_TRANSCRIPT_HEAD_MISMATCH' USING ERRCODE='55000';
  END IF;
  IF t.last_message_order >= 1 THEN
    SELECT count(*)=2 AND bool_and(
      (message_order=t.last_message_order-1 AND role='USER'
       OR message_order=t.last_message_order AND role='GM')
      AND worldline_id='WORLDLINE_04' AND chronicle_id='C04' AND season_id='S01'
      AND turn_no=(t.last_message_order-1)/2)
      INTO pair_ok FROM survival_rpg.transcript_messages
      WHERE session_id=t.id AND message_order BETWEEN t.last_message_order-1 AND t.last_message_order;
    IF pair_ok IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'C04_LAST_PAIR_INVALID' USING ERRCODE='55000';
    END IF;
  END IF;
  n:=(t.last_message_order+1)/2;
  IF jsonb_typeof(s.state->'recent_events') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'C04_EVENTS_NOT_ARRAY' USING ERRCODE='22023';
  END IF;
  total:=jsonb_array_length(s.state->'recent_events');
  SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO tail
   FROM jsonb_array_elements(s.state->'recent_events') WITH ORDINALITY e(value,ord)
   WHERE ord > greatest(0,total-p_recent_limit);
  RETURN jsonb_build_object(
    'ticket',jsonb_build_object('worldline_id','WORLDLINE_04','chronicle_id','C04','season_id','S01',
      'session_id',t.id,'expected_version',s.save_version,'turn_no',n,
      'base_digest',md5(s.state::text||s.gm_state::text)),
    'state',jsonb_set(s.state,'{recent_events}',tail),
    'gm_state',s.gm_state-'_turn_commit_v1',
    'history',jsonb_build_object('total_events',total,'returned_events',jsonb_array_length(tail),
      'projection_only',true,'full_history_retained',true),
    'decision_pending',coalesce(s.state->'pending_choice','null'::jsonb)<>'null'::jsonb);
END;
$fn$;

CREATE OR REPLACE FUNCTION survival_rpg.commit_c04_turn_v1(
 p_ticket jsonb,p_user_content text,p_gm_content text,p_changes jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, survival_rpg
SET lock_timeout = '2s' AS $fn$
DECLARE
 s survival_rpg.saves%ROWTYPE;
 t survival_rpg.transcript_sessions%ROWTYPE;
 sid uuid;
 n integer;
 expected integer;
 req_hash text;
 receipt jsonb;
 st jsonb;
 gm jsonb;
 doc jsonb;
 change jsonb;
 path text[];
 parent jsonb;
 old_value jsonb;
 value jsonb;
 op text;
 target text;
 k text;
 changed boolean;
 new_v integer;
 result jsonb;
 raw_pair record;
 old_time text[];
 new_time text[];
BEGIN
 IF jsonb_typeof(p_ticket) IS DISTINCT FROM 'object'
   OR p_ticket->>'worldline_id' IS DISTINCT FROM 'WORLDLINE_04'
   OR p_ticket->>'chronicle_id' IS DISTINCT FROM 'C04'
   OR p_ticket->>'season_id' IS DISTINCT FROM 'S01'
   OR NOT (p_ticket ?& ARRAY['session_id','expected_version','turn_no','base_digest'])
   OR jsonb_typeof(p_changes) IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'C04_INVALID_REQUEST' USING ERRCODE='22023';
 END IF;
 IF coalesce(btrim(p_user_content),'')='' OR coalesce(btrim(p_gm_content),'')=''
   OR jsonb_array_length(p_changes)>64 THEN
   RAISE EXCEPTION 'C04_EMPTY_TEXT_OR_TOO_MANY_CHANGES' USING ERRCODE='22023';
 END IF;
 sid:=(p_ticket->>'session_id')::uuid;
 n:=(p_ticket->>'turn_no')::integer;
 expected:=(p_ticket->>'expected_version')::integer;
 IF sid IS NULL OR n IS NULL OR n<0 OR expected IS NULL OR expected<1
   OR p_ticket->>'base_digest' IS NULL THEN
   RAISE EXCEPTION 'C04_INCOMPLETE_TICKET' USING ERRCODE='22023';
 END IF;
 -- Lock order is Save then session. Other writers may fail/retry but cannot overwrite this commit.
 SELECT * INTO s FROM survival_rpg.saves WHERE worldline_id='WORLDLINE_04' FOR UPDATE;
 IF NOT FOUND OR s.state->>'worldline' IS DISTINCT FROM 'WORLDLINE_04'
   OR s.state->>'chronicle_id' IS DISTINCT FROM 'C04'
   OR s.state->>'season' IS DISTINCT FROM '1' OR s.state->>'status' IS DISTINCT FROM 'PLAYING'
   OR s.gm_state->>'current_session_id' IS DISTINCT FROM sid::text THEN
   RAISE EXCEPTION 'C04_LIVE_IDENTITY_OR_SESSION_CHANGED' USING ERRCODE='55000';
 END IF;
 SELECT * INTO t FROM survival_rpg.transcript_sessions WHERE id=sid FOR UPDATE;
 IF NOT FOUND OR t.status IS DISTINCT FROM 'OPEN' OR t.worldline_id IS DISTINCT FROM 'WORLDLINE_04'
   OR t.chronicle_id IS DISTINCT FROM 'C04' OR t.season_id IS DISTINCT FROM 'S01' THEN
   RAISE EXCEPTION 'C04_ACTIVE_SESSION_REQUIRED' USING ERRCODE='55000';
 END IF;
 req_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
   'ticket',p_ticket,'user',p_user_content,'gm',p_gm_content,'changes',p_changes)::text,'UTF8'),'sha256'),'hex');
 receipt:=s.gm_state->'_turn_commit_v1';
 -- An exact retry of the most recent commit returns its prior receipt, not a second state update.
 IF receipt->>'session_id'=sid::text AND receipt->>'turn_no'=n::text THEN
   IF receipt->>'request_sha256' IS DISTINCT FROM req_hash THEN
     RAISE EXCEPTION 'C04_RETRY_PAYLOAD_CONFLICT' USING ERRCODE='23505';
   END IF;
   IF (SELECT count(*) FROM survival_rpg.transcript_messages
       WHERE session_id=sid AND turn_no=n AND
       (role='USER' AND id::text=receipt#>>'{result,user_message_id}' AND content=p_user_content
        OR role='GM' AND id::text=receipt#>>'{result,gm_message_id}' AND content=p_gm_content))<>2 THEN
     RAISE EXCEPTION 'C04_RECEIPT_RAW_MISMATCH' USING ERRCODE='55000';
   END IF;
   RETURN receipt->'result'||jsonb_build_object('replayed',true,'current_save_version',s.save_version);
 END IF;
 IF s.save_version<>expected OR md5(s.state::text||s.gm_state::text) IS DISTINCT FROM p_ticket->>'base_digest' THEN
   RAISE EXCEPTION 'C04_STALE_TICKET_RELOAD_CONTEXT' USING ERRCODE='40001';
 END IF;
 IF (SELECT count(*) FROM survival_rpg.transcript_sessions WHERE worldline_id='WORLDLINE_04' AND status='OPEN')<>1 THEN
   RAISE EXCEPTION 'C04_SESSION_AMBIGUOUS' USING ERRCODE='55000';
 END IF;
 IF t.last_message_order <> n*2-1 THEN
   RAISE EXCEPTION 'C04_TURN_ORDER_CONFLICT' USING ERRCODE='23505';
 END IF;
 st:=s.state; gm:=s.gm_state;
 FOR change IN SELECT e.value FROM jsonb_array_elements(p_changes) e(value) LOOP
   IF jsonb_typeof(change) IS DISTINCT FROM 'object' OR NOT(change ? 'value')
     OR jsonb_typeof(change->'path') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'C04_INVALID_CHANGE' USING ERRCODE='22023';
   END IF;
   target:=change->>'target'; op:=change->>'op'; value:=change->'value';
   IF target IS NULL OR target NOT IN ('state','gm_state') OR op IS NULL OR op NOT IN ('set','append')
     OR jsonb_array_length(change->'path') NOT BETWEEN 1 AND 8
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(change->'path') x
       WHERE jsonb_typeof(x)<>'string' OR x#>>'{}'='') THEN
     RAISE EXCEPTION 'C04_INVALID_CHANGE_PATH_OR_OPERATION' USING ERRCODE='22023';
   END IF;
   SELECT array_agg(v ORDER BY ord) INTO path FROM jsonb_array_elements_text(change->'path') WITH ORDINALITY a(v,ord);
   IF target='state' AND path[1]=ANY(ARRAY['worldline','chronicle_id','season','attempt','status'])
     OR target='gm_state' AND path[1]=ANY(ARRAY['worldline','status','current_session_id','last_transcript_turn_no','_turn_commit_v1'])
     OR target='state' AND path[1]='recent_events' AND (cardinality(path)<>1 OR op<>'append') THEN
     RAISE EXCEPTION 'C04_PROTECTED_FIELD_OR_HISTORY_REWRITE' USING ERRCODE='22023';
   END IF;
   doc:=CASE target WHEN 'state' THEN st ELSE gm END;
   parent:=CASE WHEN cardinality(path)=1 THEN doc ELSE doc#>path[1:cardinality(path)-1] END;
   IF parent IS NULL OR jsonb_typeof(parent) NOT IN ('object','array') THEN
     RAISE EXCEPTION 'C04_CHANGE_PARENT_MISSING' USING ERRCODE='22023';
   END IF;
   IF jsonb_typeof(parent)='array' THEN
     k:=path[cardinality(path)];
     IF k!~'^[0-9]{1,8}$' THEN RAISE EXCEPTION 'C04_INVALID_ARRAY_INDEX' USING ERRCODE='22023'; END IF;
     IF k::integer>=jsonb_array_length(parent) THEN RAISE EXCEPTION 'C04_ARRAY_INDEX_OUT_OF_RANGE' USING ERRCODE='22023'; END IF;
   END IF;
   old_value:=doc#>path;
   IF change ? 'expect' AND old_value IS DISTINCT FROM change->'expect' THEN
     RAISE EXCEPTION 'C04_VALUE_PRECONDITION_FAILED' USING ERRCODE='40001';
   END IF;
   IF op='append' THEN
     IF jsonb_typeof(old_value) IS DISTINCT FROM 'array' THEN
       RAISE EXCEPTION 'C04_APPEND_REQUIRES_ARRAY' USING ERRCODE='22023';
     END IF;
     doc:=jsonb_set(doc,path,old_value||jsonb_build_array(value),false);
   ELSE
     IF old_value IS NOT NULL AND old_value<>'null'::jsonb AND value<>'null'::jsonb
       AND jsonb_typeof(old_value)<>jsonb_typeof(value) THEN
       RAISE EXCEPTION 'C04_FIELD_TYPE_CHANGED' USING ERRCODE='22023';
     END IF;
     doc:=jsonb_set(doc,path,value,true);
   END IF;
   IF target='state' THEN st:=doc; ELSE gm:=doc; END IF;
 END LOOP;
 FOR k IN SELECT e.key FROM jsonb_each(s.state) e(key,value)
   WHERE jsonb_typeof(e.value) IN ('array','object') AND e.key<>'pending_choice' LOOP
   IF jsonb_typeof(st->k) IS DISTINCT FROM jsonb_typeof(s.state->k) THEN
     RAISE EXCEPTION 'C04_STATE_CONTAINER_TYPE_CHANGED' USING ERRCODE='22023';
   END IF;
 END LOOP;
 old_time:=regexp_match(s.state->>'game_time','^D([0-9]+) ([0-2][0-9]):([0-5][0-9])$');
 new_time:=regexp_match(st->>'game_time','^D([0-9]+) ([0-2][0-9]):([0-5][0-9])$');
 IF new_time IS NULL OR new_time[2]::integer>23 OR old_time IS NULL
   OR new_time[1]::bigint*1440+new_time[2]::integer*60+new_time[3]::integer
      < old_time[1]::bigint*1440+old_time[2]::integer*60+old_time[3]::integer THEN
   RAISE EXCEPTION 'C04_INVALID_OR_REWOUND_PLAYER_TIME' USING ERRCODE='22023';
 END IF;
 IF coalesce(btrim(st->>'current_scene'),'')='' THEN
   RAISE EXCEPTION 'C04_SCENE_REQUIRED' USING ERRCODE='22023';
 END IF;
 changed:=st IS DISTINCT FROM s.state OR gm IS DISTINCT FROM s.gm_state;
 new_v:=s.save_version+CASE WHEN changed THEN 1 ELSE 0 END;
 -- Existing C04 guard still checks contamination, exact UTF-8 SHA, and deterministic retry IDs.
 SELECT * INTO raw_pair FROM survival_rpg.append_c04_public_turn(
   sid,n,p_user_content,p_gm_content,s.save_version,new_v,st->>'game_time',st->>'current_scene','LIVE');
 result:=jsonb_build_object('status','COMMITTED','replayed',false,'session_id',sid,'turn_no',n,
   'save_version',new_v,'state_changed',changed,'user_message_id',raw_pair.user_message_id,
   'gm_message_id',raw_pair.gm_message_id,'gm_characters',char_length(p_gm_content));
 gm:=jsonb_set(gm,'{last_transcript_turn_no}',to_jsonb(n),true);
 gm:=jsonb_set(gm,'{_turn_commit_v1}',jsonb_build_object('session_id',sid,'turn_no',n,
   'request_sha256',req_hash,'result',result),true);
 UPDATE survival_rpg.saves SET state=st,gm_state=gm,save_version=new_v,updated_at=now()
   WHERE worldline_id='WORLDLINE_04' AND save_version=expected;
 IF NOT FOUND THEN RAISE EXCEPTION 'C04_STATE_CAS_FAILED' USING ERRCODE='40001'; END IF;
 RETURN result||jsonb_build_object('next_ticket',jsonb_build_object(
   'worldline_id','WORLDLINE_04','chronicle_id','C04','season_id','S01','session_id',sid,
   'expected_version',new_v,'turn_no',n+1,'base_digest',md5(st::text||gm::text)));
END;
$fn$;

-- Only the owner/trusted SQL operator can execute these two functions.
-- Existing service_role does not have saves-table access; do not broaden it here.
REVOKE ALL ON FUNCTION survival_rpg.get_c04_turn_context_v1(integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION survival_rpg.commit_c04_turn_v1(jsonb,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
