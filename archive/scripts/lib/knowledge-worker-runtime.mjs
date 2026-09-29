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
  'RESUME_BRANCH',
  'SALVAGE_BRANCH',
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

function headRef(pr) { return pr?.head_ref ?? pr?.head?.ref ?? null }

export function isWorkerPr(policy, pr) {
  return Boolean(headRef(pr)?.startsWith(policy.runtime.worker_pr_branch_prefix))
}

export function isStateWorkerPr(policy, pr) {
  return Boolean(headRef(pr)?.startsWith(policy.runtime.state_pr_branch_prefix))
}

export function workerPhaseMarker(policy, phase) {
  fail(policy.runtime.pr_phases.includes(phase), 'worker PR phase')
  return `<!-- ${policy.runtime.pr_phase_marker_prefix}:${phase} -->`
}

export function workerPhase(policy, pr) {
  const body = pr?.body ?? ''
  for (const phase of policy.runtime.pr_phases) {
    if (body.includes(workerPhaseMarker(policy, phase))) return phase
  }
  return null
}

function labelNames(pr) {
  return (pr?.labels ?? []).map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean)
}

export function classifyWorkerPr({ policy, pr, checks = [], now }) {
  fail(pr && (pr.head_sha || pr.head?.sha) && pr.updated_at, 'open PR identity')
  const ageHours = hoursBetween(pr.updated_at, now)
  const headSha = pr.head_sha ?? pr.head.sha
  const active = checks.some((check) => ['queued', 'in_progress', 'requested', 'waiting', 'pending'].includes(check.status))
  const failed = checks.filter((check) => check.status === 'completed' && failedConclusions.has(check.conclusion))
  const allComplete = checks.length > 0 && checks.every((check) => check.status === 'completed' && okayConclusions.has(check.conclusion))

  if (isStateWorkerPr(policy, pr)) {
    if (active) return { result: 'WAITING_PR', pr_number: pr.number, head_sha: headSha, age_hours: ageHours, state_only: true }
    if (failed.length) return { result: 'BLOCKED_PR', pr_number: pr.number, head_sha: headSha,
      failed_checks: failed.map((check) => check.name ?? check.id), age_hours: ageHours, state_only: true }
    if (allComplete) return { result: 'WAITING_PR', pr_number: pr.number, head_sha: headSha, age_hours: ageHours, state_only: true, awaiting_auto_merge: true }
    return { result: ageHours >= policy.runtime.stalled_after_hours ? 'STALLED_PR' : 'WAITING_PR',
      pr_number: pr.number, head_sha: headSha, age_hours: ageHours, state_only: true }
  }

  const phase = workerPhase(policy, pr)
  if (!phase) return { result: 'BLOCKED_CONTRACT', reason: 'MISSING_WORKER_PR_PHASE', pr_number: pr.number, head_sha: headSha }

  const labels = labelNames(pr)
  const publicationStarted = labels.includes(policy.runtime.publication_label)
  if (phase === 'PUBLICATION_HANDOFF' && !publicationStarted) {
    return { result: 'HUMAN_REVIEW_REQUIRED', reason: 'PUBLICATION_LABEL_REMOVED_AFTER_HANDOFF',
      pr_number: pr.number, head_sha: headSha, phase }
  }
  if (publicationStarted) {
    return { result: ageHours >= policy.runtime.stalled_after_hours ? 'STALLED_PR' : 'WAITING_PR',
      pr_number: pr.number, head_sha: headSha, age_hours: ageHours, publication_started: true, phase }
  }

  if (active) return { result: 'WAITING_PR', pr_number: pr.number, head_sha: headSha, age_hours: ageHours, phase }
  if (failed.length) return { result: 'BLOCKED_PR', pr_number: pr.number, head_sha: headSha,
    failed_checks: failed.map((check) => check.name ?? check.id), age_hours: ageHours, phase }
  if (allComplete) return { result: 'RESUME_PR', pr_number: pr.number, head_sha: headSha, age_hours: ageHours,
    phase, draft: pr.draft === true, action: pr.draft === true ? 'MARK_READY_THEN_PUBLICATION_HANDOFF' : 'PUBLICATION_HANDOFF' }
  return { result: ageHours >= policy.runtime.stalled_after_hours ? 'STALLED_PR' : 'WAITING_PR',
    pr_number: pr.number, head_sha: headSha, age_hours: ageHours, phase }
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

export function planWorkerPreflight({
  policy, providerConfig, runtimeState, scannerResult, pullRequests, checksByPr, branchInventory, now,
}) {
  validateRuntimeState(runtimeState)
  if (!Array.isArray(pullRequests)) return { result: 'BLOCKED_CONTRACT', reason: 'PR_INVENTORY_REQUIRED' }
  if (!checksByPr || typeof checksByPr !== 'object' || Array.isArray(checksByPr)) return { result: 'BLOCKED_CONTRACT', reason: 'CHECK_INVENTORY_REQUIRED' }
  if (!Array.isArray(branchInventory)) return { result: 'BLOCKED_CONTRACT', reason: 'BRANCH_INVENTORY_REQUIRED' }
  if (!scannerResult || typeof scannerResult !== 'object' || !Array.isArray(scannerResult.sources ?? [])) {
    return { result: 'BLOCKED_CONTRACT', reason: 'SCANNER_RESULT_REQUIRED' }
  }
  fail(providerConfig?.active_provider, 'active provider')
  if (providerConfig.active_provider !== policy.runtime.scheduler_provider) {
    return { result: 'PROVIDER_NOT_ACTIVE', active_provider: providerConfig.active_provider }
  }

  const openWorkerPrs = pullRequests.filter((pr) => pr.state === 'open' && isWorkerPr(policy, pr))
  if (openWorkerPrs.length > 1) return { result: 'BLOCKED_CONTRACT', reason: 'MULTIPLE_OPEN_WORKER_PRS', pr_numbers: openWorkerPrs.map((pr) => pr.number) }
  if (openWorkerPrs.length === 1) {
    const pr = openWorkerPrs[0]
    const ref = headRef(pr)
    const branchInfo = branchInventory.find((item) => item.name === ref)
    if (!branchInfo || !Number.isInteger(branchInfo.ahead_by) || !Number.isInteger(branchInfo.behind_by)) {
      return { result: 'BLOCKED_CONTRACT', reason: 'OPEN_PR_BRANCH_INVENTORY_REQUIRED', pr_number: pr.number, branch: ref }
    }
    const classified = classifyWorkerPr({ policy, pr, checks: checksByPr[pr.number] ?? [], now })
    if (classified.result === 'RESUME_PR' && branchInfo.behind_by > 0) {
      return { ...classified, action: 'SYNC_CURRENT_MAIN_THEN_RECHECK', behind_by: branchInfo.behind_by, ahead_by: branchInfo.ahead_by }
    }
    return classified
  }

  const prHeads = new Map()
  for (const pr of pullRequests) {
    const ref = headRef(pr)
    if (!ref) continue
    if (!prHeads.has(ref)) prHeads.set(ref, [])
    prHeads.get(ref).push(pr)
  }

  const workerBranches = branchInventory.filter((item) => typeof item?.name === 'string' && item.name.startsWith(policy.runtime.worker_pr_branch_prefix))
  for (const item of workerBranches) {
    if (!Number.isInteger(item.ahead_by) || !Number.isInteger(item.behind_by) || typeof item.head_sha !== 'string') {
      return { result: 'BLOCKED_CONTRACT', reason: 'INVALID_BRANCH_INVENTORY', branch: item?.name ?? null }
    }
  }

  const orphanBranches = workerBranches.filter((item) => !(prHeads.get(item.name)?.length))
  if (orphanBranches.length > 1) {
    return { result: 'BLOCKED_CONTRACT', reason: 'MULTIPLE_ORPHAN_WORKER_BRANCHES', branches: orphanBranches.map((item) => item.name) }
  }
  if (orphanBranches.length === 1) {
    const item = orphanBranches[0]
    const stale = item.behind_by > policy.runtime.salvage_when_behind_commits
    return {
      result: stale ? 'SALVAGE_BRANCH' : 'RESUME_BRANCH',
      branch: item.name,
      head_sha: item.head_sha,
      ahead_by: item.ahead_by,
      behind_by: item.behind_by,
      action: stale ? 'REBUILD_SAME_BRANCH_ON_CURRENT_MAIN_THEN_OPEN_DRAFT_PR' : 'VALIDATE_PACKAGE_THEN_OPEN_DRAFT_PR',
    }
  }

  const fresh = [...scannerResult.sources]
    .filter((item) => ['PENDING', 'SOURCE_CHANGED_RESCAN_REQUIRED'].includes(item.status))
    .sort((a, b) => a.source_manifest_ref.localeCompare(b.source_manifest_ref))
  if (fresh.length) {
    const expectedBranch = deterministicFreshBranch(policy, fresh[0])
    const existing = branchInventory.find((item) => item.name === expectedBranch)
    const history = prHeads.get(expectedBranch) ?? []
    if (existing && history.some((pr) => pr.state === 'closed' && !pr.merged_at)) {
      return { result: 'BLOCKED_CONTRACT', reason: 'CLOSED_UNMERGED_WORKER_BRANCH', branch: expectedBranch }
    }
    if (existing && history.some((pr) => pr.merged_at)) {
      return { result: 'BLOCKED_CONTRACT', reason: 'MERGED_BRANCH_BUT_SOURCE_PENDING', branch: expectedBranch }
    }
    if (existing) {
      const stale = existing.behind_by > policy.runtime.salvage_when_behind_commits
      return { result: stale ? 'SALVAGE_BRANCH' : 'RESUME_BRANCH', branch: expectedBranch,
        head_sha: existing.head_sha, ahead_by: existing.ahead_by, behind_by: existing.behind_by,
        action: stale ? 'REBUILD_SAME_BRANCH_ON_CURRENT_MAIN_THEN_OPEN_DRAFT_PR' : 'VALIDATE_PACKAGE_THEN_OPEN_DRAFT_PR' }
    }
    return { result: 'FRESH_READY', source: fresh[0], branch: expectedBranch }
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
