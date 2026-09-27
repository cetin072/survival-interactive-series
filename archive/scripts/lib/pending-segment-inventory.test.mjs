import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { materializePublicationSegment } from './publication-segment-materialize.mjs'
import { planPendingSegment } from './pending-segment-inventory.mjs'
import { approvedSeasonCatalog } from './approved-reader-sources.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const uuid = (tail) => `00000000-0000-4000-8000-${String(tail).padStart(12, '0')}`
function materialized(start = 0, sessionId = uuid(1), gmText = 'SYNTHETIC_GM') {
  const rows = [
    { message_id: uuid(101 + start), content: 'SYNTHETIC_USER', game_time: '2099-01-01 09:59' },
    { message_id: uuid(102 + start), content: `## 2099년 1월 1일 10:00\n\n${gmText}`,
      game_time: '2099-01-01 10:00' },
  ]
  const messages = rows.map((row, index) => ({
    message_id: row.message_id, idempotency_key: uuid(201 + start + index),
    message_order: start + index, role: index ? 'GM' : 'USER',
    content_sha256: hash(row.content), save_version: 253, public_safe: true, source_type: 'LIVE',
  }))
  const snapshot = { version: 'publication-segment-snapshot-v1', chronicle_id: 'C03-AFTERFALL',
    worldline_id: 'AFTERFALL', season_id: 'S03', session_id: sessionId, session_status: 'OPEN',
    session_observed_last_order: start + 1, snapshot_start_order: start, snapshot_end_order: start + 1,
    messages, turn_outcomes: [{ turn_no: start / 2 + 1, outcome: 'NO_STATE_CHANGE',
      user_save_version: 253, gm_save_version: 253 }], approval_provenance_ref: null }
  return materializePublicationSegment(snapshot, rows)
}
function recorded(result) {
  const s = result.source_manifest_candidate
  return { chronicle_id: s.chronicle_id, worldline_id: s.worldline_id,
    season_id: s.season_id, session_id: s.session_id, source_session_uuid: s.source_session_uuid,
    source_message_order: s.source_message_order, segment_id: s.segment_id,
    candidate_id: s.candidate_id, part_sha256: s.parts_sha256['PART_001.md'] }
}

test('one open-session pair becomes an unapproved, body-free cold-source proposal', () => {
  const { candidate, partBytes } = materialized()
  const plan = planPendingSegment(candidate, partBytes, [])
  assert.equal(plan.status, 'PENDING_PUBLIC_APPROVAL')
  assert.equal(plan.session_id, 'SESSION_001')
  assert.equal(plan.publication_allowed, false)
  assert.equal(plan.files_written, 0)
  assert.equal(plan.source_manifest_candidate.source_session_status, 'OPEN')
  assert.equal(plan.source_manifest_candidate.segment_status, 'SEALED')
  assert.equal(plan.source_manifest_candidate.visibility, 'PENDING_PUBLIC_APPROVAL')
  assert.deepEqual(plan.source_manifest_candidate.message_order, { min: 0, max: 1, contiguous: true })
  assert.equal(plan.source_manifest_candidate.parts_sha256['PART_001.md'], hash(partBytes))
  assert.ok(!JSON.stringify(plan).includes('SYNTHETIC_GM'))
  assert.ok(!('closed_at' in plan.source_manifest_candidate))
})
test('Step 3 Reader refuses a pending source even if the season entry is mislabeled public', async () => {
  const { candidate, partBytes } = materialized()
  const plan = planPendingSegment(candidate, partBytes, [])
  const season = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL',
    season_id: 'S03', archive_class: 'COLD_RAW', visibility: 'PUBLIC_ARCHIVE',
    sessions: [{ session_id: plan.session_id, visibility: 'PUBLIC_ARCHIVE',
      capture_quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic_pairing_complete: true,
      source_manifest: `${plan.session_id}/SOURCE_MANIFEST.json`,
      coverage_basis: 'captured_message_range',
      captured_message_range: { ...candidate.captured_message_range },
      user_messages: 1, gm_public_blocks: 1 }] }
  await assert.rejects(approvedSeasonCatalog(season, 'S03', {
    read: async () => Buffer.from(JSON.stringify(plan.source_manifest_candidate)),
    listParts: async () => ['PART_001.md'],
  }), /INVALID_APPROVED_READER_SOURCE/)
})
test('repeat is a no-op; adjacent turns receive distinct source ids', () => {
  const first = materialized()
  const firstPlan = planPendingSegment(first.candidate, first.partBytes, [])
  const inventory = [recorded(firstPlan)]
  assert.deepEqual(planPendingSegment(first.candidate, first.partBytes, inventory), {
    status: 'NOOP_ALREADY_RECORDED', session_id: 'SESSION_001',
    candidate_id: first.candidate.candidate_id, publication_allowed: false, files_written: 0,
  })
  const next = materialized(2)
  const plan = planPendingSegment(next.candidate, next.partBytes, inventory)
  assert.equal(plan.session_id, 'SESSION_002')
  assert.deepEqual(plan.source_manifest_candidate.source_message_order, { start: 2, end: 3 })
  assert.deepEqual(plan.source_manifest_candidate.message_order, { min: 0, max: 1, contiguous: true })
})
test('changed sealed bytes, overlapping source range and backfill fail closed', () => {
  const first = materialized()
  const inventory = [recorded(planPendingSegment(first.candidate, first.partBytes, []))]
  const changedTime = materialized()
  changedTime.candidate.captured_message_range.end = '2099-01-01 10:01'
  changedTime.candidate.candidate_id = `candidate-${hash(JSON.stringify({
    segment_id: changedTime.candidate.segment_id, part_sha256: changedTime.candidate.part_sha256,
    captured_message_range: changedTime.candidate.captured_message_range,
    source_save_version: changedTime.candidate.source_save_version }))}`
  assert.throws(() => planPendingSegment(changedTime.candidate, changedTime.partBytes, inventory),
    /SEALED_SEGMENT_CHANGED/)
  const conflicting = materialized(0, uuid(1), 'CHANGED_GM')
  assert.throws(() => planPendingSegment(conflicting.candidate, conflicting.partBytes, inventory),
    /SOURCE_RANGE_COLLISION/)
  const later = materialized(2)
  const laterInventory = [recorded(planPendingSegment(later.candidate, later.partBytes, []))]
  assert.throws(() => planPendingSegment(first.candidate, first.partBytes, laterInventory),
    /BACKFILL_REQUIRES_REVIEW/)
})
test('different source sessions are not deduplicated by repeated text', () => {
  const first = materialized()
  const existing = [recorded(planPendingSegment(first.candidate, first.partBytes, []))]
  const second = materialized(0, uuid(2))
  const plan = planPendingSegment(second.candidate, second.partBytes, existing)
  assert.equal(plan.session_id, 'SESSION_002')
  assert.equal(plan.source_manifest_candidate.source_session_uuid, uuid(2))
})
test('reserved season ids are skipped and cross-season inventory is refused', () => {
  const source = materialized()
  const plan = planPendingSegment(source.candidate, source.partBytes, [], ['SESSION_009'])
  assert.equal(plan.session_id, 'SESSION_010')
  const existing = recorded(plan)
  assert.throws(() => planPendingSegment(source.candidate, source.partBytes,
    [{ ...existing, season_id: 'S02' }]), /INVALID_SEGMENT_INVENTORY/)
})
test('tampered bytes, approval flags, hidden fields and duplicate inventory fail closed', () => {
  const original = materialized()
  const existing = recorded(planPendingSegment(original.candidate, original.partBytes, []))
  assert.throws(() => planPendingSegment(original.candidate,
    Buffer.from('## USER 000\n\nMUTATED\n'), []), /SEGMENT_PART_HASH_MISMATCH/)
  for (const patch of [{ visibility: 'PUBLIC_ARCHIVE' }, { publication_allowed: true },
    { private_state: 'SECRET' }]) {
    assert.throws(() => planPendingSegment({ ...original.candidate, ...patch }, original.partBytes, []))
  }
  assert.throws(() => planPendingSegment(original.candidate, original.partBytes,
    [existing, existing]), /DUPLICATE_SEGMENT_INVENTORY/)
  assert.throws(() => planPendingSegment(original.candidate, original.partBytes,
    [{ ...existing, hidden: 'SECRET' }]), /INVALID_SEGMENT_INVENTORY/)
  const next = materialized(2)
  const nextEntry = recorded(planPendingSegment(next.candidate, next.partBytes, [existing]))
  assert.throws(() => planPendingSegment(original.candidate, original.partBytes,
    [existing, { ...nextEntry, candidate_id: existing.candidate_id }]),
  /DUPLICATE_SEGMENT_INVENTORY/)
})
