/** Run one approved TEXT_SOURCE proposal through the existing durable ledger.
 * The caller must supply a bundle produced by preparePublicSegmentBundle and a
 * trusted commit operation. This stage never marks a site release published.
 */
import { createHash, randomUUID } from 'node:crypto'
import { fingerprint } from './publication-plan.mjs'
import { commitOrReuseRemoteTextProposal } from './remote-text-proposal.mjs'
import { openOrReuseDraftTextPr } from './github-text-proposal-pr.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const hash = (value) => createHash('sha256').update(value).digest('hex')

export function textProposalIdentity(candidate, bundle) {
  demand(candidate?.version === 'publication-segment-raw-candidate-v1'
    && candidate.chronicle_id === 'C03-AFTERFALL'
    && candidate.worldline_id === 'AFTERFALL'
    && /^S\d{2,3}$/.test(candidate.season_id)
    && /^segment-[a-f0-9]{64}$/.test(candidate.segment_id)
    && /^candidate-[a-f0-9]{64}$/.test(candidate.candidate_id)
    && /^batch-[a-f0-9]{64}$/.test(candidate.semantic_batch_id)
    && digest(candidate.source_digest)
    && bundle?.report?.status === 'APPROVED_FILES_PREPARED_IN_MEMORY'
    && bundle.report.segment_id === candidate.segment_id
    && bundle.report.candidate_id === candidate.candidate_id
    && bundle.report.season_id === candidate.season_id
    && bundle.report.part_sha256 === candidate.part_sha256
    && bundle.files instanceof Map && bundle.files.size === 3,
  'APPROVED_TEXT_BUNDLE_REQUIRED')
  const prefix = `archive/content/transcripts/C03-AFTERFALL/${candidate.season_id}`
  const sessionPrefix = `${prefix}/${bundle.report.session_id}`
  const part = bundle.files.get(`${sessionPrefix}/PART_001.md`)
  const sourceBytes = bundle.files.get(`${sessionPrefix}/SOURCE_MANIFEST.json`)
  const seasonBytes = bundle.files.get(`${prefix}/MANIFEST.json`)
  demand(Buffer.isBuffer(part) && Buffer.isBuffer(sourceBytes)
    && Buffer.isBuffer(seasonBytes)
    && hash(part) === candidate.part_sha256
    && hash(sourceBytes) === bundle.report.source_manifest_sha256
    && hash(seasonBytes) === bundle.report.season_manifest_sha256,
  'APPROVED_TEXT_FILES_MISMATCH')
  const source = JSON.parse(sourceBytes.toString('utf8'))
  demand(source.candidate_id === candidate.candidate_id
    && source.segment_id === candidate.segment_id
    && source.source_digest === candidate.source_digest
    && source.source_session_uuid === candidate.source_session_uuid
    && source.publication_allowed === true
    && source.visibility === 'PUBLIC_ARCHIVE'
    && typeof source.approval_provenance_ref === 'string'
    && source.approval_provenance_ref.length > 0,
  'APPROVED_TEXT_SOURCE_MISMATCH')
  const planId = `plan-${fingerprint({ version: 'text-proposal-v1',
    batchId: candidate.semantic_batch_id, candidateId: candidate.candidate_id,
    sourceDigest: candidate.source_digest })}`
  const taskId = `task-${fingerprint({ planId, segmentId: candidate.segment_id,
    kind: 'TEXT_SOURCE' })}`
  return { taskId, batchId: candidate.semantic_batch_id, planId,
    sourceSha256: candidate.source_digest, seasonId: candidate.season_id }
}

export async function requirePublicationRunnerRole(runner) {
  const result = await runner.query(`select session_user::text, current_user::text,
      r.rolsuper, r.rolbypassrls, r.rolinherit, r.rolcreaterole, r.rolcreatedb,
      exists(select 1 from pg_auth_members m where m.member=r.oid) as has_membership,
      has_table_privilege(current_user, 'survival_rpg.transcript_messages', 'SELECT') as can_read_source,
      has_table_privilege(current_user, 'survival_rpg.archive_publication_tasks', 'SELECT') as can_read_tasks,
      has_table_privilege(current_user, 'survival_rpg.archive_publication_tasks', 'UPDATE') as can_update_tasks,
      has_function_privilege(current_user,
        'survival_rpg.claim_archive_publication_task_by_id(text,text,integer)', 'EXECUTE') as can_claim_task,
      has_function_privilege(current_user,
        'survival_rpg.claim_archive_publication_task(text,integer)', 'EXECUTE') as can_claim_any_task,
      has_function_privilege(current_user,
        'survival_rpg.renew_archive_publication_task_lease(text,bigint,uuid,integer)', 'EXECUTE') as can_renew_task,
      has_function_privilege(current_user,
        'survival_rpg.finish_archive_publication_task(text,bigint,uuid,text,jsonb,text,integer)', 'EXECUTE') as can_finish_task
    from pg_roles r where r.rolname=current_user`)
  const role = result.rows?.[0]
  demand(result.rows?.length === 1
    && role.session_user === 'archive_publication_runner'
    && role.current_user === 'archive_publication_runner'
    && role.rolsuper === false && role.rolbypassrls === false
    && role.rolinherit === false && role.rolcreaterole === false
    && role.rolcreatedb === false && role.has_membership === false
    && role.can_read_source === false && role.can_read_tasks === false
    && role.can_update_tasks === false && role.can_claim_task === true
    && role.can_claim_any_task === false
    && role.can_renew_task === true && role.can_finish_task === true,
  'DEDICATED_PUBLICATION_RUNNER_REQUIRED')
}

async function finishDaily(runner, scheduledDate, claim, status, receipt,
  errorCode = null, retrySeconds = null) {
  const result = await runner.query(
    'select survival_rpg.finish_archive_publication_daily_run($1::date,$2::bigint,$3::uuid,$4::text,$5::jsonb,$6::text,$7::integer) as status',
    [scheduledDate, claim.out_claim_version, claim.out_lease_token,
      status, JSON.stringify(receipt), errorCode, retrySeconds])
  demand(result.rows?.length === 1 && result.rows[0].status === status,
    'DAILY_FINISH_RESULT_INVALID')
}

async function finishTask(runner, claim, status, receipt,
  errorCode = null, retrySeconds = null) {
  const result = await runner.query(
    'select survival_rpg.finish_archive_publication_task($1::text,$2::bigint,$3::uuid,$4::text,$5::jsonb,$6::text,$7::integer) as status',
    [claim.out_task_id, claim.out_claim_version, claim.out_lease_token,
      status, JSON.stringify(receipt), errorCode, retrySeconds])
  demand(result.rows?.length === 1 && result.rows[0].status === status,
    'TASK_FINISH_RESULT_INVALID')
}

/** An interruption leaves leases to expire; a later run reclaims the same IDs.
 * The Git operation verifies the same commit on a remote allowlisted branch
 * before returning. A local-only commit cannot complete the ledger task.
 */
export async function runApprovedTextProposal({ runner, scheduledDate,
  candidate, bundle, repoRoot, authorizeCommit,
  githubToken = process.env.GITHUB_TOKEN,
  fetchImpl = globalThis.fetch,
  gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git',
  workerId = `archive-text-${randomUUID()}`, leaseSeconds = 300 } = {}) {
  demand(date(scheduledDate), 'INVALID_SCHEDULE_DATE')
  demand(/^archive-text-[a-f0-9-]{36}$/.test(workerId)
    && Number.isInteger(leaseSeconds) && leaseSeconds >= 30 && leaseSeconds <= 1800
    && repoRoot && typeof authorizeCommit === 'function'
    && typeof githubToken === 'string' && githubToken.length >= 20,
  'INVALID_TEXT_RUNNER_CONFIGURATION')
  const identity = textProposalIdentity(candidate, bundle)
  await requirePublicationRunnerRole(runner)
  const dailyResult = await runner.query(
    'select * from survival_rpg.claim_archive_publication_daily_run($1::date,$2::text,$3::integer)',
    [scheduledDate, workerId, leaseSeconds])
  demand(dailyResult.rows?.length === 1, 'DAILY_CLAIM_RESULT_INVALID')
  const daily = dailyResult.rows[0]
  if (daily.out_claimed !== true) return {
    status: ['COMPLETE', 'NOOP'].includes(daily.out_status)
      ? 'NOOP' : daily.out_status,
    prior_status: daily.out_status, claimed: false,
    task_id: identity.taskId, site_publications: 0,
  }
  demand(daily.out_status === 'CLAIMED' && typeof daily.out_lease_token === 'string',
    'DAILY_CLAIM_IDENTITY_INVALID')

  const enqueued = await runner.query(
    'select * from survival_rpg.enqueue_archive_publication_task($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text)',
    [identity.taskId, identity.batchId, identity.planId, 'TEXT_SOURCE',
      'C03-AFTERFALL', 'AFTERFALL', identity.seasonId, identity.sourceSha256])
  demand(enqueued.rows?.length === 1
    && enqueued.rows[0].out_task_id === identity.taskId,
  'TASK_ENQUEUE_RESULT_INVALID')
  await runner.query(
    'select survival_rpg.link_archive_publication_run_batch($1::date,$2::bigint,$3::uuid,$4::text,$5::text)',
    [scheduledDate, daily.out_claim_version, daily.out_lease_token,
      identity.batchId, identity.planId])

  if (['COMPLETE', 'NOOP'].includes(enqueued.rows[0].out_status)) {
    await finishDaily(runner, scheduledDate, daily, 'NOOP',
      { result: 'NOOP', reason_code: 'TEXT_TASK_ALREADY_COMPLETE',
        source_sha256: identity.sourceSha256 })
    return { status: 'NOOP', claimed: true, task_id: identity.taskId,
      site_publications: 0 }
  }

  const claimed = await runner.query(
    'select * from survival_rpg.claim_archive_publication_task_by_id($1::text,$2::text,$3::integer)',
    [identity.taskId, workerId, leaseSeconds])
  demand(claimed.rows?.length === 1, 'TEXT_TASK_NOT_CLAIMED')
  const task = claimed.rows[0]
  demand(task.out_task_id === identity.taskId
    && task.out_batch_id === identity.batchId
    && task.out_plan_id === identity.planId
    && task.out_source_snapshot_sha256 === identity.sourceSha256
    && task.out_task_kind === 'TEXT_SOURCE'
    && typeof task.out_lease_token === 'string',
  'TEXT_TASK_IDENTITY_INVALID')

  const renew = async () => {
    const dailyRenew = await runner.query(
      'select survival_rpg.renew_archive_publication_daily_run_lease($1::date,$2::bigint,$3::uuid,$4::integer) as ok',
      [scheduledDate, daily.out_claim_version, daily.out_lease_token, leaseSeconds])
    const taskRenew = await runner.query(
      'select survival_rpg.renew_archive_publication_task_lease($1::text,$2::bigint,$3::uuid,$4::integer) as ok',
      [identity.taskId, task.out_claim_version, task.out_lease_token, leaseSeconds])
    demand(dailyRenew.rows?.[0]?.ok === true && taskRenew.rows?.[0]?.ok === true,
      'PUBLICATION_LEASE_LOST')
  }
  await renew()
  let proposal, leaseFailure = null, inFlight = null
  const timer = setInterval(() => {
    if (inFlight || leaseFailure) return
    inFlight = renew().catch((error) => { leaseFailure = error })
      .finally(() => { inFlight = null })
  }, Math.min(60_000, Math.floor(leaseSeconds * 1000 / 3)))
  timer.unref?.()
  try {
    proposal = await commitOrReuseRemoteTextProposal(bundle, {
      repoRoot, taskId: identity.taskId, authorizeCommit, gitBinary,
    })
  } finally {
    clearInterval(timer)
    if (inFlight) await inFlight
  }
  if (leaseFailure) throw leaseFailure
  demand(/^[a-f0-9]{40}$/.test(proposal?.commit)
    && /^refs\/heads\/codex\/archive-publication-[a-z0-9-]{1,50}$/.test(proposal?.remoteRef)
    && proposal.remoteVerified === true
    && typeof proposal.reused === 'boolean', 'TEXT_PROPOSAL_RESULT_INVALID')
  const pr = await openOrReuseDraftTextPr({ remoteRef: proposal.remoteRef,
    commit: proposal.commit, token: githubToken, fetchImpl })
  await renew()
  await finishTask(runner, task, 'COMPLETE',
    { result: 'COMPLETE', reason_code: 'DRAFT_TEXT_PR',
      source_sha256: identity.sourceSha256, pr_number: String(pr.prNumber) })
  await finishDaily(runner, scheduledDate, daily, 'COMPLETE',
    { result: 'COMPLETE', reason_code: 'DRAFT_TEXT_PR',
      source_sha256: identity.sourceSha256, pr_number: String(pr.prNumber) })
  return { status: 'DRAFT_TEXT_PR_READY', task_id: identity.taskId,
    batch_id: identity.batchId, plan_id: identity.planId,
    proposal_commit: proposal.commit, proposal_ref: proposal.remoteRef,
    proposal_reused: proposal.reused, pr_number: pr.prNumber,
    pr_reused: pr.reused,
    site_publications: 0 }
}
