import assert from 'node:assert/strict'
import test from 'node:test'
import { inventoryFromPublishedSeason } from './published-season-inventory.mjs'

const id = '0'.repeat(63) + '1'
const uuid = '00000000-0000-4000-8000-000000000001'
function fixture() {
  const entry = { session_id: 'SESSION_010', visibility: 'PUBLIC_ARCHIVE',
    source_manifest: 'SESSION_010/SOURCE_MANIFEST.json',
    source_session_uuid: uuid, source_message_order: { start: 0, end: 1 },
    segment_id: `segment-${id}`, candidate_id: `candidate-${id}` }
  const manifest = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL',
    season_id: 'S03', archive_class: 'COLD_RAW', visibility: 'PUBLIC_ARCHIVE',
    sessions: [{ session_id: 'SESSION_009', visibility: 'PUBLIC_ARCHIVE' }, entry] }
  const source = { chronicle_id: manifest.chronicle_id, worldline_id: manifest.worldline_id,
    season_id: manifest.season_id, session_id: entry.session_id,
    source_session_uuid: entry.source_session_uuid,
    source_message_order: { ...entry.source_message_order },
    segment_id: entry.segment_id, candidate_id: entry.candidate_id,
    segment_status: 'SEALED', visibility: 'PUBLIC_ARCHIVE', publication_allowed: true,
    approval_provenance_ref: 'OWNER_APPROVAL:synthetic-test-only',
    parts: ['PART_001.md'], parts_sha256: { 'PART_001.md': id } }
  return { manifest, source }
}

test('derives exact published identities and reserves legacy session IDs', async () => {
  const { manifest, source } = fixture()
  const reads = []
  const inventory = await inventoryFromPublishedSeason(manifest, async (ref) => {
    reads.push(ref); return source
  })
  assert.deepEqual(reads, ['SESSION_010/SOURCE_MANIFEST.json'])
  assert.deepEqual(inventory.reserved_session_ids, ['SESSION_009', 'SESSION_010'])
  assert.equal(inventory.segments.length, 1)
  assert.equal(inventory.segments[0].part_sha256, id)
  assert.equal(inventory.segments[0].source_session_uuid, uuid)
  assert.ok(!JSON.stringify(inventory).includes('OWNER_APPROVAL'))
})
test('pending or inconsistent sources cannot masquerade as published inventory', async () => {
  for (const change of [
    (m, s) => { s.visibility = 'PENDING_PUBLIC_APPROVAL' },
    (m, s) => { s.publication_allowed = false },
    (m, s) => { s.approval_provenance_ref = null },
    (m, s) => { s.source_message_order.end = 3 },
    (m, s) => { s.source_session_uuid = '00000000-0000-4000-8000-000000000002' },
    (m) => { m.sessions[1].source_manifest = '../SECRET.json' },
    (m) => { m.sessions.push({ ...m.sessions[1] }) },
  ]) {
    const { manifest, source } = fixture(); change(manifest, source)
    await assert.rejects(inventoryFromPublishedSeason(manifest, async () => source))
  }
})
test('unapproved season is refused before reading any source', async () => {
  const { manifest } = fixture(); manifest.visibility = 'PENDING_PUBLIC_APPROVAL'
  let called = false
  await assert.rejects(inventoryFromPublishedSeason(manifest, async () => { called = true }))
  assert.equal(called, false)
})
