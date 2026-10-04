import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadKnowledge } from './lib/knowledge-content.mjs'
import { publicKnowledgeInventory, scanKnowledge } from './lib/knowledge-scan.mjs'
import { backfillDue, validateRuntimeState } from './lib/knowledge-worker-runtime.mjs'
import {
  buildSemanticContext, chapterHash, hashPolicyBytes, makeWorkKey, nextBriefId,
  postSupabaseRpc, reservedCandidateId, selectBackfillChapter,
} from './lib/knowledge-semantic-jobs.mjs'

export const repository = 'cetin072/survival-interactive-series'
const root = resolve(import.meta.dirname, '../..')
const json = (value) => JSON.stringify(value)
const sha = (value) => createHash('sha256').update(value).digest('hex')

export function planSemanticPreparation({ activeJobs, handledJobs = [], scanner, backfillIsDue, backfillChoice, legacyBlocker }) {
  if (Array.isArray(activeJobs) && activeJobs.length) return { decision: 'NOOP', code: 'ACTIVE_SEMANTIC_JOB_EXISTS' }
  if (legacyBlocker) return { decision: 'BLOCKED', code: legacyBlocker }
  const changed = (scanner?.sources ?? []).find((source) => source.status === 'SOURCE_CHANGED_RESCAN_REQUIRED')
  if (changed) return { decision: 'BLOCKED', code: 'SOURCE_CHANGED_RESCAN_REQUIRED', source: changed }
  const handled = new Set(handledJobs.filter((job) => job.job_type === 'FRESH_BRIEF' && job.source_kind === 'PUBLIC_ARCHIVE')
    .map((job) => `${job.source_ref}:${job.source_sha256}`))
  const fresh = [...(scanner?.sources ?? [])]
    .filter((source) => source.status === 'PENDING' && !handled.has(`${source.source_manifest_ref}:${source.source_manifest_sha256}`))
    .sort((a, b) => a.source_manifest_ref.localeCompare(b.source_manifest_ref))[0]
  if (fresh) return { decision: 'FRESH', source: fresh }
  if (!backfillIsDue) return { decision: 'NOOP', code: 'NO_FRESH_BACKFILL_NOT_DUE' }
  if (!backfillChoice) return { decision: 'NOOP', code: 'NO_UNREVIEWED_BACKFILL_SOURCE' }
  return { decision: 'BACKFILL', source: backfillChoice }
}

function ghJson(args) {
  return JSON.parse(execFileSync('gh', args, { cwd: root, encoding: 'utf8' }))
}

export function detectLegacyWorkerBlocker({ openPrs, branchRows, baseRef = 'origin/main', cwd = root }) {
  const prefix = 'knowledge/worker/'
  const semanticPrefix = 'knowledge/worker/semantic-'
  const isLegacyWorkerRef = (name) => typeof name === 'string' && name.startsWith(prefix) && !name.startsWith(semanticPrefix)
  const open = openPrs.filter((pr) => pr.state === 'OPEN' && isLegacyWorkerRef(pr.headRefName ?? ''))
  if (open.length) return `LEGACY_WORKER_PR_OPEN:${open[0].number}`
  for (const branch of branchRows) {
    if (!isLegacyWorkerRef(branch.name)) continue
    const ref = `refs/remotes/origin/${branch.name}`
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', ref, baseRef], { cwd, stdio: 'ignore' })
    } catch {
      const changed = execFileSync('git', ['diff', '--name-only', `${baseRef}...${ref}`], { cwd, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
      if (!changed.length) continue
      try {
        execFileSync('git', ['diff', '--quiet', baseRef, ref, '--', ...changed], { cwd, stdio: 'ignore' })
      } catch (difference) {
        if (difference.status === 1) return `LEGACY_WORKER_BRANCH_UNMERGED:${branch.name}`
        throw difference
      }
    }
  }
  return null
}

async function supabase(name, args) {
  return postSupabaseRpc({
    projectUrl: process.env.ARCHIVE_SUPABASE_URL,
    serviceRoleKey: process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY,
    name, args,
  })
}

async function recordPrep(status, stage, fields = {}) {
  return supabase('archive_knowledge_semantic_job_record_prep', {
    p_status: status,
    p_stage: stage,
    p_blocker_code: fields.blockerCode ?? null,
    p_source_ref: fields.sourceRef ?? null,
    p_source_sha256: fields.sourceSha256 ?? null,
    p_main_sha: fields.mainSha ?? null,
    p_backfill_work_key: fields.backfillWorkKey ?? null,
  })
}

export async function legacyWorkerBlocker() {
  const openPrs = ghJson(['pr', 'list', '--state', 'open', '--json', 'number,state,headRefName'])
  const names = execFileSync('git', ['ls-remote', '--heads', 'origin', 'knowledge/worker/*'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean).map((line) => ({ sha: line.split(/\s+/)[0], name: line.split(/refs\/heads\//)[1] }))
  for (const branch of names) {
    if (!branch.name || !/^[A-Za-z0-9._/-]+$/.test(branch.name)) continue
    const localRef = `refs/remotes/origin/${branch.name}`
    execFileSync('git', ['fetch', '--quiet', 'origin', `+refs/heads/${branch.name}:${localRef}`], { cwd: root, stdio: 'ignore' })
  }
  return detectLegacyWorkerBlocker({ openPrs, branchRows: names })
}

export function policyPin(policyBytes, configBytes, editorialBytes, policy, config) {
  const digest = hashPolicyBytes(policyBytes, configBytes, editorialBytes)
  return {
    version: 'knowledge-c3-policy-v1',
    sha256: digest,
    publication_mode: config.publication_mode,
    auto_publish_enabled: config.auto_publish_enabled,
    editorial_spec_ref: policy.editorial_spec_ref,
    minimum_authoritative_sources: policy.research_policy.minimum_authoritative_sources_per_brief,
  }
}

async function publicReaderBackfillChoice(data, runtimeState) {
  const bookPath = join(root, 'archive/content/stories/C03-AFTERFALL/BOOK.json')
  const bookBytes = await readFile(bookPath)
  const book = JSON.parse(bookBytes.toString('utf8'))
  const choice = selectBackfillChapter({ book, candidates: data.candidates, reviewedWorkKeys: runtimeState.backfill.reviewed_items.map((item) => item.work_key) })
  if (!choice) return null
  const chapter = choice.chapter
  return {
    jobType: 'BACKFILL_BRIEF',
    sourceKind: 'PUBLIC_READER',
    sourceRef: choice.sourceRef,
    sourceSha256: choice.chapterSha,
    workKey: choice.workKey,
    chapterId: chapter.id,
    chapterSha256: choice.chapterSha,
    readerBookSha256: sha(bookBytes),
    refs: chapter.sourceRefs,
    hashes: chapter.sourceHashes,
    excerpt: chapter.body,
    existingCandidate: choice.existingCandidate,
  }
}

async function freshChoice(source) {
  const manifestBytes = await readFile(join(root, source.source_manifest_ref))
  if (sha(manifestBytes) !== source.source_manifest_sha256) throw new Error('PREP_FRESH_SOURCE_HASH_CHANGED')
  const excerpts = []
  for (const part of source.parts) {
    const bytes = await readFile(join(root, part.ref))
    if (sha(bytes) !== part.sha256) throw new Error('PREP_ARCHIVE_PART_HASH_CHANGED')
    // The inventory contract has already approved this PUBLIC_ARCHIVE source.
    // Share GM narrative blocks only; player blocks and repository metadata stay out of worker context.
    const { extractPublicGmText } = await import('./lib/knowledge-semantic-jobs.mjs')
    excerpts.push(extractPublicGmText(bytes.toString('utf8'), 2200))
  }
  return {
    jobType: 'FRESH_BRIEF', sourceKind: 'PUBLIC_ARCHIVE',
    sourceRef: source.source_manifest_ref, sourceSha256: source.source_manifest_sha256,
    workKey: makeWorkKey({ sourceKind: 'PUBLIC_ARCHIVE', sourceRef: source.source_manifest_ref, sourceSha256: source.source_manifest_sha256 }),
    refs: source.parts.map((part) => part.ref), hashes: source.parts.map((part) => part.sha256),
    excerpt: excerpts.join('\n\n').slice(0, 5000),
  }
}

export async function createJob({ choice, policy, policyPin, mainSha, data, initialStatus = 'PREPARED', blockerCode = null }) {
  const briefId = nextBriefId(data.briefs)
  const candidateId = choice.existingCandidate?.id ?? reservedCandidateId(choice.workKey)
  const target = { brief_id: briefId, candidate_id: candidateId }
  const source = {
    kind: choice.sourceKind, ref: choice.sourceRef, sha256: choice.sourceSha256,
    ...(choice.chapterId ? { chapter_id: choice.chapterId, chapter_sha256: choice.chapterSha256, reader_book_sha256: choice.readerBookSha256 } : {}),
    refs: choice.refs ?? [], hashes: choice.hashes ?? [],
  }
  const context = buildSemanticContext({
    jobType: choice.jobType,
    source,
    target,
    existingKnowledge: data,
    policy,
    excerpt: choice.excerpt,
  })
  const args = {
    p_job_type: choice.jobType,
    p_source_kind: choice.sourceKind,
    p_source_ref: choice.sourceRef,
    p_source_sha256: choice.sourceSha256,
    p_work_key: choice.workKey,
    p_policy_version: policyPin.version,
    p_policy_sha256: policyPin.sha256,
    p_policy_pin: policyPin,
    p_main_sha: mainSha,
    p_semantic_context: context,
    p_initial_status: initialStatus,
    p_blocker_code: blockerCode,
  }
  const result = await supabase('archive_knowledge_semantic_job_prepare', args)
  return { result, choice, context }
}

export async function runSemanticPrepare({ now = new Date() } = {}) {
  const mainSha = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: root, encoding: 'utf8' }).trim()
  const [policyBytes, configBytes, editorialBytes, policy] = await Promise.all([
    readFile(join(root, 'knowledge/automation/worker-policy.json')),
    readFile(join(root, 'knowledge/automation/config.json')),
    readFile(join(root, 'docs/KNOWLEDGE_BRIEF_EDITORIAL_SPEC_V1.md')),
    readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8').then(JSON.parse),
  ])
  const config = JSON.parse(configBytes.toString('utf8'))
  const pin = policyPin(policyBytes, configBytes, editorialBytes, policy, config)
  let inventory
  try {
    inventory = await publicKnowledgeInventory(root)
  } catch (error) {
    const blockerCode = 'PUBLIC_ARCHIVE_INVENTORY_INVALID'
    await recordPrep('BLOCKED', 'SOURCE_INVENTORY', { blockerCode, mainSha })
    return { status: 'BLOCKED', reason: blockerCode, main_sha: mainSha }
  }
  const [activeJobs, handledJobs, prepState, data] = await Promise.all([
    supabase('archive_knowledge_semantic_job_list_active', {}),
    supabase('archive_knowledge_semantic_job_list_handled', {}),
    supabase('archive_knowledge_semantic_job_prep_state', {}),
    loadKnowledge(root),
  ])
  const scanner = scanKnowledge(inventory, JSON.parse(await readFile(join(root, 'knowledge/automation/state.json'), 'utf8')))
  let runtimeState = JSON.parse(await readFile(join(root, 'knowledge/automation/runtime-state.json'), 'utf8'))
  validateRuntimeState(runtimeState)
  const dbAttempted = prepState.backfill_last_attempted_at
  if (dbAttempted && (!runtimeState.backfill.last_attempted_at || Date.parse(dbAttempted) > Date.parse(runtimeState.backfill.last_attempted_at))) {
    runtimeState = { ...runtimeState, backfill: { ...runtimeState.backfill, last_attempted_at: dbAttempted } }
  }
  const blocker = await legacyWorkerBlocker()
  const recent = Number.isFinite(Date.parse(prepState.backfill_last_attempted_at ?? ''))
    ? (now.valueOf() - Date.parse(prepState.backfill_last_attempted_at)) / 3600000 : Infinity
  const backfillIsDue = backfillDue({ policy, runtimeState, now: now.toISOString() }) && recent >= policy.dispatcher.backfill.cadence_hours
  const handledBackfillWorkKeys = (handledJobs ?? []).filter((job) => job.job_type === 'BACKFILL_BRIEF' && job.source_kind === 'PUBLIC_READER').map((job) => job.work_key)
  const backfillChoice = backfillIsDue ? await publicReaderBackfillChoice(data, {
    ...runtimeState,
    backfill: { ...runtimeState.backfill, reviewed_items: [...runtimeState.backfill.reviewed_items, ...handledBackfillWorkKeys.map((work_key) => ({ work_key }))] },
  }) : null
  const plan = planSemanticPreparation({ activeJobs, handledJobs, scanner, backfillIsDue, backfillChoice, legacyBlocker: blocker })

  if (plan.decision === 'NOOP') {
    await recordPrep('NOOP', plan.code, { mainSha })
    return { status: 'NOOP', reason: plan.code, main_sha: mainSha }
  }
  if (plan.decision === 'BLOCKED') {
    const item = plan.source
    if (item) {
      const choice = await freshChoice(item).catch((error) => ({
        jobType: 'FRESH_BRIEF', sourceKind: 'PUBLIC_ARCHIVE',
        sourceRef: item.source_manifest_ref, sourceSha256: item.source_manifest_sha256,
        workKey: makeWorkKey({ sourceKind: 'PUBLIC_ARCHIVE', sourceRef: item.source_manifest_ref, sourceSha256: item.source_manifest_sha256 }),
        refs: (item.parts ?? []).map((part) => part.ref), hashes: (item.parts ?? []).map((part) => part.sha256),
        excerpt: '', sourceError: error.message,
      }))
      const blockerCode = choice.sourceError ? 'SOURCE_HASH_VALIDATION_FAILED' : plan.code
      const blocked = await createJob({ choice, policy, policyPin: pin, mainSha, data, initialStatus: 'BLOCKED', blockerCode })
      await recordPrep('BLOCKED', 'SOURCE_VALIDATION', { blockerCode, sourceRef: choice.sourceRef, sourceSha256: choice.sourceSha256, mainSha })
      return { status: 'BLOCKED', reason: blockerCode, job: blocked.result }
    }
    await recordPrep('BLOCKED', 'C1_PREFLIGHT', { blockerCode: plan.code, mainSha })
    return { status: 'BLOCKED', reason: plan.code, main_sha: mainSha }
  }

  let choice
  try {
    choice = plan.decision === 'FRESH' ? await freshChoice(plan.source) : plan.source
  } catch (error) {
    if (plan.decision !== 'FRESH') throw error
    const blockedChoice = {
      jobType: 'FRESH_BRIEF', sourceKind: 'PUBLIC_ARCHIVE',
      sourceRef: plan.source.source_manifest_ref, sourceSha256: plan.source.source_manifest_sha256,
      workKey: makeWorkKey({ sourceKind: 'PUBLIC_ARCHIVE', sourceRef: plan.source.source_manifest_ref, sourceSha256: plan.source.source_manifest_sha256 }),
      refs: (plan.source.parts ?? []).map((part) => part.ref), hashes: (plan.source.parts ?? []).map((part) => part.sha256), excerpt: '',
    }
    const blockerCode = 'SOURCE_HASH_VALIDATION_FAILED'
    const blocked = await createJob({ choice: blockedChoice, policy, policyPin: pin, mainSha, data, initialStatus: 'BLOCKED', blockerCode })
    await recordPrep('BLOCKED', 'SOURCE_VALIDATION', { blockerCode, sourceRef: blockedChoice.sourceRef, sourceSha256: blockedChoice.sourceSha256, mainSha })
    return { status: 'BLOCKED', reason: blockerCode, job: blocked.result }
  }
  const prepared = await createJob({ choice, policy, config, policyPin: pin, mainSha, data })
  if (prepared.result.status === 'PREPARED' && prepared.result.created === true) {
    await recordPrep('PREPARED', choice.jobType, {
      sourceRef: choice.sourceRef, sourceSha256: choice.sourceSha256, mainSha,
      backfillWorkKey: choice.jobType === 'BACKFILL_BRIEF' ? choice.workKey : null,
    })
    return { status: 'PREPARED', job_id: prepared.result.job_id, job_type: choice.jobType, source_ref: choice.sourceRef, main_sha: mainSha }
  }
  await recordPrep('NOOP', prepared.result.status ?? 'PREPARE_NOT_CREATED', {
    sourceRef: choice.sourceRef, sourceSha256: choice.sourceSha256, mainSha,
  })
  return { status: 'NOOP', reason: prepared.result.status ?? 'PREPARE_NOT_CREATED', main_sha: mainSha }
}

async function main() {
  const result = await runSemanticPrepare()
  console.log(json(result))
  if (result.status === 'BLOCKED') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(async (error) => {
    await recordPrep('ERROR', 'PREPARE_PROGRAM', { blockerCode: 'PREPARE_PROGRAM_ERROR' }).catch(() => {})
    console.error(error.message.split(':')[0])
    process.exitCode = 1
  })
}
