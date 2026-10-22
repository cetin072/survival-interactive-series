import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkRelease, changedFilesFromGit } from './lib/knowledge-release.mjs'
import { applySemanticPackage, postSupabaseRpc, validateSemanticResult } from './lib/knowledge-semantic-jobs.mjs'
import { buildReviewQueuePayload, enqueueReview } from './knowledge-review-sync.mjs'
import { loadKnowledge, validateKnowledge } from './lib/knowledge-content.mjs'
import { verifyPins } from './lib/knowledge-semantic-pins.mjs'
export { verifyPins } from './lib/knowledge-semantic-pins.mjs'

export const repository = 'cetin072/survival-interactive-series'
const root = resolve(import.meta.dirname, '../..')
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = (value) => JSON.stringify(value)
const run = (command, args, cwd, env = {}) => {
  try { return execFileSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
  catch (cause) {
    const error = new Error(`SEMANTIC_INFRA_COMMAND_${command.toUpperCase()}_${cause.status ?? 'FAILED'}`)
    error.retryable = true
    throw error
  }
}

export function semanticBranchRef(jobId) {
  if (!/^[a-f0-9-]{36}$/i.test(jobId ?? '')) throw new Error('SEMANTIC_JOB_ID_INVALID')
  return `knowledge/worker/semantic-${jobId.toLowerCase()}`
}

export function finalizerAction(job, result) {
  validateSemanticResult(job, result)
  if (result.decision === 'HOLD') return { action: 'HOLD', code: result.code }
  return { action: 'PACKAGE', humanReview: result.decision === 'HUMAN_REVIEW', briefId: result.brief.id }
}

export function reconcilePullRequest(job, pr, currentMainSha = null) {
  if (!Number.isInteger(job.final_pr_number) || !/^[a-f0-9]{40}$/.test(job.final_head_sha ?? '')) return { status: 'BLOCKED', code: 'PR_REFERENCE_MISSING' }
  if (pr?.base?.ref !== 'main') return { status: 'BLOCKED', code: 'PR_BASE_NOT_MAIN' }
  if (pr?.head?.repo?.full_name !== repository) return { status: 'BLOCKED', code: 'PR_REPOSITORY_MISMATCH' }
  if (pr?.head?.ref !== job.final_head_ref) return { status: 'BLOCKED', code: 'PR_REF_CHANGED' }
  const registered = job.publication_heads?.includes(pr?.head?.sha)
  if (pr?.head?.sha !== job.final_head_sha && !registered) return { status: 'BLOCKED', code: 'PR_HEAD_CHANGED' }
  if (pr.state === 'open' && pr.merged !== true) {
    return { status: job.status === 'HUMAN_REVIEW' || job.result_decision === 'HUMAN_REVIEW' ? 'HUMAN_REVIEW' : 'PR_OPEN',
      ...(currentMainSha && pr.base.sha !== currentMainSha ? { revalidation_required: true } : {}),
      ...(registered && pr.head.sha !== job.final_head_sha ? { registered_head_sha: pr.head.sha } : {}),
    }
  }
  if (pr.state === 'closed' && pr.merged === true && /^[a-f0-9]{40}$/.test(pr.merge_commit_sha ?? '')) {
    return { status: 'PUBLISHED', mergeSha: pr.merge_commit_sha,
      ...(registered && pr.head.sha !== job.final_head_sha ? { registered_head_sha: pr.head.sha } : {}),
    }
  }
  return { status: 'BLOCKED', code: 'PR_CLOSED_WITHOUT_MERGE' }
}

function rpc(name, args) {
  return postSupabaseRpc({ projectUrl: process.env.ARCHIVE_SUPABASE_URL, serviceRoleKey: process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY, name, args }).catch((cause) => {
    const error = new Error(cause.message.split(':')[0])
    const status = /_HTTP_(\d{3})$/.exec(cause.message)?.[1]
    error.retryable = !status || Number(status) === 429 || Number(status) >= 500
    throw error
  })
}

async function updateJob(requestRpc, jobId, expected, status, { blockerCode = null, blockerStage = null, prNumber = null, headRef = null, headSha = null, mergeSha = null } = {}) {
  return requestRpc('archive_knowledge_semantic_job_update', {
    p_job_id: jobId, p_expected_status: expected, p_status: status,
    p_blocker_code: blockerCode, p_blocker_stage: blockerStage,
    p_pr_number: prNumber, p_head_ref: headRef, p_head_sha: headSha, p_merge_sha: mergeSha,
  })
}

// Prep owns allocation. Gaps in main are valid while reservations remain in the ledger.
export function validateReservedBriefTarget(job, result, briefs = []) {
  const reserved = job.semantic_context?.target?.brief_id
  if (!/^K-[0-9]{3,}$/.test(reserved ?? '')
    || result?.brief?.id !== reserved || result?.candidate?.brief_id !== reserved
    || result?.evidence?.brief_id !== reserved
    || briefs.some((brief) => brief.id === reserved)) throw new Error('SEMANTIC_TARGET_BRIEF_STALE')
  validateSemanticResult(job, result)
  return reserved
}

export async function verifyBriefReservation(job, result, { requestRpc = rpc } = {}) {
  const briefId = validateReservedBriefTarget(job, result)
  if (job.semantic_result && JSON.stringify(result) !== JSON.stringify(job.semantic_result))
    throw new Error('SEMANTIC_RESULT_IDENTITY_CHANGED')
  const verified = await requestRpc('archive_knowledge_semantic_job_verify_reservation', {
    p_job_id: job.job_id, p_brief_id: briefId,
    p_source_ref: job.source_ref, p_source_sha256: job.source_sha256,
    p_policy_sha256: job.policy_sha256, p_result_sha256: job.semantic_result_sha256,
  })
  if (verified?.status !== 'VALID') throw new Error(verified?.code ?? 'SEMANTIC_TARGET_BRIEF_STALE')
  return verified
}

// HOLD with an explicit human reason can enter the review inbox, never publication.
export function humanReviewPackageAllowed(gate) {
  return gate?.requires_human === true
    && ['HUMAN_REVIEW_REQUIRED', 'HOLD'].includes(gate.decision)
}

export async function runPackage(job, result, { currentMainSha, headRef, currentRoot = root, runCommand = run, requestRpc = rpc }) {
  const temp = await mkdtemp(join(tmpdir(), `knowledge-semantic-${job.job_id}-`))
  let worktreeAdded = false
  try {
    runCommand('git', ['worktree', 'add', '--detach', temp, 'origin/main'], currentRoot)
    worktreeAdded = true
    const initial = await loadKnowledge(temp)
    await validateKnowledge(initial)
    validateReservedBriefTarget(job, result, initial.briefs)
    const reservation = await verifyBriefReservation(job, result, { requestRpc })
    await verifyPins(job, temp)
    const applied = await applySemanticPackage({ root: temp, job, result, reservation, now: new Date(job.submitted_at ?? job.prepared_at).toISOString() })
    const requiresHumanReview = result.decision === 'HUMAN_REVIEW' || applied.requires_human_review === true

    if (applied.publication_projection) console.log(JSON.stringify({ publication_projection: applied.publication_projection }))
    if (applied.schema_projection) console.log(JSON.stringify({ schema_projection: applied.schema_projection }))

    runCommand('npm', ['ci'], join(temp, 'archive/web'))
    runCommand('npm', ['run', 'knowledge:test'], join(temp, 'archive/web'))
    runCommand('npm', ['run', 'knowledge:build'], join(temp, 'archive/web'))
    runCommand('npm', ['run', 'knowledge:check'], join(temp, 'archive/web'))
    const data = await loadKnowledge(temp)
    await validateKnowledge(data)
    const changedFiles = changedFilesFromGit({ baseRef: 'origin/main', headRef: 'HEAD', cwd: temp })
    const deterministicData = { ...data, config: { ...data.config, publication_mode: 'AUTO_LOW_RISK', auto_publish_enabled: true } }
    const deterministic = await checkRelease(deterministicData, { changedFiles, briefIds: [result.brief.id], mode: 'AUTO_LOW_RISK', base: temp })
    if (!requiresHumanReview && deterministic.decision !== 'AUTO_PUBLISH_ELIGIBLE') throw new Error(`SEMANTIC_RELEASE_GATE:${deterministic.decision}:${deterministic.reasons.join(',')}`)
    if (requiresHumanReview && !humanReviewPackageAllowed(deterministic)) throw new Error(`SEMANTIC_REVIEW_GATE:${deterministic.decision}`)
    const release = await checkRelease(data, { changedFiles, briefIds: [result.brief.id], mode: data.config.publication_mode, base: temp })
    if (!requiresHumanReview && !['AUTO_PUBLISH_ELIGIBLE', 'WOULD_AUTO_PUBLISH', 'PR_ONLY'].includes(release.decision)) throw new Error(`SEMANTIC_MODE_GATE:${release.decision}:${release.reasons.join(',')}`)
    if (requiresHumanReview && release.decision !== 'PR_ONLY' && !humanReviewPackageAllowed(release)) throw new Error(`SEMANTIC_MODE_REVIEW_GATE:${release.decision}`)

    runCommand('git', ['checkout', '-b', headRef], temp)
    runCommand('git', ['add', '-A', '--', 'knowledge/content', 'knowledge/automation/state.json', 'knowledge/automation/runtime-state.json', 'archive/web/public/knowledge', 'archive/web/public/sitemap.xml'], temp)
    const staged = runCommand('git', ['diff', '--cached', '--name-only'], temp).split(/\r?\n/).filter(Boolean)
    const checked = await checkRelease(deterministicData, { changedFiles: staged, briefIds: [result.brief.id], mode: 'AUTO_LOW_RISK', base: temp })
    if (checked.content_only?.allowed !== true) throw new Error(`SEMANTIC_CONTENT_BOUNDARY:${checked.reasons.join(',')}`)
    const submittedAt = new Date(job.submitted_at ?? job.prepared_at).toISOString()
    const date = submittedAt.replace(/\.\d{3}Z$/, '+0000')
    runCommand('git', ['config', 'user.name', 'knowledge-semantic-finalizer'], temp)
    runCommand('git', ['config', 'user.email', 'knowledge-semantic-finalizer@users.noreply.github.com'], temp)
    runCommand('git', ['commit', '-m', `knowledge: prepare ${result.brief.id} semantic package`], temp, { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date })
    const headSha = runCommand('git', ['rev-parse', 'HEAD'], temp)
    const remote = runCommand('git', ['ls-remote', '--heads', 'origin', `refs/heads/${headRef}`], temp)
    if (remote) {
      const remoteSha = remote.split(/\s+/)[0]
      if (remoteSha !== headSha) throw new Error('SEMANTIC_BRANCH_IDENTITY_CONFLICT')
    } else runCommand('git', ['push', 'origin', `HEAD:${headRef}`], temp)
    return { ...applied, requires_human_review: requiresHumanReview, release_decision: release.decision, head_sha: headSha, current_main_sha: currentMainSha }
  } finally {
    if (worktreeAdded) {
      try { runCommand('git', ['worktree', 'remove', '--force', temp], currentRoot) } catch { }
    }
    await rm(temp, { recursive: true, force: true })
  }
}

async function createOrReuseDraft(job, result, headRef, headSha) {
  const open = JSON.parse(run('gh', ['pr', 'list', '--state', 'open', '--head', `${repository.split('/')[0]}:${headRef}`, '--json', 'number,url,headRefName,headRefOid'], root) || '[]')
  const same = open.find((pr) => pr.headRefName === headRef)
  if (same) {
    if (same.headRefOid !== headSha) throw new Error('SEMANTIC_PR_HEAD_CONFLICT')
    return { number: same.number, url: same.url }
  }
  const marker = '<!-- knowledge-worker-phase-v1:PACKAGE_READY -->'
  const body = `Program-prepared Knowledge semantic package for ${result.brief.id}.\n\n${marker}\n<!-- knowledge-semantic-job-v1:${job.job_id} -->\n`
  const url = run('gh', ['pr', 'create', '--draft', '--base', 'main', '--head', headRef, '--title', `knowledge: prepare ${result.brief.id}`, '--body', body], root)
  const pr = JSON.parse(run('gh', ['pr', 'view', url, '--json', 'number,url,headRefOid'], root))
  if (pr.headRefOid !== headSha) throw new Error('SEMANTIC_PR_HEAD_CHANGED_AFTER_CREATE')
  return { number: pr.number, url: pr.url }
}

async function reconcileOpenJobs({ requestRpc = rpc, shell = run, currentRoot = root, mainSha = null, verifyPinsFn = verifyPins } = {}) {
  const currentMainSha = mainSha ?? shell('git', ['rev-parse', 'origin/main'], currentRoot)
  const jobs = await requestRpc('archive_knowledge_semantic_job_list_reconcile_v2', {})
  const outcomes = []
  for (const job of jobs ?? []) {
    if (job.status === 'HUMAN_REVIEW') continue
    if (!Number.isInteger(job.final_pr_number)) {
      const outcome = { status: 'BLOCKED', code: 'PR_REFERENCE_MISSING' }
      const update = await updateJob(requestRpc, job.job_id, job.status, outcome.status, { blockerCode: outcome.code, blockerStage: 'PR_RECONCILE' })
      outcomes.push({ job_id: job.job_id, ...outcome, update })
      continue
    }
    const pr = JSON.parse(shell('gh', ['api', `repos/${repository}/pulls/${job.final_pr_number}`], currentRoot))
    let outcome = reconcilePullRequest(job, pr, currentMainSha)
    if (outcome.status !== 'BLOCKED') {
      try {
        if (job.result_digest_verified !== true) throw new Error('SEMANTIC_RESULT_IDENTITY_CHANGED')
        validateSemanticResult(job, job.semantic_result)
        await verifyPinsFn(job, currentRoot)
        if (pr.state === 'open') {
          const existing = shell('git', ['ls-tree', '--name-only', currentMainSha, '--', `knowledge/content/briefs/${job.semantic_result.brief.id}.json`], currentRoot)
          if (existing) throw new Error('SEMANTIC_TARGET_BRIEF_ALREADY_EXISTS')
        }
      } catch (error) {
        outcome = { status: 'BLOCKED', code: error.message.split(':')[0] }
      }
    }
    if (outcome.status === 'BLOCKED' && pr.state === 'open') {
      shell('gh', ['pr', 'close', String(job.final_pr_number), '--comment', `C3 finalizer closed this PR because ${outcome.code}. A new exact-head review is required.`], currentRoot)
    }
    if (outcome.status === 'PR_OPEN') {
      const checks = JSON.parse(shell('gh', ['api', `repos/${repository}/commits/${pr.head.sha}/check-runs?per_page=100`], currentRoot)).check_runs ?? []
      const assessment = assessPublicationChecks(checks)
      outcome = { ...outcome, ...assessment }
      if ((job.blocker_code ?? null) !== (assessment.code ?? null) || (job.blocker_stage ?? null) !== (assessment.code ? 'PR_CI_RECHECK_REQUIRED' : null)) {
        await updateJob(requestRpc, job.job_id, job.status, job.status, { blockerCode: assessment.code ?? null, blockerStage: assessment.code ? 'PR_CI_RECHECK_REQUIRED' : null })
      }
    }
    if (outcome.status !== job.status || outcome.registered_head_sha) await updateJob(requestRpc, job.job_id, job.status, outcome.status, { blockerCode: outcome.code ?? null, blockerStage: outcome.code ? 'PR_RECONCILE' : null, mergeSha: outcome.mergeSha ?? null, headSha: outcome.registered_head_sha ?? null })
    outcomes.push({ job_id: job.job_id, ...outcome })
  }
  return outcomes
}

export function assessPublicationChecks(checks) {
  // GitHub returns newest runs first. An old failed attempt is not the current check.
  const latest = [...new Map([...checks].reverse().map((check) => [check.name, check])).values()]
  const failed = latest.filter((check) => check.status === 'completed' && ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(check.conclusion))
  if (failed.length) return { code: 'PR_CI_FAILED', recheck_required: true, failed_checks: failed.map((check) => check.name).sort() }
  return { recheck_required: false, checks_pending: latest.length === 0 || latest.some((check) => check.status !== 'completed') }
}

export async function runSemanticFinalizer({ requestRpc = rpc, shell = run, packageSemantic = runPackage, createDraft = createOrReuseDraft, enqueueReviewEntry = enqueueReview, verifyPinsFn = verifyPins, currentRoot = root, mainSha = null } = {}) {
  const currentMainSha = mainSha ?? shell('git', ['rev-parse', 'origin/main'], currentRoot)
  const job = await requestRpc('archive_knowledge_semantic_job_claim_finalizer', {})
  if (job.status === 'NO_SUBMITTED_JOB') return { status: 'RECONCILED', jobs: await reconcileOpenJobs({ requestRpc, shell, currentRoot, mainSha: currentMainSha, verifyPinsFn }) }
  try {
    const result = job.semantic_result
    const action = finalizerAction(job, result)
    if (action.action === 'HOLD') {
      const updated = await updateJob(requestRpc, job.job_id, 'FINALIZING', 'HOLD', { blockerCode: result.code, blockerStage: 'SEMANTIC' })
      return { status: 'HOLD', job_id: job.job_id, update: updated }
    }
    const { context } = await verifyPinsFn(job, currentRoot)
    if (context.target.brief_id !== result.brief.id) throw new Error('SEMANTIC_TARGET_BINDING_MISMATCH')
    const headRef = semanticBranchRef(job.job_id)
    const packageResult = await packageSemantic(job, result, { currentMainSha, headRef, requestRpc })
    const pr = await createDraft(job, result, headRef, packageResult.head_sha)
    const requiresHumanReview = result.decision === 'HUMAN_REVIEW' || packageResult.requires_human_review === true

    if (requiresHumanReview) {
      const payload = buildReviewQueuePayload({
        brief: packageResult.staged_brief ?? result.brief,
        result: { decision: 'HUMAN_REVIEW_REQUIRED', reasons: [result.code ?? 'AUTO_EVIDENCE_REQUIRES_HUMAN_REVIEW'] },
        headSha: packageResult.head_sha,
        prNumber: pr.number,
        headRef,
      })
      await enqueueReviewEntry(payload, { projectUrl: process.env.ARCHIVE_SUPABASE_URL, serviceRoleKey: process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY })
    }
    const nextStatus = requiresHumanReview ? 'HUMAN_REVIEW' : 'PR_OPEN'
    const updated = await updateJob(requestRpc, job.job_id, 'FINALIZING', nextStatus, { prNumber: pr.number, headRef, headSha: packageResult.head_sha })
    return { status: nextStatus, job_id: job.job_id, pr_number: pr.number, head_sha: packageResult.head_sha, release_decision: packageResult.release_decision, update: updated }
  } catch (error) {
    const code = error.message.split(':')[0].slice(0, 120)
    const exhausted = Number(job.finalizer_attempt_count ?? 0) >= 3
    const status = error.retryable && !exhausted ? 'FINALIZING' : 'BLOCKED'
    const updated = await updateJob(requestRpc, job.job_id, 'FINALIZING', status, { blockerCode: code, blockerStage: error.retryable ? 'FINALIZER_TRANSIENT' : 'FINALIZER' })
    return { status, job_id: job.job_id, blocker_code: code,
      ...(code === 'KNOWLEDGE_CONTRACT' ? { blocker_detail: error.message.slice(0, 500) } : {}), update: updated }
  }
}

async function main() {
  const result = await runSemanticFinalizer()
  console.log(json(result))
  if (result.status === 'BLOCKED') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
