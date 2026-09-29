import { createHash } from 'node:crypto'

const fail = (condition, message) => { if (!condition) throw new Error(`KNOWLEDGE_WORKER_RUNTIME: ${message}`) }
const hoursBetween = (older, newer) => (new Date(newer).valueOf() - new Date(older).valueOf()) / 3600000
const safeResult = new Set(['HOLD', 'HUMAN_REVIEW', 'NO_CANDIDATE', 'PR_CREATED', 'PROCESSED'])
const failedConclusions = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale'])
const okayConclusions = new Set(['success', 'skipped', 'neutral'])

export const RUN_RESULT_CODES = Object.freeze([
  'NOOP',
  'FRESH_READY',
  'BACKFILL_READY',
  'RESUME_PR',
  'WAITING_PR',
  'STALLED_PR',
  'BLOCKED_PR',
  'BLOCKED_CONTRACT',
  'PROVIDER_NOT_ACTIVE',
  'HOLD_RECORDED',
  'HUMAN_REVIEW_REQUIRED',
  'PR_CREATED',
  'PUBLICATION_INITIATED',
])

export function validateRuntimeState(state) {
  fail(state?.version === 1, 'runtime state version')
  const backfill = state.backfill
  fail(backfill && typeof backfill === 'object', 'backfill state')
  for (const field of ['last_attempted_at', 'last_work_key', 'last_result']) {
    fail(backfill[field] === null || typeof backfill[field] === 'string', `backfill ${field}`)
  }
  if (backfill.last_attempted_at !== null) fail(!Number.isNaN(Date.parse(backfill.last_attempted_at)), 'backfill last_attempted_at')
  if (backfill.last_result !== null) fail(safeResult.has(backfill.last_result), 'backfill last_result')
  fail(Array.isArray(backfill.reviewed_items), 'backfill reviewed_items')
  const keys = new Set()
  for (const item of backfill.reviewed_items) {
    fail(item && typeof item.work_key === 'string' && item.work_key.length > 0, 'reviewed work_key')
    fail(!keys.has(item.work_key), `duplicate reviewed work_key ${item.work_key}`)
    keys.add(item.work_key)
    fail(safeResult.has(item.status), `reviewed status ${item.work_key}`)
    fail(typeof item.processed_at === 'string' && !Number.isNaN(Date.parse(item.processed_at)), `reviewed time ${item.work_key}`)
  }
  return true
}

export function deterministicFreshBranch(policy, source) {
  fail(source?.source_manifest_ref && /^[a-f0-9]{64}$/.test(source.source_manifest_sha256 ?? ''), 'fresh source identity')
  const key = createHash('sha256').update(`${source.source_manifest_ref}@${source.source_manifest_sha256}`).digest('hex').slice(0, 12)
  return `${policy.runtime.worker_pr_branch_prefix}fresh-${key}`
}

export function deterministicBackfillBranch(policy, workKey) {
  fail(typeof workKey === 'string' && workKey.length > 0, 'backfill work key')
  const key = createHash('sha256').update(workKey).digest('hex').slice(0, 12)
  return `${policy.runtime.worker_pr_branch_prefix}backfill-${key}`
}

export function deterministicStateBranch(policy, workKey) {
  fail(typeof workKey === 'string' && workKey.length > 0, 'state work key')
  const key = createHash('sha256').update(workKey).digest('hex').slice(0, 12)
  return `${policy.runtime.state_pr_branch_prefix}${key}`
}

export function isWorkerPr(policy, pr) {
  return Boolean(pr?.head_ref?.startsWith(policy.runtime.worker_pr_branch_prefix)
    || pr?.head?.ref?.startsWith(policy.runtime.worker_pr_branch_prefix))
}

function labelNames(pr) {
  return (pr?.labels ?? []).map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean)
}

export function classifyWorkerPr({ policy, pr, checks = [], now }) {
  fail(pr && (pr.head_sha || pr.head?.sha) && pr.updated_at, 'open PR identity')
  const ageHours = hoursBetween(pr.updated_at, now)
  const active = checks.some((check) => ['queued', 'in_progress', 'requested', 'waiting', 'pending'].includes(check.status))
  if (active) return { result: 'WAITING_PR', pr_number: pr.number, head_sha: pr.head_sha ?? pr.head.sha, age_hours: ageHours }

  const failed = checks.filter((check) => check.status === 'completed' && failedConclusions.has(check.conclusion))
  if (failed.length) return {
    result: 'BLOCKED_PR', pr_number: pr.number, head_sha: pr.head_sha ?? pr.head.sha,
    failed_checks: failed.map((check) => check.name ?? check.id), age_hours: ageHours,
  }

  const labels = labelNames(pr)
  const publicationStarted = labels.includes(policy.runtime.publication_label)
  const allComplete = checks.length > 0 && checks.every((check) => check.status === 'completed' && okayConclusions.has(check.conclusion))
  if (publicationStarted) {
    return { result: ageHours >= policy.runtime.stalled_after_hours ? 'STALLED_PR' : 'WAITING_PR',
      pr_number: pr.number, head_sha: pr.head_sha ?? pr.head.sha, age_hours: ageHours, publication_started: true }
  }
  if (allComplete) return { result: 'RESUME_PR', pr_number: pr.number, head_sha: pr.head_sha ?? pr.head.sha, age_hours: ageHours }
  return { result: ageHours >= policy.runtime.stalled_after_hours ? 'STALLED_PR' : 'WAITING_PR',
    pr_number: pr.number, head_sha: pr.head_sha ?? pr.head.sha, age_hours: ageHours }
}

function localHour(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now))
  return Number(parts.find((part) => part.type === 'hour')?.value)
}

export function backfillDue({ policy, runtimeState, now }) {
  validateRuntimeState(runtimeState)
  const backfill = policy.dispatcher.backfill
  if (!backfill.enabled) return false
  const previous = runtimeState.backfill.last_attempted_at
  if (!previous) return localHour(now, policy.dispatcher.timezone) === backfill.preferred_hour_local
  return hoursBetween(previous, now) >= backfill.cadence_hours
}

export function planWorkerPreflight({ policy, providerConfig, runtimeState, scannerResult, openPrs = [], checksByPr = {}, now }) {
  validateRuntimeState(runtimeState)
  fail(providerConfig?.active_provider, 'active provider')
  if (providerConfig.active_provider !== policy.runtime.scheduler_provider) {
    return { result: 'PROVIDER_NOT_ACTIVE', active_provider: providerConfig.active_provider }
  }

  const workerPrs = openPrs.filter((pr) => isWorkerPr(policy, pr))
  if (workerPrs.length > 1) return { result: 'BLOCKED_CONTRACT', reason: 'MULTIPLE_OPEN_WORKER_PRS', pr_numbers: workerPrs.map((pr) => pr.number) }
  if (workerPrs.length === 1) {
    const pr = workerPrs[0]
    return classifyWorkerPr({ policy, pr, checks: checksByPr[pr.number] ?? [], now })
  }

  const fresh = [...(scannerResult?.sources ?? [])]
    .filter((item) => ['PENDING', 'SOURCE_CHANGED_RESCAN_REQUIRED'].includes(item.status))
    .sort((a, b) => a.source_manifest_ref.localeCompare(b.source_manifest_ref))
  if (fresh.length) {
    return { result: 'FRESH_READY', source: fresh[0], branch: deterministicFreshBranch(policy, fresh[0]) }
  }
  if (backfillDue({ policy, runtimeState, now })) {
    return { result: 'BACKFILL_READY', reviewed_work_keys: runtimeState.backfill.reviewed_items.map((item) => item.work_key) }
  }
  return { result: 'NOOP' }
}

export function recordBackfillResult(state, { workKey, status, now }) {
  validateRuntimeState(state)
  fail(typeof workKey === 'string' && workKey.length > 0, 'backfill result work key')
  fail(safeResult.has(status), 'backfill result status')
  fail(typeof now === 'string' && !Number.isNaN(Date.parse(now)), 'backfill result time')
  const reviewed = state.backfill.reviewed_items.filter((item) => item.work_key !== workKey)
  reviewed.push({ work_key: workKey, status, processed_at: now })
  reviewed.sort((a, b) => a.processed_at.localeCompare(b.processed_at))
  state.backfill = {
    last_attempted_at: now,
    last_work_key: workKey,
    last_result: status,
    reviewed_items: reviewed.slice(-200),
  }
  validateRuntimeState(state)
  return state
}

export function notificationMarker(policy, { result, prNumber = 'none', headSha = 'none' }) {
  fail(RUN_RESULT_CODES.includes(result), 'notification result')
  return `<!-- ${policy.runtime.notification_marker_prefix}:${result}:${prNumber}:${headSha} -->`
}
