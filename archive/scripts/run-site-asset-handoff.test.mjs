import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { verifyStagingSiteAsset } from './run-site-asset-handoff.mjs'

const source = Buffer.from(await readFile(new URL('../experiments/step6/char-jinwoo-20260927-foreground.png', import.meta.url)))
const derivative = Buffer.from(await readFile(new URL('../experiments/step8/char-jinwoo-20260927-site-512.png', import.meta.url)))
const manifest = JSON.parse(await readFile(new URL('../content/visuals/C03-AFTERFALL/SITE_ASSETS.json', import.meta.url)))
const asset = manifest.assets[0]
const row = { worldline_id: 'AFTERFALL', asset_type: 'CHARACTER',
  asset_id: asset.registry_asset_id, status: 'READY', visibility: 'PLAYER_ARCHIVE',
  object_path: `${asset.storage_bucket}/${asset.storage_object_path}`,
  source: { point_id: asset.point_id, generation_key: asset.generation_key,
    subject_id: asset.subject_id, candidate_id: asset.accepted_candidate_id,
    source_sha256: asset.source_sha256 },
  generation_meta: { source_sha256: asset.source_sha256 } }

const response = (value) => ({ ok: true,
  arrayBuffer: async () => Uint8Array.from(value).buffer,
  json: async () => value })
function fixture(overrides = {}) {
  const calls = []
  return { calls, input: { baseUrl: 'https://jgsxpdflgkqroecfjzxq.supabase.co',
    serviceKey: 'x'.repeat(32), deriveFromOriginal: async () => derivative,
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method })
      assert.equal(options.method, 'GET')
      if (url.includes('/storage/v1/')) return response(overrides.source ?? source)
      if (url.includes('/rest/v1/')) return response(overrides.rows ?? [row])
      throw new Error('UNEXPECTED_URL')
    } } }
}

test('read-only staging runner binds exact Storage bytes and READY row to existing site asset', async () => {
  const f = fixture()
  const report = await verifyStagingSiteAsset(f.input)
  assert.equal(report.status, 'EXISTING_SITE_ASSET_REUSED')
  assert.equal(report.remote_readback_proven, true)
  assert.equal(report.asset_id, asset.registry_asset_id)
  assert.equal(report.source_sha256, asset.source_sha256)
  assert.equal(report.derivative_sha256, asset.sha256)
  assert.deepEqual(f.calls.map((call) => call.method), ['GET', 'GET'])
  assert.equal(report.execution_code_uploads + report.database_writes
    + report.files_written + report.site_publications, 0)
})

test('changed remote original fails before registry access', async () => {
  const changed = Buffer.from(source); changed[changed.length - 20] ^= 1
  const f = fixture({ source: changed })
  await assert.rejects(verifyStagingSiteAsset(f.input), /SITE_STORAGE_READBACK_MISMATCH/)
  assert.equal(f.calls.length, 1)
})

test('unreviewed or unrelated registry row cannot reuse the published image', async () => {
  for (const changed of [
    { ...row, status: 'GENERATED' },
    { ...row, source: { ...row.source, subject_id: 'other-character' } },
    { ...row, source: { ...row.source, generation_key: `generation-${'0'.repeat(64)}` } },
  ]) {
    const f = fixture({ rows: [changed] })
    await assert.rejects(verifyStagingSiteAsset(f.input), /SITE_REGISTRY_BINDING_MISMATCH/)
    assert.deepEqual(f.calls.map((call) => call.method), ['GET', 'GET'])
  }
})

test('wrong project and absent registry row are rejected without writes', async () => {
  const f = fixture({ rows: [] })
  await assert.rejects(verifyStagingSiteAsset({ ...f.input,
    baseUrl: 'https://some-other-project.supabase.co' }), /STAGING_SITE_READ_CREDENTIALS_REQUIRED/)
  assert.equal(f.calls.length, 0)
  await assert.rejects(verifyStagingSiteAsset(f.input), /SITE_REGISTRY_ROW_REQUIRED/)
  assert.deepEqual(f.calls.map((call) => call.method), ['GET', 'GET'])
})
