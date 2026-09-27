import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { materializePublicationSegment } from './publication-segment-materialize.mjs'
import { preparePublicSegmentBundle } from './public-segment-bundle.mjs'
import { commitOrReuseRemoteTextProposal, textProposalRef } from './remote-text-proposal.mjs'
import { textProposalIdentity } from './daily-text-proposal-runner.mjs'

const run = promisify(execFile)
const gitBinary = process.env.TEST_GIT_BINARY || 'git'
const git = (root, ...args) => run(gitBinary, ['-C', root, ...args],
  { windowsHide: true })
const hash = (value) => createHash('sha256').update(value).digest('hex')
const uuid = (tail) => `00000000-0000-4000-8000-${String(tail).padStart(12, '0')}`

function syntheticCapture() {
  const rows = [
    { message_id: uuid(101), content: 'SYNTHETIC_USER', game_time: '2099-01-01 09:59' },
    { message_id: uuid(102), content: '## 2099년 1월 1일 10:00\n\nSYNTHETIC_GM',
      game_time: '2099-01-01 10:00' },
  ]
  const messages = rows.map((row, index) => ({ message_id: row.message_id,
    idempotency_key: uuid(201 + index), message_order: index,
    role: index ? 'GM' : 'USER', content_sha256: hash(row.content),
    save_version: 253, public_safe: true, source_type: 'LIVE' }))
  return materializePublicationSegment({ version: 'publication-segment-snapshot-v1',
    chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S03',
    session_id: uuid(1), session_status: 'OPEN', session_observed_last_order: 1,
    snapshot_start_order: 0, snapshot_end_order: 1, messages,
    turn_outcomes: [{ turn_no: 1, outcome: 'NO_STATE_CHANGE',
      user_save_version: 253, gm_save_version: 253 }],
    approval_provenance_ref: null }, rows)
}

test('approved three-file proposal reaches one remote ref, replays, and rejects a moved ref', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'archive-remote-proposal-'))
  const root = join(dir, 'repo'), remote = join(dir, 'remote.git')
  try {
    await run(gitBinary, ['init', '--bare', remote], { windowsHide: true })
    await run(gitBinary, ['init', '-b', 'main', root], { windowsHide: true })
    await git(root, 'config', 'user.name', 'Synthetic Test')
    await git(root, 'config', 'user.email', 'synthetic@example.invalid')
    await writeFile(join(root, 'README.md'), 'synthetic fixture\n')
    await git(root, 'add', 'README.md')
    await git(root, 'commit', '-m', 'Synthetic base')
    await git(root, 'remote', 'add', 'origin', remote)
    await git(root, 'push', 'origin', 'main')
    const baseCommit = (await git(root, 'rev-parse', 'HEAD')).stdout.trim()
    const { candidate, partBytes } = syntheticCapture()
    const approval = { version: 'public-segment-approval-v1',
      decision: 'APPROVED_PUBLIC_ARCHIVE', season_id: candidate.season_id,
      candidate_id: candidate.candidate_id,
      candidate_sha256: hash(JSON.stringify(candidate)),
      segment_id: candidate.segment_id, part_sha256: candidate.part_sha256,
      approval_provenance_ref: 'OWNER_APPROVAL:synthetic-test-only' }
    const bundle = await preparePublicSegmentBundle(candidate, partBytes, {
      baseCommit, approval, authorizePromotion: async () => true })
    assert.equal(textProposalIdentity(candidate, bundle).batchId,
      candidate.semantic_batch_id)
    assert.throws(() => textProposalIdentity({ ...candidate,
      source_digest: 'f'.repeat(64) }, bundle), /APPROVED_TEXT_SOURCE_MISMATCH/)
    const taskId = `task-${'a'.repeat(64)}`
    const options = { repoRoot: root, taskId,
      authorizeCommit: async () => true, gitBinary }
    const first = await commitOrReuseRemoteTextProposal(bundle, options)
    assert.equal(first.reused, false)
    assert.equal(first.remoteVerified, true)
    assert.equal(first.remoteRef, textProposalRef(taskId))
    const remoteHead = (await git(root, 'ls-remote', '--heads', 'origin',
      first.remoteRef)).stdout.split('\t')[0]
    assert.equal(remoteHead, first.commit)
    const replay = await commitOrReuseRemoteTextProposal(bundle, {
      ...options, authorizeCommit: async () => { throw new Error('NO_REAUTH_ON_REPLAY') },
    })
    assert.equal(replay.commit, first.commit)
    assert.equal(replay.reused, true)

    await git(root, 'switch', '-c', 'synthetic-conflict', first.commit)
    await writeFile(join(root, 'BAD.md'), 'extra file\n')
    await git(root, 'add', 'BAD.md')
    await git(root, 'commit', '-m', 'Add unexpected file')
    await git(root, 'push', 'origin', `HEAD:${first.remoteRef}`)
    await git(root, 'switch', 'main')
    await assert.rejects(commitOrReuseRemoteTextProposal(bundle, options),
      /PUBLIC_REMOTE_REF_CONFLICT/)
  } finally {
    const path = resolve(dir), parent = resolve(tmpdir()) + sep
    assert.ok(path.startsWith(parent))
    await rm(path, { recursive: true, force: true })
  }
})
