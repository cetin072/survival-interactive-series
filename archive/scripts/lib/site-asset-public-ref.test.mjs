import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { visualDigest } from './visual-compiler.mjs'
import { commitSiteAssetFromPublicRef } from './site-asset-public-ref.mjs'

const gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git'
const git = (root, ...args) => execFileSync(gitBinary, args, { cwd: root }).toString().trim()
const gitBytes = (root, ...args) => execFileSync(gitBinary, args, { cwd: root })
const catalog = JSON.parse(await readFile(new URL('../../content/visuals/C03-AFTERFALL/VISUALS.json', import.meta.url)))
const published = JSON.parse(await readFile(new URL('../../content/visuals/C03-AFTERFALL/SITE_ASSETS.json', import.meta.url)))
const derivative = Buffer.from(await readFile(new URL('../../experiments/step8/char-jinwoo-20260927-site-512.png', import.meta.url)))
const original = Buffer.from(await readFile(new URL('../../experiments/step6/char-jinwoo-20260927-foreground.png', import.meta.url)))
const prepared = { status: 'SITE_ASSET_PREPARED_NOT_PUBLISHED',
  asset: published.assets[0], storage_readback_sha256: published.assets[0].source_sha256,
  derivative_sha256: published.assets[0].sha256 }
const ref = 'refs/heads/codex/archive-publication-image-test'

async function repository({ unlistedFile = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'archive-site-commit-test-'))
  git(root, 'init', '-b', 'main')
  const directory = join(root, 'archive/content/visuals/C03-AFTERFALL')
  await mkdir(directory, { recursive: true })
  const body = { version: 'archive-site-assets-v1', chronicle_id: catalog.chronicle_id,
    worldline_id: catalog.worldline_id, visibility: 'PUBLIC_ARCHIVE',
    visual_catalog_sha256: catalog.content_sha256, assets: [] }
  await writeFile(join(directory, 'VISUALS.json'), JSON.stringify(catalog, null, 2) + '\n')
  await writeFile(join(directory, 'SITE_ASSETS.json'), JSON.stringify({ ...body,
    content_sha256: visualDigest(body) }, null, 2) + '\n')
  if (unlistedFile) {
    const publicDirectory = join(root, 'archive/web/public/visual-assets')
    await mkdir(publicDirectory, { recursive: true })
    await writeFile(join(publicDirectory, 'stale.png'), derivative)
  }
  git(root, 'add', 'archive')
  git(root, '-c', 'user.name=Site Test', '-c', 'user.email=site@example.invalid',
    'commit', '-m', 'Baseline')
  const baseCommit = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', ref, baseCommit)
  return { root, baseCommit }
}

test('one authorized ref update commits manifest and exact image together; replay is NOOP', async () => {
  const { root, baseCommit } = await repository()
  try {
    const input = { repoRoot: root, ref, baseCommit, prepared,
      derivativeBytes: derivative, gitBinary }
    const first = await commitSiteAssetFromPublicRef({ ...input,
      authorizeCommit: async () => true })
    assert.equal(first.status, 'LOCAL_SITE_ASSET_PROPOSAL_COMMITTED')
    assert.equal(first.files_in_commit, 2)
    assert.equal(first.checkout_files_written + first.remote_pushes + first.site_publications, 0)
    assert.equal(git(root, 'rev-parse', ref), first.commit)
    assert.equal(git(root, 'show', `${first.commit}:archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json`)
      .includes(prepared.asset.accepted_candidate_id), true)
    const file = gitBytes(root, 'show', `${first.commit}:archive/web/public${prepared.asset.public_path}`)
    assert.deepEqual(file, derivative)
    const replay = await commitSiteAssetFromPublicRef({ ...input,
      baseCommit: first.commit, authorizeCommit: async () => { throw new Error('SHOULD_NOT_COMMIT') } })
    assert.equal(replay.status, 'EXISTING_SITE_ASSET_REUSED')
    assert.equal(replay.commit, first.commit)
    assert.equal(git(root, 'status', '--short'), '')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('rejected approval, altered derivative and stale base leave proposal ref unchanged', async () => {
  const { root, baseCommit } = await repository()
  try {
    const input = { repoRoot: root, ref, baseCommit, prepared,
      derivativeBytes: derivative, gitBinary }
    await assert.rejects(commitSiteAssetFromPublicRef({ ...input,
      authorizeCommit: async () => false }), /SITE_REF_COMMIT_NOT_AUTHORIZED/)
    assert.equal(git(root, 'rev-parse', ref), baseCommit)
    await assert.rejects(commitSiteAssetFromPublicRef({ ...input,
      derivativeBytes: original, authorizeCommit: async () => true }), /SITE_REF_DERIVATIVE_MISMATCH/)
    assert.equal(git(root, 'rev-parse', ref), baseCommit)
    const first = await commitSiteAssetFromPublicRef({ ...input,
      authorizeCommit: async () => true })
    await assert.rejects(commitSiteAssetFromPublicRef({ ...input,
      authorizeCommit: async () => true }), /SITE_REF_BASE_MOVED/)
    assert.equal(git(root, 'rev-parse', ref), first.commit)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('a public PNG omitted from the pinned manifest blocks the proposal', async () => {
  const { root, baseCommit } = await repository({ unlistedFile: true })
  try {
    await assert.rejects(commitSiteAssetFromPublicRef({ repoRoot: root, ref,
      baseCommit, prepared, derivativeBytes: derivative, gitBinary,
      authorizeCommit: async () => true }), /SITE_REF_UNLISTED_PUBLIC_IMAGE/)
    assert.equal(git(root, 'rev-parse', ref), baseCommit)
  } finally { await rm(root, { recursive: true, force: true }) }
})
