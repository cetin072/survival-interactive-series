import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { fingerprint } from './publication-plan.mjs'
import { snapshotFromPublicSeason } from './public-season-snapshot.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const revision = 'a'.repeat(40)
const checkpoint = 'worldlines/AFTERFALL/seasons/S99/END_CHECKPOINT_2099-01-01.md'
function fixture() {
  const raw = Buffer.from('## USER 000\n\nSYNTHETIC_USER\n\n## GM 001\n\n## 2099년 1월 1일 10:00\n\nSYNTHETIC_GM\n')
  const id = '0'.repeat(63) + '1'
  const sourceSessionUuid = '00000000-0000-4000-8000-000000000001'
  const range = { start: '2099-01-01 09:59', end: '2099-01-01 10:00' }
  const entry = { session_id: 'SESSION_001', source_type: 'SUPABASE_ROLLING_RAW',
    visibility: 'PUBLIC_ARCHIVE', capture_quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS',
    atomic_pairing_complete: true, source_manifest: 'SESSION_001/SOURCE_MANIFEST.json',
    coverage_basis: 'captured_message_range', captured_message_range: range,
    user_messages: 1, gm_public_blocks: 1, source_session_uuid: sourceSessionUuid,
    source_session_status: 'OPEN', source_message_order: { start: 0, end: 1 },
    segment_id: `segment-${id}`, candidate_id: `candidate-${id}`,
    segment_status: 'SEALED', publication_allowed: true,
    approval_provenance_ref: 'OWNER_APPROVAL:synthetic-test-only' }
  const manifest = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL',
    season_id: 'S99', archive_class: 'COLD_RAW', visibility: 'PUBLIC_ARCHIVE',
    sessions: [entry] }
  const source = { ...entry, chronicle_id: manifest.chronicle_id,
    worldline_id: manifest.worldline_id, season_id: manifest.season_id,
    source_save_version: 999, source_digest: id, public_safe_only: true,
    counts: { user: 1, gm: 1, total: 2 },
    message_order: { min: 0, max: 1, contiguous: true },
    content_sha256: [
      { message_order: 0, role: 'USER', sha256: hash('SYNTHETIC_USER') },
      { message_order: 1, role: 'GM', sha256: hash('## 2099년 1월 1일 10:00\n\nSYNTHETIC_GM') },
    ], parts: ['PART_001.md'], parts_sha256: { 'PART_001.md': hash(raw) } }
  const prefix = 'archive/content/transcripts/C03-AFTERFALL/S99/SESSION_001'
  const read = async (path) => path === checkpoint ? Buffer.from('SYNTHETIC_CHECKPOINT')
    : path === `${prefix}/SOURCE_MANIFEST.json` ? Buffer.from(JSON.stringify(source))
      : path === `${prefix}/PART_001.md` ? raw : (() => { throw new Error('UNEXPECTED_READ') })()
  return { manifest, source, raw, read, listParts: async () => ['PART_001.md'] }
}

test('committed public sealed segment derives a metadata-only frozen batch', async () => {
  const f = fixture()
  const snapshot = await snapshotFromPublicSeason(f.manifest, revision, checkpoint, f)
  assert.equal(snapshot.source_revision, revision)
  assert.equal(snapshot.source_save_version, 999)
  assert.equal(snapshot.source_game_time, '2099-01-01 10:00')
  assert.equal(snapshot.source_checkpoint, checkpoint)
  assert.equal(snapshot.sources.length, 1)
  assert.equal(snapshot.sources[0].source_digest, fingerprint(f.manifest.sessions[0]))
  assert.ok(!JSON.stringify(snapshot).includes('SYNTHETIC_GM'))
  assert.ok(Object.isFrozen(snapshot))
})
test('missing checkpoint or source anchor cannot be inferred', async () => {
  const f = fixture()
  await assert.rejects(snapshotFromPublicSeason(f.manifest, revision,
    'worldlines/AFTERFALL/seasons/S99/../SECRET.md', f), /INVALID_PUBLIC_CHECKPOINT_REF/)
  await assert.rejects(snapshotFromPublicSeason(f.manifest, revision, checkpoint,
    { ...f, read: async (path) => path === checkpoint ? Buffer.alloc(0) : f.read(path) }),
  /MISSING_PUBLIC_CHECKPOINT/)
  delete f.source.source_save_version
  await assert.rejects(snapshotFromPublicSeason(f.manifest, revision, checkpoint, f),
    /INVALID_APPROVED_READER_SOURCE/)
})
test('private season is rejected before reading checkpoint or PART', async () => {
  const f = fixture(); f.manifest.visibility = 'PENDING_PUBLIC_APPROVAL'
  let read = false
  await assert.rejects(snapshotFromPublicSeason(f.manifest, revision, checkpoint,
    { read: async () => { read = true }, listParts: f.listParts }),
  /INVALID_PUBLIC_SEASON_BATCH/)
  assert.equal(read, false)
})
