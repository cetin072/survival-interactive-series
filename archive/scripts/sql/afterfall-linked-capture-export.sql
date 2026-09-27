-- One read-only PostgreSQL statement for a future restricted archive exporter.
-- Parameters: $1 session UUID, $2 inclusive even start order, $3 inclusive odd end order.
-- The caller must use a least-privilege database identity and must not log the
-- returned JSON: it contains private, unapproved USER/GM message bodies.
-- A successful query is neither a public approval nor evidence of caller identity.
with scope as materialized (
  select s.id, s.worldline_id, s.chronicle_id, s.season_id,
    s.status, s.last_message_order
  from survival_rpg.transcript_sessions as s
  where s.id = $1::uuid
    and s.worldline_id = 'AFTERFALL'
    and s.chronicle_id = 'C03'
), selected_messages as materialized (
  select m.id, m.idempotency_key, m.turn_no, m.message_order, m.role,
    m.content, m.content_sha256, m.save_version, m.public_safe,
    m.source_type, m.game_time
  from survival_rpg.transcript_messages as m
  join scope as s on s.id = m.session_id
    and s.worldline_id = m.worldline_id
    and s.chronicle_id = m.chronicle_id
    and s.season_id = m.season_id
  where m.message_order between $2::integer and $3::integer
    and m.public_safe is true
), selected_links as materialized (
  select l.turn_no, l.user_message_id, l.gm_message_id, l.outcome,
    l.user_save_version, l.gm_save_version, l.linked_save_version
  from survival_rpg.transcript_turn_state_links as l
  join scope as s on s.id = l.session_id
    and s.worldline_id = l.worldline_id
    and s.chronicle_id = l.chronicle_id
    and s.season_id = l.season_id
  where exists (
    select 1 from selected_messages as m
    where m.id = l.user_message_id or m.id = l.gm_message_id
  )
)
select jsonb_build_object(
  'version', 'afterfall-linked-export-v1',
  'session', (select jsonb_build_object(
    'id', s.id, 'worldline_id', s.worldline_id,
    'chronicle_id', s.chronicle_id, 'season_id', s.season_id,
    'status', s.status, 'last_message_order', s.last_message_order
  ) from scope as s),
  'range', jsonb_build_object('start_order', $2::integer, 'end_order', $3::integer),
  'messages', (select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'idempotency_key', m.idempotency_key,
    'turn_no', m.turn_no, 'message_order', m.message_order,
    'role', m.role, 'content', m.content,
    'content_sha256', m.content_sha256, 'save_version', m.save_version,
    'public_safe', m.public_safe, 'source_type', m.source_type,
    'game_time', m.game_time
  ) order by m.message_order), '[]'::jsonb) from selected_messages as m),
  'links', (select coalesce(jsonb_agg(jsonb_build_object(
    'turn_no', l.turn_no, 'user_message_id', l.user_message_id,
    'gm_message_id', l.gm_message_id, 'outcome', l.outcome,
    'user_save_version', l.user_save_version,
    'gm_save_version', l.gm_save_version,
    'linked_save_version', l.linked_save_version
  ) order by l.turn_no), '[]'::jsonb) from selected_links as l)
) as linked_capture_export;
