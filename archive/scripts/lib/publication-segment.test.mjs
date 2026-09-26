import assert from 'node:assert/strict'
import test from 'node:test'
import { sealPublicationSegment } from './publication-segment.mjs'

const uuid = (tail) => `00000000-0000-4000-8000-${String(tail).padStart(12, '0')}`
function message(order, role, turn, saveVersion = 253) {
  return { message_id: uuid(100 + order), idempotency_key: uuid(200 + order), message_order: order,
    role, content_sha256: String.fromCharCode(97 + turn) .repeat(64), save_version: saveVersion,
    public_safe: true, source_type: 'LIVE' }
}
function snapshot() {
  return { version: 'publication-segment-snapshot-v1', chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL',
    season_id: 'S03', session_id: uuid(1), session_status: 'OPEN', session_observed_last_order: 3,
    snapshot_start_order: 0, snapshot_end_order: 1, messages: [message(0, 'USER', 0), message(1, 'GM', 0)],
    turn_outcomes: [{ turn_no: 1, outcome: 'NO_STATE_CHANGE', user_save_version: 253, gm_save_version: 253 }],
    approval_provenance_ref: null }
}

test('seals a completed pair while leaving the original session OPEN', () => {
  const segment = sealPublicationSegment(snapshot())
  assert.equal(segment.segment_status, 'SEALED')
  assert.equal(segment.session_status, 'OPEN')
  assert.equal(segment.publication_status, 'PENDING_TRUSTED_PROVENANCE')
  assert.equal(segment.publication_allowed, false)
  assert.equal(segment.message_count, 2)
})

test('semantic identity ignores a later turn beyond the frozen snapshot fence', () => {
  const first = snapshot()
  const before = sealPublicationSegment(first)
  first.session_observed_last_order = 5
  const after = sealPublicationSegment(first)
  assert.equal(after.segment_id, before.segment_id)
  assert.equal(after.semantic_batch_id, before.semantic_batch_id)
  assert.equal(after.snapshot_end_order, 1)
})

test('a following segment uses the next complete pair and gets a stable separate identity', () => {
  const second = snapshot()
  second.snapshot_start_order = 2
  second.snapshot_end_order = 3
  second.messages = [message(2, 'USER', 1, 253), message(3, 'GM', 1, 254)]
  second.turn_outcomes = [{ turn_no: 2, outcome: 'APPLIED', user_save_version: 253, gm_save_version: 254 }]
  second.session_observed_last_order = 5
  const result = sealPublicationSegment(second)
  assert.equal(result.session_status, 'OPEN')
  assert.notEqual(result.segment_id, sealPublicationSegment(snapshot()).segment_id)
})

test('same metadata has the same semantic identity and no run-time timestamp', () => {
  assert.equal(sealPublicationSegment(snapshot()).segment_id, sealPublicationSegment(snapshot()).segment_id)
  assert.equal('created_at' in sealPublicationSegment(snapshot()), false)
})

test('gaps, unpaired boundaries and invalid hashes fail closed', () => {
  const gap = snapshot()
  gap.messages[1].message_order = 2
  assert.throws(() => sealPublicationSegment(gap), /SEGMENT_ORDER_GAP/)
  const boundary = snapshot()
  boundary.snapshot_end_order = 2
  assert.throws(() => sealPublicationSegment(boundary), /INVALID_SEGMENT_END/)
  const corrupt = snapshot()
  corrupt.messages[0].content_sha256 = 'not-a-hash'
  assert.throws(() => sealPublicationSegment(corrupt), /INVALID_CONTENT_HASH/)
})

test('incomplete state linkage, private rows and raw content are rejected', () => {
  const unlinked = snapshot()
  unlinked.messages[0].save_version = null
  assert.throws(() => sealPublicationSegment(unlinked), /MISSING_TURN_STATE_LINK/)
  const privateRow = snapshot()
  privateRow.messages[0].public_safe = false
  assert.throws(() => sealPublicationSegment(privateRow), /NON_PUBLIC_SAFE_SOURCE/)
  const raw = snapshot()
  raw.messages[0].content = 'must not enter the metadata contract'
  assert.throws(() => sealPublicationSegment(raw), /INVALID_SEGMENT_MESSAGE/)
})

test('public provenance references do not grant public publication', () => {
  const input = snapshot()
  input.approval_provenance_ref = 'SUPABASE:approved-release:token-redacted'
  const result = sealPublicationSegment(input)
  assert.equal(result.publication_status, 'REQUIRES_TRUSTED_PROVENANCE_RECHECK')
  assert.equal(result.publication_allowed, false)
})
