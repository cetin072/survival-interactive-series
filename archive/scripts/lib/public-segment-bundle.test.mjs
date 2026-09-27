import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { materializePublicationSegment } from './publication-segment-materialize.mjs'
import { preparePublicSegmentBundle } from './public-segment-bundle.mjs'
import { commitPublicSegmentBundle } from './atomic-public-segment-git.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const uuid = (tail) => `00000000-0000-4000-8000-${String(tail).padStart(12, '0')}`
const baseCommit = 'a'.repeat(40)
const run = promisify(execFile)
const gitBinary = process.env.TEST_GIT_BINARY || 'git'
const git = (root, ...args) => run(gitBinary, ['-C', root, ...args], { windowsHide: true })
function fixture(start = 0) {
  const rows = [
    { message_id: uuid(101 + start), content: 'SYNTHETIC_USER', game_time: '2099-01-01 09:59' },
    { message_id: uuid(102 + start), content: '## 2099년 1월 1일 10:00\n\nSYNTHETIC_GM',
      game_time: '2099-01-01 10:00' },
  ]
  const messages = rows.map((row, index) => ({ message_id: row.message_id,
    idempotency_key: uuid(201 + start + index), message_order: start + index,
    role: index ? 'GM' : 'USER', content_sha256: hash(row.content),
    save_version: 253, public_safe: true, source_type: 'LIVE' }))
  const snapshot = { version: 'publication-segment-snapshot-v1',
    chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S03',
    session_id: uuid(1), session_status: 'OPEN',
    session_observed_last_order: start + 1,
    snapshot_start_order: start, snapshot_end_order: start + 1,
    messages, turn_outcomes: [{ turn_no: start / 2 + 1,
      outcome: 'NO_STATE_CHANGE', user_save_version: 253, gm_save_version: 253 }],
    approval_provenance_ref: null }
  return materializePublicationSegment(snapshot, rows)
}
function approval(candidate) {
  return { version: 'public-segment-approval-v1', decision: 'APPROVED_PUBLIC_ARCHIVE',
    season_id: candidate.season_id, candidate_id: candidate.candidate_id,
    candidate_sha256: hash(JSON.stringify(candidate)), segment_id: candidate.segment_id,
    part_sha256: candidate.part_sha256,
    approval_provenance_ref: 'OWNER_APPROVAL:synthetic-test-only' }
}
const authorizePromotion = async () => true // A fake trusted authority for isolated tests only.

test('a bound approval produces three Reader-valid public files only in memory', async () => {
  const { candidate, partBytes } = fixture()
  const original = Buffer.from(partBytes)
  const bundle = await preparePublicSegmentBundle(candidate, partBytes,
    { baseCommit, approval: approval(candidate), authorizePromotion })
  assert.equal(bundle.files.size, 3)
  assert.equal(bundle.report.files_written, 0)
  assert.equal(bundle.report.git_commits, 0)
  assert.equal(bundle.report.site_publications, 0)
  assert.equal(bundle.report.session_id, 'SESSION_001')
  assert.ok(!JSON.stringify(bundle.report).includes('SYNTHETIC_GM'))
  const files = [...bundle.files]
  const season = JSON.parse(files[0][1])
  const source = JSON.parse(files[1][1])
  assert.equal(season.sessions[0].segment_id, candidate.segment_id)
  assert.equal(source.segment_status, 'SEALED')
  assert.equal(source.source_session_status, 'OPEN')
  assert.equal(source.closed_at, undefined)
  assert.equal(source.publication_allowed, true)
  assert.deepEqual(files[2][1], original)
  partBytes.fill(0)
  assert.deepEqual(files[2][1], original)
})

test('a forged, absent, or denied approval cannot produce files', async () => {
  const { candidate, partBytes } = fixture()
  const valid = approval(candidate)
  for (const changed of [
    { ...valid, decision: 'PENDING' },
    { ...valid, candidate_sha256: '0'.repeat(64) },
    { ...valid, part_sha256: '0'.repeat(64) },
    { ...valid, private_note: 'SECRET' },
  ]) await assert.rejects(preparePublicSegmentBundle(candidate, partBytes,
    { baseCommit, approval: changed, authorizePromotion }))
  await assert.rejects(preparePublicSegmentBundle(candidate, partBytes,
    { baseCommit, approval: valid }), /TRUSTED_AUTHORIZER_REQUIRED/)
  await assert.rejects(preparePublicSegmentBundle(candidate, partBytes,
    { baseCommit, approval: valid, authorizePromotion: async () => false }),
  /PUBLIC_PROMOTION_NOT_AUTHORIZED/)
  await assert.rejects(preparePublicSegmentBundle(candidate, partBytes,
    { baseCommit: 'bad', approval: valid, authorizePromotion }),
  /PINNED_PUBLIC_BASE_REQUIRED/)
})

test('next segment preserves the previous public session and refuses replay or tampering', async () => {
  const first = fixture()
  const firstBundle = await preparePublicSegmentBundle(first.candidate, first.partBytes,
    { baseCommit, approval: approval(first.candidate), authorizePromotion })
  const [seasonFile, sourceFile] = [...firstBundle.files]
  const seasonManifest = JSON.parse(seasonFile[1])
  const previousSource = JSON.parse(sourceFile[1])
  const readPriorFile = async (path, revision) => {
    assert.equal(revision, baseCommit)
    assert.ok(firstBundle.files.has(path))
    return firstBundle.files.get(path)
  }
  const listPriorParts = async (path, revision) => {
    assert.equal(revision, baseCommit)
    assert.match(path, /\/SESSION_001$/)
    return ['PART_001.md']
  }
  const next = fixture(2)
  const bundle = await preparePublicSegmentBundle(next.candidate, next.partBytes,
    { baseCommit, seasonManifest, readPriorFile, listPriorParts,
      approval: approval(next.candidate), authorizePromotion })
  const nextSeason = JSON.parse([...bundle.files][0][1])
  assert.deepEqual(nextSeason.sessions[0], seasonManifest.sessions[0])
  assert.equal(nextSeason.sessions[1].session_id, 'SESSION_002')
  assert.equal(nextSeason.sessions[1].source_message_order.start, 2)
  await assert.rejects(preparePublicSegmentBundle(first.candidate, first.partBytes,
    { baseCommit, seasonManifest, readPriorFile, listPriorParts,
      approval: approval(first.candidate), authorizePromotion }), /SEGMENT_ALREADY_PUBLISHED/)
  await assert.rejects(preparePublicSegmentBundle(next.candidate, next.partBytes,
    { baseCommit, seasonManifest, readPriorFile: async (path) =>
      path.endsWith('SOURCE_MANIFEST.json')
        ? Buffer.from(JSON.stringify({ ...previousSource, publication_allowed: false }))
        : readPriorFile(path, baseCommit), listPriorParts,
    approval: approval(next.candidate), authorizePromotion }),
  /PUBLISHED_SEGMENT_SOURCE_MISMATCH/)
})

test('authorized synthetic bundle commits to a dedicated local ref with CAS and no checkout edit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archive-public-git-'))
  const ref = 'refs/heads/codex/archive-publication-test'
  try {
    await git(root, 'init', '-q')
    await git(root, 'config', 'user.name', 'Archive Test')
    await git(root, 'config', 'user.email', 'archive-test@example.invalid')
    await writeFile(join(root, 'README.md'), 'SYNTHETIC_BASE\n')
    await git(root, 'add', 'README.md')
    await git(root, 'commit', '-qm', 'synthetic base')
    const head = (await git(root, 'rev-parse', 'HEAD')).stdout.trim()
    await git(root, 'branch', 'codex/archive-publication-test', head)
    const { candidate, partBytes } = fixture()
    const bundle = await preparePublicSegmentBundle(candidate, partBytes,
      { baseCommit: head, approval: approval(candidate), authorizePromotion })
    await assert.rejects(commitPublicSegmentBundle(bundle,
      { repoRoot: root, ref, gitBinary }), /PUBLIC_GIT_COMMIT_DISABLED/)
    await assert.rejects(commitPublicSegmentBundle(bundle,
      { repoRoot: root, ref, gitBinary, authorizeCommit: async () => false }),
    /PUBLIC_GIT_COMMIT_NOT_AUTHORIZED/)
    assert.equal((await git(root, 'rev-parse', ref)).stdout.trim(), head)
    const result = await commitPublicSegmentBundle(bundle,
      { repoRoot: root, ref, gitBinary, authorizeCommit: async () => true })
    assert.equal(result.status, 'LOCAL_PROPOSAL_COMMITTED')
    assert.equal(result.checkout_files_written, 0)
    assert.equal(result.remote_pushes, 0)
    assert.equal((await git(root, 'rev-parse', ref)).stdout.trim(), result.commit)
    assert.equal((await git(root, 'rev-parse', 'HEAD')).stdout.trim(), head)
    assert.equal((await readFile(join(root, 'README.md'), 'utf8')), 'SYNTHETIC_BASE\n')
    assert.equal((await git(root, 'status', '--porcelain')).stdout.trim(), '')
    for (const [path, bytes] of bundle.files) {
      const committed = await git(root, 'show', `${result.commit}:${path}`)
      assert.deepEqual(Buffer.from(committed.stdout), bytes)
    }
    await assert.rejects(commitPublicSegmentBundle(bundle,
      { repoRoot: root, ref, gitBinary, authorizeCommit: async () => true }),
    /PUBLIC_BASE_MOVED/)
    assert.equal((await git(root, 'rev-parse', ref)).stdout.trim(), result.commit)
    const next = fixture(2)
    const seasonPath = [...bundle.files.keys()].find((path) => path.endsWith('/MANIFEST.json'))
    const seasonManifest = JSON.parse(bundle.files.get(seasonPath))
    const nextBundle = await preparePublicSegmentBundle(next.candidate, next.partBytes, {
      baseCommit: result.commit, seasonManifest,
      readPriorFile: async (path) => Buffer.from((await git(root, 'show',
        `${result.commit}:${path}`)).stdout),
      listPriorParts: async () => ['PART_001.md'],
      approval: approval(next.candidate), authorizePromotion,
    })
    const nextResult = await commitPublicSegmentBundle(nextBundle,
      { repoRoot: root, ref, gitBinary, authorizeCommit: async () => true })
    assert.equal(nextResult.session_id, 'SESSION_002')
    assert.equal(nextResult.base_commit, result.commit)
    assert.equal((await git(root, 'rev-parse', ref)).stdout.trim(), nextResult.commit)
    assert.equal((await git(root, 'rev-parse', 'HEAD')).stdout.trim(), head)
    for (const [path, bytes] of bundle.files) {
      if (path === seasonPath) continue // The season manifest appends SESSION_002.
      assert.deepEqual(Buffer.from((await git(root, 'show', `${nextResult.commit}:${path}`)).stdout), bytes)
    }
  } finally {
    const target = resolve(root), temp = resolve(tmpdir()) + sep
    assert.ok(target.startsWith(temp))
    await rm(target, { recursive: true, force: true })
  }
})
