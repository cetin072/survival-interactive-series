-- C04-only additive writer; do not generalize or modify AFTERFALL/C03 functions.
-- To deploy: independent audit -> transactional rehearsal -> approved additive migration.
CREATE OR REPLACE FUNCTION survival_rpg.append_c04_public_turn(
  p_session_id uuid, p_turn_no integer, p_user_content text, p_gm_content text,
  p_user_save_version integer DEFAULT NULL, p_gm_save_version integer DEFAULT NULL,
  p_game_time text DEFAULT NULL, p_scene_id text DEFAULT NULL,
  p_source_type text DEFAULT 'LIVE')
RETURNS TABLE(user_message_id uuid, gm_message_id uuid,
              user_message_order integer, gm_message_order integer)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog', 'extensions', 'survival_rpg'
AS $c04$
BEGIN
  IF p_session_id IS NULL OR p_turn_no IS NULL OR p_turn_no < 0 OR p_turn_no > 100000000 THEN
    RAISE EXCEPTION 'C04_INVALID_TURN' USING ERRCODE='22023';
  END IF;
  IF COALESCE(btrim(p_user_content),'') = '' OR COALESCE(btrim(p_gm_content),'') = '' THEN
    RAISE EXCEPTION 'C04_EMPTY_PUBLIC_TEXT' USING ERRCODE='22023';
  END IF;
  IF position('Codex could not read the local image' IN p_user_content) > 0
     OR position('No such file or directory (os error 2)' IN p_user_content) > 0 THEN
    RAISE EXCEPTION 'C04_USER_CAPTURE_CONTAINS_TOOL_DIAGNOSTIC' USING ERRCODE='22023';
  END IF;
  IF p_source_type NOT IN ('LIVE','RECOVERY') THEN
    RAISE EXCEPTION 'C04_INVALID_SOURCE_TYPE' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT t.user_message_id,t.gm_message_id,
                      t.user_message_order,t.gm_message_order
  FROM survival_rpg.append_public_transcript_turn(
    p_session_id=>p_session_id,
    p_worldline_id=>'WORLDLINE_04', p_chronicle_id=>'C04', p_season_id=>'S01',
    p_turn_no=>p_turn_no, p_user_message_order=>p_turn_no*2,
    p_user_content=>p_user_content,
    p_user_content_sha256=>encode(extensions.digest(convert_to(p_user_content,'UTF8'),'sha256'),'hex'),
    p_user_idempotency_key=>md5(p_session_id::text||':'||p_turn_no::text||':USER')::uuid,
    p_gm_content=>p_gm_content,
    p_gm_content_sha256=>encode(extensions.digest(convert_to(p_gm_content,'UTF8'),'sha256'),'hex'),
    p_gm_idempotency_key=>md5(p_session_id::text||':'||p_turn_no::text||':GM')::uuid,
    p_user_game_time=>p_game_time, p_user_scene_id=>p_scene_id,
    p_user_save_version=>p_user_save_version,
    p_gm_game_time=>p_game_time, p_gm_scene_id=>p_scene_id,
    p_gm_save_version=>p_gm_save_version, p_source_type=>p_source_type
  ) AS t;
END;
$c04$;
REVOKE ALL ON FUNCTION survival_rpg.append_c04_public_turn(uuid,integer,text,text,integer,integer,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION survival_rpg.append_c04_public_turn(uuid,integer,text,text,integer,integer,text,text,text) TO service_role;
