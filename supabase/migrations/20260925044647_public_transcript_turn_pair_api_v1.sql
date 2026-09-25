-- Applied to the connected Supabase project as migration 20260925044647.
-- Purpose: atomically capture one PLAYER_SAFE USER->GM gameplay turn.
-- This wrapper prevents half-turn persistence when the GM response append fails.

create or replace function survival_rpg.append_public_transcript_turn(
  p_session_id uuid,
  p_worldline_id text,
  p_chronicle_id text,
  p_season_id text,
  p_turn_no integer,
  p_user_message_order integer,
  p_user_content text,
  p_user_content_sha256 text,
  p_user_idempotency_key uuid,
  p_gm_content text,
  p_gm_content_sha256 text,
  p_gm_idempotency_key uuid,
  p_user_game_time text default null,
  p_user_scene_id text default null,
  p_user_save_version integer default null,
  p_gm_game_time text default null,
  p_gm_scene_id text default null,
  p_gm_save_version integer default null,
  p_source_type text default 'LIVE'
)
returns table (
  user_message_id uuid,
  gm_message_id uuid,
  user_message_order integer,
  gm_message_order integer
)
language plpgsql
security invoker
set search_path = pg_catalog, survival_rpg
as $$
declare
  v_user survival_rpg.transcript_messages%rowtype;
  v_gm survival_rpg.transcript_messages%rowtype;
begin
  if p_user_message_order is null or p_user_message_order < 0 then
    raise exception 'user message_order must be >= 0' using errcode = '22023';
  end if;

  if p_user_idempotency_key is null or p_gm_idempotency_key is null
     or p_user_idempotency_key = p_gm_idempotency_key then
    raise exception 'distinct USER and GM idempotency keys are required' using errcode = '22023';
  end if;

  v_user := survival_rpg.append_public_transcript_message(
    p_session_id,
    p_worldline_id,
    p_chronicle_id,
    p_season_id,
    p_turn_no,
    p_user_message_order,
    'USER',
    p_user_content,
    p_user_content_sha256,
    p_user_idempotency_key,
    p_user_game_time,
    p_user_scene_id,
    p_user_save_version,
    p_source_type
  );

  v_gm := survival_rpg.append_public_transcript_message(
    p_session_id,
    p_worldline_id,
    p_chronicle_id,
    p_season_id,
    p_turn_no,
    p_user_message_order + 1,
    'GM',
    p_gm_content,
    p_gm_content_sha256,
    p_gm_idempotency_key,
    p_gm_game_time,
    p_gm_scene_id,
    p_gm_save_version,
    p_source_type
  );

  return query
  select v_user.id, v_gm.id, v_user.message_order, v_gm.message_order;
end;
$$;

revoke all on function survival_rpg.append_public_transcript_turn(
  uuid, text, text, text, integer, integer, text, text, uuid,
  text, text, uuid, text, text, integer, text, text, integer, text
) from public;

revoke all on function survival_rpg.append_public_transcript_turn(
  uuid, text, text, text, integer, integer, text, text, uuid,
  text, text, uuid, text, text, integer, text, text, integer, text
) from anon, authenticated;

grant execute on function survival_rpg.append_public_transcript_turn(
  uuid, text, text, text, integer, integer, text, text, uuid,
  text, text, uuid, text, text, integer, text, text, integer, text
) to service_role;
