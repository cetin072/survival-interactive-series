import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkRelease, changedFilesFromGit } from './lib/knowledge-release.mjs'
import { applySemanticPackage, chapterHash, hashPolicyBytes, postSupabaseRpc, validateSemanticResult } from './lib/knowledge-semantic-jobs.mjs'
import { buildReviewQueuePayload, enqueueReview } from './knowledge-review-sync.mjs'
import { loadKnowledge, validateKnowledge } from './lib/knowledge-content.mjs'

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
const safeRef = (value) => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('..') && !value.includes('\\')

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
  if (pr?.head?.sha !== job.final_head_sha) return { status: 'BLOCKED', code: 'PR_HEAD_CHANGED' }
  if (pr.state === 'open' && pr.merged !== true) {
    if (pr.base?.ref !== 'main' || (currentMainSha && pr.base?.sha !== currentMainSha)) return { status: 'BLOCKED', code: 'MAIN_MOVED_REVALIDATION_REQUIRED' }
    return { status: job.result_decision === 'HUMAN_REVIEW' ? 'HUMAN_REVIEW' : 'PR_OPEN' }
  }
  if (pr.state === 'closed' && pr.merged === true && /^[a-f0-9]{40}$/.test(pr.merge_commit_sha ?? '')) {
    return { status: 'PUBLISHED', mergeSha: pr.merge_commit_sha }
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

export async function verifyPins(job, base) {
  const context = job.semantic_context ?? job.context
  if (!context?.source || !context?.target || !Array.isArray(context.source.refs) || !Array.isArray(context.source.hashes)
      || context.source.refs.length !== context.source.hashes.length) throw new Error('SEMANTIC_SOURCE_CONTEXT_INVALID')
  if (context.source.kind !== job.source_kind || context.source.ref !== job.source_ref || context.source.sha256 !== job.source_sha256) throw new Error('SEMANTIC_SOURCE_BINDING_MISMATCH')
  const [policyBytes, configBytes, editorialBytes] = await Promise.all([
    readFile(join(base, 'knowledge/automation/worker-policy.json')),
    readFile(join(base, 'knowledge/automation/config.json')),
    readFile(join(base, 'docs/KNOWLEDGE_BRIEF_EDITORIAL_SPEC_V1.md')),
  ])
  const policyHash = hashPolicyBytes(policyBytes, configBytes, editorialBytes)
  if (policyHash !== job.policy_sha256 || job.policy_pin?.sha256 !== policyHash) throw new Error('SEMANTIC_POLICY_PIN_CHANGED')
  const config = JSON.parse(configBytes.toString('utf8'))
  if (context.policy?.publication_mode !== config.publication_mode || context.policy?.auto_publish_enabled !== config.auto_publish_enabled) throw new Error('SEMANTIC_CONFIG_PIN_CHANGED')

  const readPinnedSourceBytes = async (ref) => {
    try {
      return await readFile(join(base, ref))
    } catch (cause) {
      if (cause?.code !== 'ENOENT' || !ref.startsWith('worldlines/AFTERFALL/')) throw cause
      try {
        return execFileSync('git', ['show', `origin/worldline/afterfall-rpg:${ref}`], {
          cwd: base,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch {
        throw new Error('SEMANTIC_SOURCE_UNAVAILABLE')
      }
    }
  }
  const verifyFile = async (ref, expectedHash) => {
    if (!safeRef(ref) || !/^[a-f0-9]{64}$/.test(expectedHash ?? '')) throw new Error('SEMANTIC_SOURCE_REFERENCE_INVALID')
    if (sha(await readPinnedSourceBytes(ref)) !== expectedHash) throw new Error('SEMANTIC_SOURCE_SHA_CHANGED')
  }
  if (job.source_kind === 'PUBLIC_ARCHIVE') {
    await verifyFile(job.source_ref, job.source_sha256)
    for (let index = 0; index < context.source.refs.length; index += 1) await verifyFile(context.source.refs[index], context.source.hashes[index])
  } else if (job.source_kind === 'PUBLIC_READER') {
    const chapterId = context.source.chapter_id
    if (!chapterId || context.source.chapter_sha256 !== job.source_sha256) throw new Error('SEMANTIC_READER_PIN_INVALID')
    const book = JSON.parse(await readFile(join(base, 'archive/content/stories/C03-AFTERFALL/BOOK.json'), 'utf8'))
    const chapter = book.chapters?.find((item) => item.id === chapterId)
    if (!chapter || chapter.sourceKind !== 'VERIFIED_GM_NARRATIVE' || chapterHash(chapter) !== job.source_sha256) throw new Error('SEMANTIC_SOURCE_SHA_CHANGED')
    if (job.source_ref !== `archive/content/stories/C03-AFTERFALL/BOOK.json#${chapterId}`
      || json(chapter.sourceRefs) !== json(context.source.refs) || json(chapter.sourceHashes) !== json(context.source.hashes)) throw new Error('SEMANTIC_READER_PROVENANCE_CHANGED')
    for (let index = 0; index < context.source.refs.length; index += 1) await verifyFile(context.source.refs[index], context.source.hashes[index])
  } else throw new Error('SEMANTIC_SOURCE_KIND_INVALID')
  return { context, config }
}

export async function runPackage(job, result, { currentMainSha, headRef, currentRoot = root, runCommand = run }) {
  const temp = await mkdtemp(join(tmpdir(), `knowledge-semantic-${job.job_id}-`))
  let worktreeAdded = false
  try {
    runCommand('git', ['worktree', 'add', '--detach', temp, 'origin/main'], currentRoot)
    worktreeAdded = true
    const initial = await loadKnowledge(temp)
    await validateKnowledge(initial)
    if (initial.briefs.some((brief) => brief.id === result.brief.id)) throw new Error('SEMANTIC_TARGET_BRIEF_ALREADY_EXISTS')
    const expectedBriefId = `K-${String(initial.briefs.reduce((max, brief) => Math.max(max, Number(/^K-(\d+)$/.exec(brief.id)?.[1] ?? 0)), 0) + 1).padStart(3, '0')}`
    if (result.brief.id !== expectedBriefId) throw new Error('SEMANTIC_TARGET_BRIEF_STALE')
    await verifyPins(job, temp)
    const applied = await applySemanticPackage({ root: temp, job, result, now: new Date(job.submitted_at ?? job.prepared_at).toISOString() })

    runCommand('npm', ['ci'], join(temp, 'archive/web'))
    runCommand('npm', ['run', 'knowledge:test'], join(temp, 'archive/web'))
    runCommand('npm', ['run', 'knowledge:build'], join(temp, 'archive/web'))
    runCommand('npm', ['run', 'knowledge:check'], join(temp, 'archive/web'))
    const data = await loadKnowledge(temp)
    await validateKnowledge(data)
    const changedFiles = changedFilesFromGit({ baseRef: 'origin/main', headRef: 'HEAD', cwd: temp })
    const deterministicData = { ...data, config: { ...data.config, publication_mode: 'AUTO_LOW_RISK', auto_publish_enabled: true } }
    const deterministic = await checkRelease(deterministicData, { changedFiles, briefIds: [result.brief.id], mode: 'AUTO_LOW_RISK', base: temp })
    if (result.decision === 'BRIEF_READY' && deterministic.decision !== 'AUTO_PUBLISH_ELIGIBLE') throw new Error(`SEMANTIC_RELEASE_GATE:${deterministic.decision}:${deterministic.reasons.join(',')}`)
    if (result.decision === 'HUMAN_REVIEW' && deterministic.decision !== 'HUMAN_REVIEW_REQUIRED') throw new Error(`SEMANTIC_REVIEW_GATE:${deterministic.decision}`)
    const release = await checkRelease(data, { changedFiles, briefIds: [result.brief.id], mode: data.config.publication_mode, base: temp })
    if (result.decision === 'BRIEF_READY' && !['AUTO_PUBLISH_ELIGIBLE', 'WOULD_AUTO_PUBLISH', 'PR_ONLY'].includes(release.decision)) throw new Error(`SEMANTIC_MODE_GATE:${release.decision}:${release.reasons.join(',')}`)
    if (result.decision === 'HUMAN_REVIEW' && !['HUMAN_REVIEW_REQUIRED', 'PR_ONLY'].includes(release.decision)) throw new Error(`SEMANTIC_MODE_REVIEW_GATE:${release.decision}`)

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
    return { ...applied, release_decision: release.decision, head_sha: headSha, current_main_sha: currentMainSha }
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

async function reconcileOpenJobs({ requestRpc = rpc, shell = run, currentRoot = root, mainSha = null } = {}) {
  const currentMainSha = mainSha ?? shell('git', ['rev-parse', 'origin/main'], currentRoot)
  const jobs = await requestRpc('archive_knowledge_semantic_job_list_reconcile', {})
  const outcomes = []
  for (const job of jobs ?? []) {
    if (!Number.isInteger(job.final_pr_number)) {
      const outcome = { status: 'BLOCKED', code: 'PR_REFERENCE_MISSING' }
      const update = await updateJob(requestRpc, job.job_id, job.status, outcome.status, { blockerCode: outcome.code, blockerStage: 'PR_RECONCILE' })
      outcomes.push({ job_id: job.job_id, ...outcome, update })
      continue
    }
    const pr = JSON.parse(shell('gh', ['api', `repos/${repository}/pulls/${job.final_pr_number}`], currentRoot))
    const outcome = reconcilePullRequest(job, pr, currentMainSha)
    if (outcome.status === 'BLOCKED' && pr.state === 'open') {
      shell('gh', ['pr', 'close', String(job.final_pr_number), '--comment', `C3 finalizer closed this PR because ${outcome.code}. A new exact-head review is required.`], currentRoot)
    }
    if (outcome.status !== job.status) await updateJob(requestRpc, job.job_id, job.status, outcome.status, { blockerCode: outcome.code ?? null, blockerStage: outcome.code ? 'PR_RECONCILE' : null, mergeSha: outcome.mergeSha ?? null })
    outcomes.push({ job_id: job.job_id, ...outcome })
  }
  return outcomes
}

export async function runSemanticFinalizer({ requestRpc = rpc, shell = run, packageSemantic = runPackage, createDraft = createOrReuseDraft, enqueueReviewEntry = enqueueReview, verifyPinsFn = verifyPins, currentRoot = root, mainSha = null } = {}) {
  const currentMainSha = mainSha ?? shell('git', ['rev-parse', 'origin/main'], currentRoot)
  const job = await requestRpc('archive_knowledge_semantic_job_claim_finalizer', {})
  if (job.status === 'NO_SUBMITTED_JOB') return { status: 'RECONCILED', jobs: await reconcileOpenJobs({ requestRpc, shell, currentRoot, mainSha: currentMainSha }) }
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
    const packageResult = await packageSemantic(job, result, { currentMainSha, headRef })
    const pr = await createDraft(job, result, headRef, packageResult.head_sha)

    if (result.decision === 'HUMAN_REVIEW') {
      const payload = buildReviewQueuePayload({
        brief: result.brief,
        result: { decision: 'HUMAN_REVIEW_REQUIRED', reasons: [result.code] },
        headSha: packageResult.head_sha,
        prNumber: pr.number,
        headRef,
      })
      await enqueueReviewEntry(payload, { projectUrl: process.env.ARCHIVE_SUPABASE_URL, serviceRoleKey: process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY })
    }
    const nextStatus = result.decision === 'HUMAN_REVIEW' ? 'HUMAN_REVIEW' : 'PR_OPEN'
    const updated = await updateJob(requestRpc, job.job_id, 'FINALIZING', nextStatus, { prNumber: pr.number, headRef, headSha: packageResult.head_sha })
    return { status: nextStatus, job_id: job.job_id, pr_number: pr.number, head_sha: packageResult.head_sha, release_decision: packageResult.release_decision, update: updated }
  } catch (error) {
    const code = error.message.split(':')[0].slice(0, 120)
    const exhausted = Number(job.finalizer_attempt_count ?? 0) >= 3
    const status = error.retryable && !exhausted ? 'FINALIZING' : 'BLOCKED'
    const updated = await updateJob(requestRpc, job.job_id, 'FINALIZING', status, { blockerCode: code, blockerStage: error.retryable ? 'FINALIZER_TRANSIENT' : 'FINALIZER' })
    return { status, job_id: job.job_id, blocker_code: code, update: updated }
  }
}

async function main() {
  const result = await runSemanticFinalizer()
  console.log(json(result))
  if (result.status === 'BLOCKED') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
