/** Isolated real public S02 proposal and replay; never changes the calling checkout. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../..')
const gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git'
const git = (cwd, ...args) => execFileSync(gitBinary, args,
  { cwd, maxBuffer: 32 * 1024 * 1024 })
const head = git(root, 'rev-parse', 'HEAD').toString().trim()
const temp = await mkdtemp(join(tmpdir(), 'archive-unified-ref-'))
try {
  const copy = join(temp, 'repo')
  git(root, '-c', 'core.autocrlf=false', 'clone', '--local', '--no-hardlinks',
    '--no-checkout', '--quiet', root, copy)
  git(copy, 'config', 'core.autocrlf', 'false')
  git(copy, 'checkout', '--detach', head)
  const ref = 'refs/heads/codex/archive-publication-unified-test'
  const deniedRef = 'refs/heads/codex/archive-publication-unified-denied-test'
  git(copy, 'update-ref', ref, head)
  git(copy, 'update-ref', deniedRef, head)
  const { snapshotFromPublishedS02 } = await import(pathToFileURL(join(copy,
    'archive/scripts/dry-run-publication.mjs')).href)
  const { proposeUnifiedPublication } = await import(pathToFileURL(join(copy,
    'archive/scripts/lib/unified-publication-ref.mjs')).href)
  const manifest = JSON.parse(await readFile(join(copy,
    'archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json'), 'utf8'))
  const snapshot = snapshotFromPublishedS02(manifest, head)
  const common = { snapshot, repoRoot: copy, baseCommit: head, gitBinary }
  await assert.rejects(proposeUnifiedPublication({ ...common, ref: deniedRef,
    authorizeCommit: async () => false }), /UNIFIED_REF_COMMIT_NOT_AUTHORIZED/)
  assert.equal(git(copy, 'rev-parse', deniedRef).toString().trim(), head)
  const first = await proposeUnifiedPublication({ ...common, ref,
    authorizeCommit: async ({ baseCommit, batchId }) => baseCommit === head
      && typeof batchId === 'string' })
  assert.equal(first.status, 'LOCAL_UNIFIED_PROPOSAL_COMMITTED')
  assert.equal(first.files_in_commit, 3)
  assert.equal(first.checkout_files_written + first.remote_pushes
    + first.site_publications, 0)
  assert.equal(git(copy, 'rev-parse', ref).toString().trim(), first.commit)
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
  for (const [path, expected] of [
    ['archive/content/stories/C03-AFTERFALL/BOOK.json', first.reader_sha256],
    ['archive/content/graphs/C03-AFTERFALL/GRAPH.json', first.graph_sha256],
    ['archive/content/visuals/C03-AFTERFALL/VISUALS.json', first.visual_sha256],
  ]) assert.equal(hash(git(copy, 'show', `${first.commit}:${path}`)), expected)
  assert.equal(git(copy, 'rev-parse', `${first.commit}^`).toString().trim(), head)
  const second = await proposeUnifiedPublication({ ...common, ref,
    authorizeCommit: async () => { throw new Error('REPLAY_MUST_NOT_AUTHORIZE') } })
  assert.equal(second.status, 'EXISTING_UNIFIED_PROPOSAL_REUSED')
  assert.equal(second.commit, first.commit)
  assert.equal(git(copy, 'status', '--short').toString().trim(), '')

  // A newer public visual source invalidates the old image binding. The
  // proposal must update its manifest and remove the stale public PNG atomically.
  const appearancePath = join(copy,
    'archive/content/public-facts/C03-AFTERFALL/S02/APPEARANCES_APPROVED_20260926.json')
  const appearance = JSON.parse(await readFile(appearancePath, 'utf8'))
  appearance.records.find((record) => record.node_id === 'char-jinwoo').visual.hair += ' (isolated fixture)'
  await writeFile(appearancePath, JSON.stringify(appearance, null, 2) + '\n')
  git(copy, 'add', '--', 'archive/content/public-facts/C03-AFTERFALL/S02/APPEARANCES_APPROVED_20260926.json')
  git(copy, '-c', 'user.name=Archive Fixture',
    '-c', 'user.email=archive-fixture@users.noreply.github.com',
    'commit', '--quiet', '-m', 'Isolated visual source change')
  const changedBase = git(copy, 'rev-parse', 'HEAD').toString().trim()
  const changedRef = 'refs/heads/codex/archive-publication-unified-site-change-test'
  git(copy, 'update-ref', changedRef, changedBase)
  const changedSnapshot = snapshotFromPublishedS02(manifest, changedBase)
  const changed = await proposeUnifiedPublication({ snapshot: changedSnapshot,
    repoRoot: copy, ref: changedRef, baseCommit: changedBase, gitBinary,
    authorizeCommit: async ({ staleSiteAssetsRemoved }) => staleSiteAssetsRemoved === 1 })
  assert.equal(changed.status, 'LOCAL_UNIFIED_PROPOSAL_COMMITTED')
  assert.equal(changed.files_in_commit, 5)
  assert.equal(changed.stale_site_assets_removed, 1)
  const site = JSON.parse(git(copy, 'show',
    `${changed.commit}:archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json`))
  const visual = JSON.parse(git(copy, 'show',
    `${changed.commit}:archive/content/visuals/C03-AFTERFALL/VISUALS.json`))
  assert.equal(site.visual_catalog_sha256, visual.content_sha256)
  assert.deepEqual(site.assets, [])
  const oldPublicPath = `archive/web/public${JSON.parse(await readFile(join(copy,
    'archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json'), 'utf8')).assets[0].public_path}`
  assert.equal(git(copy, 'ls-tree', changed.commit, '--', oldPublicPath).toString().trim(), '')
  const changedReplay = await proposeUnifiedPublication({ snapshot: changedSnapshot,
    repoRoot: copy, ref: changedRef, baseCommit: changedBase, gitBinary,
    authorizeCommit: async () => { throw new Error('REPLAY_MUST_NOT_AUTHORIZE') } })
  assert.equal(changedReplay.commit, changed.commit)
  assert.equal(git(copy, 'status', '--short').toString().trim(), '')
  process.stdout.write(JSON.stringify({ real_public_input: true,
    atomic_files: first.files_in_commit, replay_status: second.status,
    stale_visual_assets_removed_in_isolated_fixture: changed.stale_site_assets_removed,
    remote_pushes: 0, site_publications: 0 }) + '\n')
} finally { await rm(temp, { recursive: true, force: true }) }
