import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { inspectPng } from './image-poc-exchange.mjs'
import { observeForegroundImage, acceptForegroundLocalCandidate } from './foreground-image-handoff.mjs'
import { prepareForegroundSiteAsset } from './site-foreground-handoff.mjs'

// Synthetic bytes and readback only. This does not assert a real upload, registry write or image transform.
function crc(bytes) { let c = 0xffffffff; for (const n of bytes) { c ^= n; for (let b = 0; b < 8; b++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0) }; return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc(body), out.length - 4); return out }
function png(size = 1) { const head = Buffer.alloc(13); head.writeUInt32BE(size); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 2; return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', head), chunk('IDAT', deflateSync(Buffer.alloc(size * size * 3 + size))), chunk('IEND', Buffer.alloc(0))]) }
const catalog = JSON.parse(await readFile(new URL('../../content/visuals/C03-AFTERFALL/VISUALS.json', import.meta.url), 'utf8'))
const point = catalog.points.find((item) => item.subject_id === 'char-jinwoo')

function fixture() {
  const originalBytes = png(), file = inspectPng(originalBytes)
  const observation = { version: 'codex-foreground-image-observation-v1', chronicle_id: 'C03-AFTERFALL',
    worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE', subject_id: point.subject_id,
    point_id: point.point_id, generation_key: point.generation_key, tool: 'image_gen.imagegen',
    surface: 'CODEX_BUILTIN_FOREGROUND', output_artifact_basename: 'exec-abc.png',
    intended_request_id: `request-${'a'.repeat(64)}`,
    file: { ...file, pixel_decode_check: 'PIL_VERIFY_AND_LOAD_PASS' },
    review: { reviewer: 'Codex', single_subject: true, no_embedded_text_observed: true,
      public_brief_appearance_match_observed: true, status: 'LOCAL_SAMPLE_REVIEWED_NOT_ACCEPTED',
      final_canon_approval: false }, provider_prompt_equality_proven: false,
    unattended_generation_proven: false, zero_added_cost_invoice_audited: false,
    paid_api_calls: 0, credit_purchase_actions: 0, storage_uploads: 0,
    database_writes: 0, site_publications: 0 }
  const observed = observeForegroundImage(point, observation, originalBytes)
  const approval = { version: 'foreground-local-approval-v1', role: 'PROJECT_OWNER',
    decision: 'ACCEPT_LOCAL_CANDIDATE', reviewer: 'test-owner', reviewed_at: '2026-09-27T00:00:00.000Z',
    source_ref: 'codex-thread:00000000-0000-4000-8000-000000000001#00000000-0000-4000-8000-000000000002',
    observation_id: observed.observation_id, point_id: point.point_id,
    generation_key: point.generation_key, file_sha256: file.sha256 }
  const candidate = acceptForegroundLocalCandidate(point, observation, originalBytes, approval)
  const path = `AFTERFALL/${candidate.candidate_id}/${file.sha256}.png`
  const registry = { worldline_id: 'AFTERFALL', asset_id: 'AF-CHAR-TEST', asset_type: 'CHARACTER',
    status: 'READY', visibility: 'PLAYER_ARCHIVE', object_path: `survival-archive-originals/${path}`,
    source: { point_id: point.point_id, generation_key: point.generation_key,
      subject_id: point.subject_id,
      candidate_id: candidate.candidate_id, source_sha256: file.sha256 },
    generation_meta: { source_sha256: file.sha256 } }
  return { catalog, observation, approval, originalBytes, candidate, derivativeBytes: originalBytes,
    deriveFromOriginal: async (bytes) => bytes,
    downloadOriginal: async () => originalBytes, registry }
}
test('validated source, readback, transformer and registry only prepare a site entry', async () => {
  const result = await prepareForegroundSiteAsset(fixture())
  assert.equal(result.status, 'SITE_ASSET_PREPARED_NOT_PUBLISHED')
  assert.equal(result.asset.registry_asset_id, 'AF-CHAR-TEST')
  assert.equal(result.storage_writes + result.database_writes + result.site_publications, 0)
})
test('candidate, generation and reviewed source cannot be borrowed', async () => {
  const f = fixture()
  await assert.rejects(prepareForegroundSiteAsset({ ...f, candidate: { ...f.candidate, candidate_id: `candidate-${'0'.repeat(64)}` } }))
  await assert.rejects(prepareForegroundSiteAsset({ ...f, approval: { ...f.approval, generation_key: `generation-${'0'.repeat(64)}` } }))
  await assert.rejects(prepareForegroundSiteAsset({ ...f, originalBytes: png(2) }))
  await assert.rejects(prepareForegroundSiteAsset({ ...f, registry: { ...f.registry, source: { ...f.registry.source, generation_key: `generation-${'0'.repeat(64)}` } } }))
  await assert.rejects(prepareForegroundSiteAsset({ ...f, registry: { ...f.registry, source: { ...f.registry.source, subject_id: 'another-character' } } }), /SITE_REGISTRY_BINDING_MISMATCH/)
})
test('unverified upload bytes, unrelated derivative and registry/public status are refused', async () => {
  const f = fixture()
  await assert.rejects(prepareForegroundSiteAsset({ ...f, downloadOriginal: async () => png(2) }), /SITE_STORAGE_READBACK_MISMATCH/)
  await assert.rejects(prepareForegroundSiteAsset({ ...f, derivativeBytes: png(2) }), /SITE_DERIVATIVE_NOT_FROM_ORIGINAL/)
  await assert.rejects(prepareForegroundSiteAsset({ ...f, registry: { ...f.registry, status: 'PENDING' } }), /SITE_REGISTRY_BINDING_MISMATCH/)
  await assert.rejects(prepareForegroundSiteAsset({ ...f, registry: { ...f.registry, visibility: 'GM_PRIVATE' } }), /SITE_REGISTRY_BINDING_MISMATCH/)
})
