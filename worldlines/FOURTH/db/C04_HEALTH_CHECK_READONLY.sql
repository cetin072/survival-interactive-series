-- C04 quick health probe. READ ONLY, no session opening, no writes.
-- Baseline user turns 0..6 are known to include image-reader diagnostics; never rewrite them.
WITH c04 AS (
 SELECT save_version,state,gm_state
 FROM survival_rpg.saves
 WHERE worldline_id='WORLDLINE_04'
),
turns AS (
 SELECT session_id,turn_no,
 count(*) FILTER(WHERE role='USER') AS u,
 count(*) FILTER(WHERE role='GM') AS g
 FROM survival_rpg.transcript_messages
 WHERE worldline_id='WORLDLINE_04' AND chronicle_id='C04' AND season_id='S01'
 GROUP BY session_id,turn_no
)
SELECT
 (SELECT save_version FROM c04) AS current_save_version,
 (SELECT state->>'game_time' FROM c04) AS game_time,
 (SELECT state->>'current_scene' FROM c04) AS current_scene,
 (SELECT state#>>'{go_bag,worn}' FROM c04) AS bag_worn,
 (SELECT state#>>'{go_bag,location}' FROM c04) AS bag_location,
 (SELECT count(*) FROM turns WHERE u<>1 OR g<>1) AS incomplete_turns,
 (SELECT count(*) FROM survival_rpg.transcript_messages WHERE worldline_id='WORLDLINE_04'
   AND role='USER' AND turn_no >= 7
   AND (content LIKE '%Codex could not read the local image%'
    OR content LIKE '%No such file or directory (os error 2)%')) AS NEW_USER_TOOL_DIAGNOSTICS,
 (SELECT count(*) FROM survival_rpg.transcript_sessions WHERE worldline_id='WORLDLINE_04' AND status='OPEN') AS open_sessions,
 (SELECT save_version FROM survival_rpg.saves WHERE worldline_id='AFTERFALL') AS preserved_afterfall_version;
