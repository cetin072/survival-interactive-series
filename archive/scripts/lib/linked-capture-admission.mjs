/** Admit one linked capture export into the sealed RAW candidate compiler.
 * The payload must come from a future restricted, single-snapshot exporter.
 * This pure validator cannot authenticate the caller or grant publication.
 */
import { materializePublicationSegment } from './publication-segment-materialize.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
function exact(value, names, code) {
  demand(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === names.length
    && Object.keys(value).every((key) => names.includes(key)), code)
}

export function admitLinkedCaptureExport(input) {
  exact(input, ['version', 'session', 'range', 'messages', 'links'], 'INVALID_CAPTURE_EXPORT')
  demand(input.version === 'afterfall-linked-export-v1', 'UNSUPPORTED_CAPTURE_EXPORT')
  exact(input.session, ['id', 'worldline_id', 'chronicle_id', 'season_id', 'status', 'last_message_order'],
    'INVALID_EXPORT_SESSION')
  exact(input.range, ['start_order', 'end_order'], 'INVALID_EXPORT_RANGE')
  demand(input.session.worldline_id === 'AFTERFALL' && input.session.chronicle_id === 'C03'
    && /^S\d{2,3}$/.test(input.session.season_id), 'EXPORT_NAMESPACE_MISMATCH')
  demand(Number.isSafeInteger(input.range.start_order) && input.range.start_order >= 0
    && Number.isSafeInteger(input.range.end_order) && input.range.end_order >= input.range.start_order
    && input.range.start_order % 2 === 0 && input.range.end_order % 2 === 1,
  'INVALID_EXPORT_PAIR_RANGE')
  demand(Array.isArray(input.messages) && Array.isArray(input.links)
    && input.messages.length === input.range.end_order - input.range.start_order + 1
    && input.links.length * 2 === input.messages.length, 'EXPORT_INVENTORY_MISMATCH')
  const messages = []
  const rows = []
  for (const [index, row] of input.messages.entries()) {
    exact(row, ['id', 'idempotency_key', 'turn_no', 'message_order', 'role', 'content',
      'content_sha256', 'save_version', 'public_safe', 'source_type', 'game_time'],
    'INVALID_EXPORT_MESSAGE')
    demand(row.message_order === input.range.start_order + index
      && row.role === (index % 2 ? 'GM' : 'USER'), 'EXPORT_PAIR_ORDER_MISMATCH')
    messages.push({ message_id: row.id, idempotency_key: row.idempotency_key,
      message_order: row.message_order, role: row.role, content_sha256: row.content_sha256,
      save_version: row.save_version, public_safe: row.public_safe, source_type: row.source_type })
    rows.push({ message_id: row.id, content: row.content, game_time: row.game_time })
  }
  const outcomes = []
  for (const [index, link] of input.links.entries()) {
    exact(link, ['turn_no', 'user_message_id', 'gm_message_id', 'outcome',
      'user_save_version', 'gm_save_version', 'linked_save_version'], 'INVALID_EXPORT_LINK')
    const user = input.messages[2 * index], gm = input.messages[2 * index + 1]
    demand(link.turn_no === user.turn_no && link.turn_no === gm.turn_no
      && (index === 0 || link.turn_no === input.links[index - 1].turn_no + 1)
      && link.user_message_id === user.id && link.gm_message_id === gm.id
      && link.linked_save_version === link.gm_save_version,
    'EXPORT_STATE_LINK_MISMATCH')
    outcomes.push({ turn_no: link.turn_no, outcome: link.outcome,
      user_save_version: link.user_save_version, gm_save_version: link.gm_save_version })
  }
  const snapshot = { version: 'publication-segment-snapshot-v1', chronicle_id: 'C03-AFTERFALL',
    worldline_id: 'AFTERFALL', season_id: input.session.season_id, session_id: input.session.id,
    session_status: input.session.status,
    session_observed_last_order: input.session.last_message_order,
    snapshot_start_order: input.range.start_order, snapshot_end_order: input.range.end_order,
    messages, turn_outcomes: outcomes, approval_provenance_ref: null }
  const result = materializePublicationSegment(snapshot, rows)
  return { ...result, report: { ...result.report, exporter_authenticated: false,
    transaction_snapshot_verified: false, publication_allowed: false } }
}
