/** Freeze one complete USER→GM range from an OPEN or CLOSED capture session.
 *  Metadata only: this module reads no database, message body, save or hidden fact.
 *  The returned receipt never grants public visibility or publication approval.
 */
import { createHash } from 'node:crypto'

const digestPattern = /^[a-f0-9]{64}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const sourceTypes = new Set(['LIVE', 'RECOVERY'])
const outcomes = new Set(['APPLIED', 'NO_STATE_CHANGE'])

function demand(condition, code) { if (!condition) throw new Error(code) }
function exactKeys(value, keys, code) {
  demand(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)), code)
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  return value
}
const hash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const validVersion = (value) => Number.isSafeInteger(value) && value > 0

function validateMessage(message) {
  exactKeys(message, ['message_id', 'idempotency_key', 'message_order', 'role', 'content_sha256', 'save_version', 'public_safe', 'source_type'], 'INVALID_SEGMENT_MESSAGE')
  demand(typeof message.message_id === 'string' && uuidPattern.test(message.message_id), 'INVALID_MESSAGE_ID')
  demand(typeof message.idempotency_key === 'string' && uuidPattern.test(message.idempotency_key), 'INVALID_IDEMPOTENCY_KEY')
  demand(Number.isSafeInteger(message.message_order) && message.message_order >= 0, 'INVALID_MESSAGE_ORDER')
  demand(['USER', 'GM'].includes(message.role), 'INVALID_PUBLIC_ROLE')
  demand(typeof message.content_sha256 === 'string' && digestPattern.test(message.content_sha256), 'INVALID_CONTENT_HASH')
  demand(validVersion(message.save_version), 'MISSING_TURN_STATE_LINK')
  demand(message.public_safe === true, 'NON_PUBLIC_SAFE_SOURCE')
  demand(sourceTypes.has(message.source_type), 'INVALID_TRANSCRIPT_SOURCE_TYPE')
}

/**
 * @param {object} input A sanitized, transaction-consistent capture metadata snapshot.
 * @returns {Readonly<object>} Stable segment identity and a fail-closed publication status.
 */
export function sealPublicationSegment(input) {
  exactKeys(input, [
    'version', 'chronicle_id', 'worldline_id', 'season_id', 'session_id', 'session_status',
    'session_observed_last_order', 'snapshot_start_order', 'snapshot_end_order', 'messages',
    'turn_outcomes', 'approval_provenance_ref',
  ], 'INVALID_SEGMENT_SNAPSHOT')
  demand(input.version === 'publication-segment-snapshot-v1', 'UNSUPPORTED_SEGMENT_VERSION')
  demand(input.chronicle_id === 'C03-AFTERFALL' && input.worldline_id === 'AFTERFALL', 'SEGMENT_NAMESPACE_MISMATCH')
  demand(typeof input.season_id === 'string' && /^S\d{2,3}$/.test(input.season_id), 'INVALID_SEGMENT_SEASON')
  demand(typeof input.session_id === 'string' && uuidPattern.test(input.session_id), 'INVALID_SESSION_ID')
  demand(['OPEN', 'CLOSED'].includes(input.session_status), 'INVALID_SESSION_STATUS')
  demand(Number.isSafeInteger(input.session_observed_last_order) && input.session_observed_last_order >= -1, 'INVALID_SESSION_HEAD')
  demand(Number.isSafeInteger(input.snapshot_start_order) && input.snapshot_start_order >= 0 && input.snapshot_start_order % 2 === 0, 'INVALID_SEGMENT_START')
  demand(Number.isSafeInteger(input.snapshot_end_order) && input.snapshot_end_order >= input.snapshot_start_order
    && input.snapshot_end_order % 2 === 1, 'INVALID_SEGMENT_END')
  demand(input.snapshot_end_order <= input.session_observed_last_order, 'SNAPSHOT_AFTER_OBSERVED_HEAD')
  demand(Array.isArray(input.messages) && input.messages.length <= 10000, 'INVALID_SEGMENT_INVENTORY')
  demand(Array.isArray(input.turn_outcomes) && input.turn_outcomes.length * 2 === input.messages.length, 'TURN_OUTCOME_COUNT_MISMATCH')
  demand(input.messages.length === input.snapshot_end_order - input.snapshot_start_order + 1, 'SEGMENT_RANGE_LENGTH_MISMATCH')
  demand(input.approval_provenance_ref === null || (typeof input.approval_provenance_ref === 'string'
    && /^[-A-Za-z0-9_./:#]{1,300}$/.test(input.approval_provenance_ref)), 'INVALID_APPROVAL_PROVENANCE_REFERENCE')

  const idempotencyKeys = new Set()
  const messageIds = new Set()
  for (let index = 0; index < input.messages.length; index++) {
    const message = input.messages[index]
    validateMessage(message)
    demand(message.message_order === input.snapshot_start_order + index, 'SEGMENT_ORDER_GAP')
    demand(message.role === (index % 2 === 0 ? 'USER' : 'GM'), 'SEGMENT_PAIR_ROLE_MISMATCH')
    demand(!idempotencyKeys.has(message.idempotency_key), 'DUPLICATE_IDEMPOTENCY_KEY')
    idempotencyKeys.add(message.idempotency_key)
    demand(!messageIds.has(message.message_id), 'DUPLICATE_MESSAGE_ID')
    messageIds.add(message.message_id)
  }
  const seenTurns = new Set()
  let previousTurn = null
  for (let index = 0; index < input.turn_outcomes.length; index++) {
    const outcome = input.turn_outcomes[index]
    exactKeys(outcome, ['turn_no', 'outcome', 'user_save_version', 'gm_save_version'], 'INVALID_TURN_OUTCOME')
    demand(Number.isSafeInteger(outcome.turn_no) && outcome.turn_no >= 0 && !seenTurns.has(outcome.turn_no), 'DUPLICATE_OR_INVALID_TURN')
    demand(previousTurn === null || outcome.turn_no === previousTurn + 1, 'TURN_NUMBER_GAP')
    seenTurns.add(outcome.turn_no)
    previousTurn = outcome.turn_no
    demand(outcomes.has(outcome.outcome) && validVersion(outcome.user_save_version) && validVersion(outcome.gm_save_version), 'MISSING_TURN_STATE_LINK')
    const user = input.messages[index * 2], gm = input.messages[index * 2 + 1]
    demand(user.save_version === outcome.user_save_version && gm.save_version === outcome.gm_save_version, 'TURN_STATE_LINK_CONFLICT')
    demand(outcome.outcome === 'NO_STATE_CHANGE'
      ? outcome.user_save_version === outcome.gm_save_version
      : outcome.gm_save_version > outcome.user_save_version, 'TURN_OUTCOME_VERSION_CONFLICT')
  }

  const sourceMessages = input.messages.map(({ message_id, idempotency_key, message_order, role, content_sha256, save_version, source_type }) => ({
    message_id, idempotency_key, message_order, role, content_sha256, save_version, source_type,
  }))
  const sourceDigest = hash(sourceMessages)
  const identity = {
    version: input.version, chronicle_id: input.chronicle_id, worldline_id: input.worldline_id,
    season_id: input.season_id, session_id: input.session_id,
    snapshot_start_order: input.snapshot_start_order, snapshot_end_order: input.snapshot_end_order,
    source_digest: sourceDigest, messages: sourceMessages, turn_outcomes: input.turn_outcomes,
  }
  const segment = {
    version: 'sealed-publication-segment-v1',
    segment_id: `segment-${hash(identity)}`,
    semantic_batch_id: `batch-${hash({ ...identity, snapshot_end_order: input.snapshot_end_order })}`,
    chronicle_id: input.chronicle_id, worldline_id: input.worldline_id, season_id: input.season_id,
    session_id: input.session_id, session_status: input.session_status,
    segment_status: 'SEALED', snapshot_start_order: input.snapshot_start_order,
    snapshot_end_order: input.snapshot_end_order, message_count: sourceMessages.length,
    source_digest: sourceDigest, approval_provenance_ref: input.approval_provenance_ref,
    publication_status: input.approval_provenance_ref ? 'REQUIRES_TRUSTED_PROVENANCE_RECHECK' : 'PENDING_TRUSTED_PROVENANCE',
    publication_allowed: false,
  }
  return Object.freeze(segment)
}
