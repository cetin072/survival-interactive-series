import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { admitLinkedCaptureExport } from './linked-capture-admission.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const uuid = (tail) => `00000000-0000-4000-8000-${String(tail).padStart(12, '0')}`
function fixture() {
  const contents = ['SYNTHETIC_USER', '## 2099년 1월 1일 10:00\n\nSYNTHETIC_GM']
  const messages = contents.map((content, index) => ({
    id: uuid(101 + index), idempotency_key: uuid(201 + index), turn_no: 1,
    message_order: index, role: index ? 'GM' : 'USER', content,
    content_sha256: hash(content), save_version: 253, public_safe: true,
    source_type: 'LIVE', game_time: index ? '2099-01-01 10:00' : '2099-01-01 09:59',
  }))
  return { version: 'afterfall-linked-export-v1',
    session: { id: uuid(1), worldline_id: 'AFTERFALL', chronicle_id: 'C03', season_id: 'S03',
      status: 'OPEN', last_message_order: 3 },
    range: { start_order: 0, end_order: 1 }, messages,
    links: [{ turn_no: 1, user_message_id: messages[0].id, gm_message_id: messages[1].id,
      outcome: 'NO_STATE_CHANGE', user_save_version: 253, gm_save_version: 253,
      linked_save_version: 253 }] }
}

test('exact linked export becomes an unapproved RAW candidate, not a publication', () => {
  const result = admitLinkedCaptureExport(fixture())
  assert.equal(result.candidate.source_session_status, 'OPEN')
  assert.equal(result.candidate.source_save_version, 253)
  assert.equal(result.candidate.publication_allowed, false)
  assert.equal(result.report.exporter_authenticated, false)
  assert.equal(result.report.transaction_snapshot_verified, false)
  assert.equal(result.report.files_written, 0)
  assert.equal(result.report.site_publications, 0)
})

test('missing links, wrong linked identities and false save heads are rejected', () => {
  const changes = [
    (v) => { v.links = [] },
    (v) => { v.links[0].user_message_id = uuid(900) },
    (v) => { v.links[0].gm_message_id = uuid(900) },
    (v) => { v.links[0].linked_save_version = 254 },
    (v) => { v.messages[1].turn_no = 2 },
    (v) => { v.messages[1].save_version = null },
  ]
  for (const change of changes) { const value = fixture(); change(value); assert.throws(() => admitLinkedCaptureExport(value)) }
})

test('wrong namespace, range, body or unexpected DB columns are rejected', () => {
  const changes = [
    (v) => { v.session.worldline_id = 'STRONGHOLD' },
    (v) => { v.range.end_order = 3 },
    (v) => { v.messages[0].message_order = 2 },
    (v) => { v.messages[0].content += ' CHANGED' },
    (v) => { v.messages[0].hidden_state = 'SECRET' },
    (v) => { v.messages[0].public_safe = false },
    (v) => { v.session.last_message_order = 0 },
  ]
  for (const change of changes) { const value = fixture(); change(value); assert.throws(() => admitLinkedCaptureExport(value)) }
})

test('same frozen result is deterministic and carries no DB credentials', () => {
  const a = admitLinkedCaptureExport(fixture()), b = admitLinkedCaptureExport(fixture())
  assert.deepEqual(a, b)
  assert.equal(JSON.stringify(a.candidate).includes('SYNTHETIC_GM'), false)
})
