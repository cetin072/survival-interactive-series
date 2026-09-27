/** Isolated PostgreSQL and bare-Git test of the real runner role and resume. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import pg from 'pg'
import { materializePublicationSegment } from '../scripts/lib/publication-segment-materialize.mjs'
import { preparePublicSegmentBundle } from '../scripts/lib/public-segment-bundle.mjs'
import { runApprovedTextProposal, textProposalIdentity } from '../scripts/lib/daily-text-proposal-runner.mjs'
import { commitOrReuseRemoteTextProposal } from '../scripts/lib/remote-text-proposal.mjs'

const runnerUrl = process.env.ARCHIVE_TEST_RUNNER_DATABASE_URL
const adminUrl = process.env.ARCHIVE_TEST_ADMIN_DATABASE_URL
if (!runnerUrl || !adminUrl) throw new Error('ISOLATED_TEXT_RUNNER_DATABASES_REQUIRED')
const run = promisify(execFile)
const gitBinary = process.env.TEST_GIT_BINARY || 'git'
const git = (root, ...args) => run(gitBinary, ['-C', root, ...args],
  { windowsHide: true })
const hash = (value) => createHash('sha256').update(value).digest('hex')
const uuid = (tail) => `00000000-0000-4000-8000-${String(tail).padStart(12, '0')}`
const githubToken = 'synthetic-test-token-never-used-remotely'

function fakeGitHub(root) {
  let next = 100
  return async (url, options) => {
    const path = new URL(url)
    if (options.method !== 'POST') return { ok: true, json: async () => [] }
    const body = JSON.parse(options.body)
    assert.equal(body.draft, true)
    assert.equal(body.base, 'main')
    const sha = (await git(root, 'ls-remote', '--heads', 'origin',
      `refs/heads/${body.head}`)).stdout.split('\t')[0]
    const number = next++
    assert.ok(/^[a-f0-9]{40}$/.test(sha))
    assert.equal(path.pathname, '/repos/cetin072/survival-interactive-series/pulls')
    return { ok: true, json: async () => ({ number, state: 'open', draft: true,
      merged_at: null, head: { ref: body.head, sha }, base: { ref: 'main' },
      html_url: `https://github.com/cetin072/survival-interactive-series/pull/${number}` }) }
  }
}

async function approvedBundle(baseCommit, sessionTail) {
  const rows = [
    { message_id: uuid(sessionTail * 100 + 1), content: 'SYNTHETIC_USER',
      game_time: '2099-01-01 09:59' },
    { message_id: uuid(sessionTail * 100 + 2),
      content: '## 2099년 1월 1일 10:00\n\nSYNTHETIC_GM',
      game_time: '2099-01-01 10:00' },
  ]
  const messages = rows.map((row, index) => ({ message_id: row.message_id,
    idempotency_key: uuid(sessionTail * 100 + 11 + index),
    message_order: index, role: index ? 'GM' : 'USER',
    content_sha256: hash(row.content), save_version: 253,
    public_safe: true, source_type: 'LIVE' }))
  const { candidate, partBytes } = materializePublicationSegment({
    version: 'publication-segment-snapshot-v1',
    chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S03',
    session_id: uuid(sessionTail), session_status: 'OPEN',
    session_observed_last_order: 1, snapshot_start_order: 0,
    snapshot_end_order: 1, messages,
    turn_outcomes: [{ turn_no: 1, outcome: 'NO_STATE_CHANGE',
      user_save_version: 253, gm_save_version: 253 }],
    approval_provenance_ref: null,
  }, rows)
  const approval = { version: 'public-segment-approval-v1',
    decision: 'APPROVED_PUBLIC_ARCHIVE', season_id: candidate.season_id,
    candidate_id: candidate.candidate_id,
    candidate_sha256: hash(JSON.stringify(candidate)),
    segment_id: candidate.segment_id, part_sha256: candidate.part_sha256,
    approval_provenance_ref: 'OWNER_APPROVAL:synthetic-test-only' }
  const bundle = await preparePublicSegmentBundle(candidate, partBytes, {
    baseCommit, approval, authorizePromotion: async () => true,
  })
  return { candidate, bundle }
}

test('dedicated task RPCs produce one remote text proposal and recover a lost lease', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'archive-text-ledger-'))
  const root = join(dir, 'repo'), remote = join(dir, 'remote.git')
  const runner = new pg.Client({ connectionString: runnerUrl })
  const admin = new pg.Client({ connectionString: adminUrl })
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
    const fetchImpl = fakeGitHub(root)
    await Promise.all([runner.connect(), admin.connect()])
    await assert.rejects(runner.query(
      'select * from survival_rpg.archive_publication_tasks'), /permission denied/)
    await assert.rejects(runner.query(
      'select * from survival_rpg.claim_archive_publication_task($1::text,$2::integer)',
      ['ci-forbidden-global', 30]), /permission denied/)
    const unrelatedInput = await approvedBundle(baseCommit, 9)
    const unrelated = textProposalIdentity(unrelatedInput.candidate,
      unrelatedInput.bundle)
    await runner.query(`select * from survival_rpg.enqueue_archive_publication_task(
      $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text)`,
    [unrelated.taskId, unrelated.batchId, unrelated.planId, 'TEXT_SOURCE',
      'C03-AFTERFALL', 'AFTERFALL', unrelated.seasonId, unrelated.sourceSha256])
    const firstInput = await approvedBundle(baseCommit, 1)
    const first = await runApprovedTextProposal({ runner,
      scheduledDate: '2026-01-03', ...firstInput, repoRoot: root,
      authorizeCommit: async () => true, gitBinary, githubToken, fetchImpl })
    assert.equal(first.status, 'DRAFT_TEXT_PR_READY')
    assert.equal(first.pr_number, 100)
    assert.deepEqual((await admin.query(`select status,attempt_count
      from survival_rpg.archive_publication_tasks where task_id=$1`,
    [unrelated.taskId])).rows[0], { status: 'PENDING', attempt_count: 0 })
    assert.equal(first.proposal_reused, false)
    const state = await admin.query(`select d.status as daily_status,
      t.status as task_status, t.attempt_count as task_attempts
      from survival_rpg.archive_publication_daily_runs d
      join survival_rpg.archive_publication_run_batches b
        on b.scheduled_date=d.scheduled_date
      join survival_rpg.archive_publication_tasks t on t.batch_id=b.batch_id
      where d.scheduled_date=$1`, ['2026-01-03'])
    assert.deepEqual(state.rows, [{ daily_status: 'COMPLETE',
      task_status: 'COMPLETE', task_attempts: 1 }])
    const beforeEvents = (await admin.query(`select count(*)::integer as n
      from survival_rpg.archive_publication_task_events
      where task_id=$1`, [first.task_id])).rows[0].n
    const replay = await runApprovedTextProposal({ runner,
      scheduledDate: '2026-01-03', ...firstInput, repoRoot: root,
      authorizeCommit: async () => { throw new Error('REPLAY_MUST_NOT_COMMIT') },
      gitBinary, githubToken, fetchImpl })
    assert.equal(replay.status, 'NOOP')
    assert.equal(replay.claimed, false)
    assert.equal((await admin.query(`select count(*)::integer as n
      from survival_rpg.archive_publication_task_events
      where task_id=$1`, [first.task_id])).rows[0].n, beforeEvents)

    const resumedInput = await approvedBundle(baseCommit, 2)
    const identity = textProposalIdentity(resumedInput.candidate, resumedInput.bundle)
    const date = '2026-01-04', abandoned = 'ci-abandoned-worker'
    const oldDaily = (await runner.query(
      'select * from survival_rpg.claim_archive_publication_daily_run($1::date,$2::text,$3::integer)',
      [date, abandoned, 30])).rows[0]
    await runner.query(`select * from survival_rpg.enqueue_archive_publication_task(
      $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text)`,
    [identity.taskId, identity.batchId, identity.planId, 'TEXT_SOURCE',
      'C03-AFTERFALL', 'AFTERFALL', identity.seasonId, identity.sourceSha256])
    await runner.query(`select survival_rpg.link_archive_publication_run_batch(
      $1::date,$2::bigint,$3::uuid,$4::text,$5::text)`,
    [date, oldDaily.out_claim_version, oldDaily.out_lease_token,
      identity.batchId, identity.planId])
    const oldTask = (await runner.query(
      'select * from survival_rpg.claim_archive_publication_task_by_id($1::text,$2::text,$3::integer)',
      [identity.taskId, abandoned, 30])).rows[0]
    assert.equal(oldTask.out_task_id, identity.taskId)
    const pushed = await commitOrReuseRemoteTextProposal(resumedInput.bundle,
      { repoRoot: root, taskId: identity.taskId,
        authorizeCommit: async () => true, gitBinary })
    assert.equal(pushed.remoteVerified, true)
    await admin.query(`update survival_rpg.archive_publication_daily_runs
      set lease_expires_at=clock_timestamp()-interval '1 second'
      where scheduled_date=$1`, [date])
    await admin.query(`update survival_rpg.archive_publication_tasks
      set lease_expires_at=clock_timestamp()-interval '1 second'
      where task_id=$1`, [identity.taskId])
    const recovered = await runApprovedTextProposal({ runner,
      scheduledDate: date, ...resumedInput, repoRoot: root,
      authorizeCommit: async () => { throw new Error('REPLAY_MUST_NOT_COMMIT') },
      gitBinary, githubToken, fetchImpl })
    assert.equal(recovered.status, 'DRAFT_TEXT_PR_READY')
    assert.equal(recovered.pr_number, 101)
    assert.equal(recovered.proposal_reused, true)
    assert.equal(recovered.proposal_commit, pushed.commit)
    const attempts = (await admin.query(`select attempt_count, status
      from survival_rpg.archive_publication_tasks where task_id=$1`,
    [identity.taskId])).rows[0]
    assert.deepEqual(attempts, { attempt_count: 2, status: 'COMPLETE' })
    await assert.rejects(runner.query(
      'select survival_rpg.finish_archive_publication_task($1::text,$2::bigint,$3::uuid,$4::text,$5::jsonb,$6::text,$7::integer)',
      [identity.taskId, oldTask.out_claim_version,
        oldTask.out_lease_token, 'COMPLETE', '{}', null, null]),
    /TASK_LEASE_NOT_OWNED/)
  } finally {
    await Promise.allSettled([runner.end(), admin.end()])
    const path = resolve(dir), parent = resolve(tmpdir()) + sep
    assert.ok(path.startsWith(parent))
    await rm(path, { recursive: true, force: true })
  }
})
