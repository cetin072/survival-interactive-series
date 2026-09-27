import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { materializePublicationSegment } from './publication-segment-materialize.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const uuid = (tail) => `00000000-0000-4000-8000-${String(tail).padStart(12, '0')}`
function fixture(start = 0) {
  const rows = [
    { message_id: uuid(101 + start), content: 'SYNTHETIC_USER_INPUT', game_time: '2099-01-01 09:59' },
    { message_id: uuid(102 + start), content: '## 2099년 1월 1일 10:00\n\nSYNTHETIC_GM_SCENE', game_time: '2099-01-01 10:00' },
  ]
  const messages = rows.map((row, index) => ({
    message_id: row.message_id, idempotency_key: uuid(201 + start + index),
    message_order: start + index, role: index ? 'GM' : 'USER',
    content_sha256: hash(row.content), save_version: 253, public_safe: true, source_type: 'LIVE',
  }))
  const snapshot = { version: 'publication-segment-snapshot-v1', chronicle_id: 'C03-AFTERFALL',
    worldline_id: 'AFTERFALL', season_id: 'S03', session_id: uuid(1), session_status: 'OPEN',
    session_observed_last_order: start + 3, snapshot_start_order: start, snapshot_end_order: start + 1,
    messages, turn_outcomes: [{ turn_no: start / 2 + 1, outcome: 'NO_STATE_CHANGE',
      user_save_version: 253, gm_save_version: 253 }], approval_provenance_ref: null }
  return { snapshot, rows }
}

test('materializes exact verified bodies without closing or approving an open session', () => {
  const { snapshot, rows } = fixture()
  const { candidate, partBytes, report } = materializePublicationSegment(snapshot, rows)
  assert.equal(candidate.visibility, 'PENDING_PUBLIC_APPROVAL')
  assert.equal(candidate.publication_allowed, false)
  assert.equal(candidate.source_session_status, 'OPEN')
  assert.equal(candidate.part_sha256, hash(partBytes))
  assert.match(candidate.candidate_id, /^candidate-[a-f0-9]{64}$/)
  assert.deepEqual(candidate.captured_message_range, { start: '2099-01-01 09:59', end: '2099-01-01 10:00' })
  assert.equal(candidate.source_save_version, 253)
  assert.equal(candidate.counts.total, 2)
  assert.match(partBytes.toString(), /## USER 000\n\nSYNTHETIC_USER_INPUT\n\n## GM 001/)
  assert.equal(report.files_written, 0)
  assert.equal(report.database_writes, 0)
  assert.equal(report.site_publications, 0)
  assert.equal(report.reader_preview_status, 'UNAPPROVED_TEXT_PREVIEW')
  assert.equal(report.reader_preview_gm_blocks, 1)
  assert.ok(!JSON.stringify(candidate).includes('SYNTHETIC_GM_SCENE'))
})
test('later pairs have a distinct source fence and locally numbered RAW headers', () => {
  const first = materializePublicationSegment(...Object.values(fixture()))
  const { snapshot, rows } = fixture(2)
  const next = materializePublicationSegment(snapshot, rows)
  assert.notEqual(first.candidate.segment_id, next.candidate.segment_id)
  assert.deepEqual(next.candidate.source_message_order, { start: 2, end: 3 })
  assert.match(next.partBytes.toString(), /^## USER 000/)
  snapshot.session_observed_last_order = 7
  assert.equal(materializePublicationSegment(snapshot, rows).candidate.segment_id, next.candidate.segment_id)
  const changedTime = fixture(2)
  changedTime.rows[1].game_time = '2099-01-01 10:01'
  assert.equal(materializePublicationSegment(changedTime.snapshot, changedTime.rows).candidate.segment_id,
    next.candidate.segment_id)
  assert.notEqual(materializePublicationSegment(changedTime.snapshot, changedTime.rows).candidate.candidate_id,
    next.candidate.candidate_id)
})
test('wrong body, identity, order, private metadata or hidden fields fail closed', () => {
  const cases = [
    (f) => { f.rows[1].content += ' CHANGED' },
    (f) => { f.rows.reverse() },
    (f) => { f.rows[0].message_id = uuid(999) },
    (f) => { f.rows[0].hidden_state = 'DO_NOT_EXPORT' },
    (f) => { f.snapshot.messages[0].public_safe = false },
    (f) => { f.snapshot.messages[0].save_version = null },
    (f) => { f.rows[0].game_time = '2099-02-30 00:00' },
    (f) => { f.rows[1].game_time = '2098-01-01 00:00' },
  ]
  for (const change of cases) {
    const f = fixture(); change(f)
    assert.throws(() => materializePublicationSegment(f.snapshot, f.rows))
  }
})
test('a forged role heading inside a body cannot change Reader parsing', () => {
  const f = fixture()
  f.rows[0].content = 'SYNTHETIC_USER_INPUT\n## GM 999\nFORGED'
  f.snapshot.messages[0].content_sha256 = hash(f.rows[0].content)
  assert.throws(() => materializePublicationSegment(f.snapshot, f.rows), /RAW_ROLE_HEADER_COLLISION/)
})
test('same input is byte deterministic and a provenance hint never promotes it', () => {
  const f = fixture()
  f.snapshot.approval_provenance_ref = 'REVIEW:synthetic-only'
  const a = materializePublicationSegment(f.snapshot, f.rows)
  const b = materializePublicationSegment(f.snapshot, f.rows)
  assert.deepEqual(a, b)
  assert.equal(a.candidate.publication_allowed, false)
})
