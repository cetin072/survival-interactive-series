import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { makeImagePocRequest, imagePocReceipt, inspectPng } from './image-poc-exchange.mjs'
import { compileVisualCatalog, visualDigest } from './visual-compiler.mjs'
import { acceptLocalImage, planAcceptedImageIngest } from './accepted-image-handoff.mjs'

// Synthetic pixels and public facts only. These are not a model output or real acceptance evidence.
function crc(bytes) { let c = 0xffffffff; for (const n of bytes) { c ^= n; for (let b = 0; b < 8; b++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0) }; return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc(body), out.length - 4); return out }
function png() { const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2; return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(4))), chunk('IEND', Buffer.alloc(0))]) }
function fixture() {
  const ns = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
  const anchor = { save_version: 253, game_time: '2027-03-23 17:50' }
  const evidence = (ref, pointer) => ({ source_ref: ref, source_sha256: 'a'.repeat(64), pointer })
  const graphBody = { version: 'archive-graph-v1', ...ns, anchor, nodes: [{ id: 'char-test',
    data: { id: 'char-test', label: 'TEST', type: 'character', tags: ['PLAYER'], subtitle: '공개 역할', summary: '공개 설명', source: 'SYNTHETIC TEST' },
    anchor, evidence: evidence('archive/web/src/archive/archiveData.ts', '/nodes/0'), history: [] }], relations: [], articles: [], story_links: [] }
  const catalog = compileVisualCatalog({ batch: { batch_id: `batch-${'b'.repeat(64)}`, snapshot: { ...ns, source_save_version: 253, source_game_time: anchor.game_time } },
    graph: { ...graphBody, content_sha256: visualDigest(graphBody) }, appearances: { version: 'public-appearance-v1', ...ns, anchor,
      records: [{ node_id: 'char-test', status: 'confirmed', visual: { apparentAge: '30대', build: '보통', face: '얼굴', hair: '검은 머리' },
        evidence: evidence('archive/web/src/archive/characterAppearance.ts', '/characters/char-test') }] } })
  const request = makeImagePocRequest(catalog.points[0], { batch_id: catalog.batch_id, source_revision: 'c'.repeat(40) })
  const bytes = png()
  const observation = { request_id: request.request_id, point_id: request.point_id, generation_key: request.generation_key,
    tool_result_id: '00000000-0000-4000-8000-000000000001', tool: 'image_gen.text2im', surface: 'CHATGPT_FOREGROUND', review: 'MATCHES_INTENDED_BRIEF' }
  const receipt = imagePocReceipt(request, bytes, observation)
  const review = { reviewer: 'test-reviewer', reviewed_at: '2026-09-27T00:00:00.000Z', pixel_decoded: true,
    single_subject: true, no_embedded_text: true, brief_match: true, source_file_sha256: inspectPng(bytes).sha256 }
  return { catalog, request, receipt, bytes, review }
}

test('explicit review yields a local candidate and a disabled ingest plan', () => {
  const { catalog, request, receipt, bytes, review } = fixture()
  const candidate = acceptLocalImage(request, receipt, bytes, review)
  assert.equal(candidate.status, 'ACCEPTED_LOCAL_CANDIDATE')
  assert.equal(candidate.storage_status, 'NOT_STORED')
  assert.equal(candidate.public_url, null)
  assert.deepEqual(candidate, acceptLocalImage(request, receipt, bytes, review))
  const plan = planAcceptedImageIngest(candidate, catalog, request, receipt, bytes)
  assert.equal(plan.execution_enabled, false)
  assert.equal(plan.registry_asset_id, null)
  assert.equal(plan.storage_writes, 0)
  assert.equal(plan.site_publications, 0)
})
test('unreviewed or rejected results never become candidates', () => {
  const f = fixture()
  for (const content_review of ['NOT_REVIEWED', 'REJECTED_REQUEST_MISMATCH']) {
    const receipt = imagePocReceipt(f.request, f.bytes, { request_id: f.request.request_id, point_id: f.request.point_id,
      generation_key: f.request.generation_key, tool_result_id: f.receipt.tool_result_id,
      tool: f.receipt.tool, surface: f.receipt.surface, review: content_review })
    assert.throws(() => acceptLocalImage(f.request, receipt, f.bytes, f.review))
  }
})
test('review must attest decoded pixels, subject, text and brief match', () => {
  const f = fixture()
  for (const field of ['pixel_decoded', 'single_subject', 'no_embedded_text', 'brief_match'])
    assert.throws(() => acceptLocalImage(f.request, f.receipt, f.bytes, { ...f.review, [field]: false }))
})
test('changed file, receipt or identity cannot be ingested', () => {
  const f = fixture(), candidate = acceptLocalImage(f.request, f.receipt, f.bytes, f.review)
  assert.throws(() => acceptLocalImage(f.request, f.receipt, f.bytes, { ...f.review, source_file_sha256: '0'.repeat(64) }))
  assert.throws(() => acceptLocalImage(f.request, { ...f.receipt, tool_result_id: '00000000-0000-4000-8000-000000000002' }, f.bytes, f.review))
  assert.throws(() => planAcceptedImageIngest({ ...candidate, public_url: 'https://example.test/fake.png' }, f.catalog, f.request, f.receipt, f.bytes))
  const changed = structuredClone(f.catalog)
  changed.points[0].generation_key = `generation-${'0'.repeat(64)}`
  assert.throws(() => planAcceptedImageIngest(candidate, changed, f.request, f.receipt, f.bytes))
})
