import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { observeForegroundImage, acceptForegroundLocalCandidate, planForegroundLocalIngest } from './foreground-image-handoff.mjs'
import { compileVisualCatalog, visualDigest } from './visual-compiler.mjs'

const root = resolve(import.meta.dirname, '..', '..', '..')
const record = JSON.parse(await readFile(resolve(root, 'docs/AUTOMATIC_ARCHIVE_STEP6_FOREGROUND_20260927.json'), 'utf8'))
const bytes = await readFile(resolve(root, record.workspace_file))
const point = { status: 'READY', visibility: 'PUBLIC_ARCHIVE', point_type: 'CHARACTER',
  subject_id: record.subject_id, point_id: record.point_id, generation_key: record.generation_key }

test('actual foreground PNG enters a disabled, non-accepted local inbox', () => {
  const observation = observeForegroundImage(point, record, bytes)
  assert.equal(observation.file_sha256, record.file.sha256)
  assert.equal(observation.status, 'AWAITING_RESULT_ATTESTATION_AND_FINAL_ACCEPTANCE')
  assert.equal(observation.provider_result_id, null)
  assert.equal(observation.accepted_candidate_id, null)
  assert.equal(observation.storage_status, 'NOT_STORED')
  assert.equal(observation.publication_status, 'NOT_PUBLISHED')
  assert.equal(observation.execution_enabled, false)
  assert.deepEqual(observation, observeForegroundImage(point, record, bytes))
})

test('changed brief, bytes or acceptance claims cannot enter the inbox', () => {
  assert.throws(() => observeForegroundImage({ ...point, generation_key: 'generation-' + '0'.repeat(64) }, record, bytes))
  assert.throws(() => observeForegroundImage(point, record, Buffer.from(bytes.subarray(0, -1))))
  assert.throws(() => observeForegroundImage(point, { ...record, review: { ...record.review, final_canon_approval: true } }, bytes))
  assert.throws(() => observeForegroundImage(point, { ...record, site_publications: 1 }, bytes))
})

function syntheticCatalog() {
  const ns = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
  const anchor = { save_version: 253, game_time: '2027-03-23 17:50' }
  const evidence = (ref, pointer) => ({ source_ref: ref, source_sha256: 'a'.repeat(64), pointer })
  const graphBody = { version: 'archive-graph-v1', ...ns, anchor,
    nodes: [{ id: 'char-test', data: { id: 'char-test', label: 'TEST', type: 'character',
      tags: ['PLAYER'], subtitle: '공개 역할', summary: '공개 설명', source: 'SYNTHETIC TEST' },
      anchor, evidence: evidence('archive/web/src/archive/archiveData.ts', '/nodes/0'), history: [] }],
    relations: [], articles: [], story_links: [] }
  return compileVisualCatalog({ batch: { batch_id: `batch-${'b'.repeat(64)}`,
    snapshot: { ...ns, source_save_version: 253, source_game_time: anchor.game_time } },
  graph: { ...graphBody, content_sha256: visualDigest(graphBody) },
  appearances: { version: 'public-appearance-v1', ...ns, anchor, records: [{ node_id: 'char-test',
    status: 'confirmed', visual: { apparentAge: '30대', build: '보통', face: '얼굴', hair: '검은 머리' },
    evidence: evidence('archive/web/src/archive/characterAppearance.ts', '/characters/char-test') }] } })
}

test('a synthetic owner approval yields only a local candidate and disabled plan', () => {
  const catalog = syntheticCatalog(), testPoint = catalog.points[0]
  const testRecord = { ...record, point_id: testPoint.point_id,
    generation_key: testPoint.generation_key, subject_id: testPoint.subject_id }
  const observation = observeForegroundImage(testPoint, testRecord, bytes)
  const approval = { version: 'foreground-local-approval-v1', role: 'PROJECT_OWNER',
    decision: 'ACCEPT_LOCAL_CANDIDATE', reviewer: 'synthetic-reviewer',
    reviewed_at: '2026-09-27T01:00:00.000Z',
    source_ref: `codex-thread:00000000-0000-4000-8000-000000000001#msg_${'2'.repeat(40)}`,
    observation_id: observation.observation_id, point_id: testPoint.point_id,
    generation_key: testPoint.generation_key, file_sha256: record.file.sha256 }
  const candidate = acceptForegroundLocalCandidate(testPoint, testRecord, bytes, approval)
  assert.equal(candidate.association, 'OBSERVER_ATTESTED_LOCAL_ARTIFACT')
  assert.equal(candidate.provider_result_id, null)
  assert.equal(candidate.storage_status, 'NOT_STORED')
  const plan = planForegroundLocalIngest(candidate, catalog, testRecord, bytes)
  assert.equal(plan.execution_enabled, false)
  assert.equal(plan.storage_writes, 0)
  assert.equal(plan.registry_asset_id, null)
  assert.throws(() => acceptForegroundLocalCandidate(testPoint, testRecord, bytes,
    { ...approval, observation_id: 'observation-' + '0'.repeat(64) }))
  assert.throws(() => planForegroundLocalIngest({ ...candidate, public_url: 'https://example.test/image.png' }, catalog, testRecord, bytes))
  const stale = structuredClone(catalog)
  stale.points[0].generation_key = `generation-${'0'.repeat(64)}`
  assert.throws(() => planForegroundLocalIngest(candidate, stale, testRecord, bytes))
})
