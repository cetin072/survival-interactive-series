/** Isolated real public S02 proposal and replay; never changes the calling checkout. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
  const second = await proposeUnifiedPublication({ ...common, ref,
    authorizeCommit: async () => { throw new Error('REPLAY_MUST_NOT_AUTHORIZE') } })
  assert.equal(second.status, 'EXISTING_UNIFIED_PROPOSAL_REUSED')
  assert.equal(second.commit, first.commit)
  assert.equal(git(copy, 'status', '--short').toString().trim(), '')
  process.stdout.write(JSON.stringify({ real_public_input: true,
    atomic_files: first.files_in_commit, replay_status: second.status,
    remote_pushes: 0, site_publications: 0 }) + '\n')
} finally { await rm(temp, { recursive: true, force: true }) }
