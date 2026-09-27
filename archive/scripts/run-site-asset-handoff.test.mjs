import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { visualDigest } from './lib/visual-compiler.mjs'
import { verifyStagingSiteAsset, proposeStagingSiteAsset } from './run-site-asset-handoff.mjs'

const source = Buffer.from(await readFile(new URL('../experiments/step6/char-jinwoo-20260927-foreground.png', import.meta.url)))
const derivative = Buffer.from(await readFile(new URL('../experiments/step8/char-jinwoo-20260927-site-512.png', import.meta.url)))
const manifest = JSON.parse(await readFile(new URL('../content/visuals/C03-AFTERFALL/SITE_ASSETS.json', import.meta.url)))
const asset = manifest.assets[0]
const catalog = JSON.parse(await readFile(new URL('../content/visuals/C03-AFTERFALL/VISUALS.json', import.meta.url)))
const gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git'
const git = (root, ...args) => execFileSync(gitBinary, args, { cwd: root }).toString().trim()
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

test('remote-read adapter feeds one atomic local site proposal and replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archive-site-runner-test-'))
  try {
    git(root, 'init', '-b', 'main')
    const directory = join(root, 'archive/content/visuals/C03-AFTERFALL')
    await mkdir(directory, { recursive: true })
    const body = { version: manifest.version, chronicle_id: manifest.chronicle_id,
      worldline_id: manifest.worldline_id, visibility: manifest.visibility,
      visual_catalog_sha256: catalog.content_sha256, assets: [] }
    await writeFile(join(directory, 'VISUALS.json'), JSON.stringify(catalog, null, 2) + '\n')
    await writeFile(join(directory, 'SITE_ASSETS.json'), JSON.stringify({ ...body,
      content_sha256: visualDigest(body) }, null, 2) + '\n')
    git(root, 'add', 'archive/content/visuals')
    git(root, '-c', 'user.name=Site Test', '-c', 'user.email=site@example.invalid',
      'commit', '-m', 'Baseline')
    const baseCommit = git(root, 'rev-parse', 'HEAD')
    const ref = 'refs/heads/codex/archive-publication-runner-test'
    git(root, 'update-ref', ref, baseCommit)
    const f = fixture()
    const input = { ...f.input, repoRoot: root, ref, baseCommit, gitBinary,
      authorizeCommit: async (context) => context.originalSha256 === asset.source_sha256 }
    const first = await proposeStagingSiteAsset(input)
    assert.equal(first.status, 'LOCAL_SITE_ASSET_PROPOSAL_COMMITTED')
    assert.equal(first.remote_readback_proven, true)
    assert.equal(first.execution_code_uploads + first.database_writes
      + first.checkout_files_written + first.remote_pushes + first.site_publications, 0)
    assert.equal(git(root, 'rev-parse', ref), first.commit)
    const replay = await proposeStagingSiteAsset({ ...input, baseCommit: first.commit,
      authorizeCommit: async () => { throw new Error('SHOULD_NOT_AUTHORIZE_REPLAY') } })
    assert.equal(replay.status, 'EXISTING_SITE_ASSET_REUSED')
    assert.equal(replay.commit, first.commit)
  } finally { await rm(root, { recursive: true, force: true }) }
})
