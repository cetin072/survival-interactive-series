import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { readPinnedPublishedSeason } from './published-season-git.mjs'

const run = promisify(execFile)
const gitBinary = process.env.TEST_GIT_BINARY || 'git'
const git = (root, ...args) => run(gitBinary, ['-C', root, ...args], { windowsHide: true })
const id = '0'.repeat(63) + '1'
const uuid = '00000000-0000-4000-8000-000000000001'

test('published season inventory reads only manifests from one pinned commit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archive-public-season-'))
  const base = 'archive/content/transcripts/C03-AFTERFALL/S03'
  const entry = { session_id: 'SESSION_010', visibility: 'PUBLIC_ARCHIVE',
    source_manifest: 'SESSION_010/SOURCE_MANIFEST.json', source_session_uuid: uuid,
    source_message_order: { start: 0, end: 1 }, segment_id: `segment-${id}`,
    candidate_id: `candidate-${id}` }
  const manifest = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL',
    season_id: 'S03', archive_class: 'COLD_RAW', visibility: 'PUBLIC_ARCHIVE',
    sessions: [{ session_id: 'SESSION_009' }, entry] }
  const source = { ...entry, chronicle_id: manifest.chronicle_id,
    worldline_id: manifest.worldline_id, season_id: manifest.season_id,
    segment_status: 'SEALED', publication_allowed: true,
    approval_provenance_ref: 'OWNER_APPROVAL:synthetic-test-only',
    parts: ['PART_001.md'], parts_sha256: { 'PART_001.md': id } }
  try {
    await mkdir(join(root, base, 'SESSION_010'), { recursive: true })
    await writeFile(join(root, base, 'MANIFEST.json'), JSON.stringify(manifest))
    await writeFile(join(root, base, 'SESSION_010', 'SOURCE_MANIFEST.json'), JSON.stringify(source))
    await git(root, 'init', '-q')
    await git(root, 'config', 'user.name', 'Archive Test')
    await git(root, 'config', 'user.email', 'archive-test@example.invalid')
    await git(root, 'add', '--', base)
    await git(root, 'commit', '-qm', 'synthetic published season')
    const commit = (await git(root, 'rev-parse', 'HEAD')).stdout.trim()
    // Uncommitted changes cannot alter the pinned replay identity.
    await writeFile(join(root, base, 'MANIFEST.json'), JSON.stringify({ ...manifest, sessions: [] }))
    await writeFile(join(root, base, 'SESSION_010', 'SOURCE_MANIFEST.json'),
      JSON.stringify({ ...source, publication_allowed: false }))
    const result = await readPinnedPublishedSeason('S03', commit, { repoRoot: root, gitBinary })
    assert.deepEqual(result.inventory.reserved_session_ids, ['SESSION_009', 'SESSION_010'])
    assert.equal(result.inventory.segments[0].segment_id, entry.segment_id)
    assert.equal(result.inventory_commit, commit)
    assert.match(result.inventory_sha256, /^[a-f0-9]{64}$/)
    assert.ok(!JSON.stringify(result).includes('OWNER_APPROVAL'))
    await assert.rejects(readPinnedPublishedSeason('S03', '0'.repeat(40),
      { repoRoot: root, gitBinary }))
    await assert.rejects(readPinnedPublishedSeason('../S03', commit,
      { repoRoot: root, gitBinary }), /INVALID_PUBLISHED_SEASON_ID/)
    await assert.rejects(readPinnedPublishedSeason('S02', commit,
      { repoRoot: root, gitBinary }))
    // A committed pending source fails closed.
    await writeFile(join(root, base, 'MANIFEST.json'), JSON.stringify(manifest))
    await git(root, 'add', '--', base)
    await git(root, 'commit', '-qm', 'synthetic pending source')
    const pendingCommit = (await git(root, 'rev-parse', 'HEAD')).stdout.trim()
    await assert.rejects(readPinnedPublishedSeason('S03', pendingCommit,
      { repoRoot: root, gitBinary }), /PUBLISHED_SEGMENT_SOURCE_MISMATCH/)
  } finally {
    const target = resolve(root), temp = resolve(tmpdir()) + sep
    assert.ok(target.startsWith(temp))
    await rm(target, { recursive: true, force: true })
  }
})
