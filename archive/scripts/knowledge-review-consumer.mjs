import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const repo = 'cetin072/survival-interactive-series'
const shaPattern = /^[a-f0-9]{40}$/
const briefPattern = /^K-\d+$/
const headRefPattern = /^knowledge\/worker\/[A-Za-z0-9._/-]+$/
const itemPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const sha256Pattern = /^[a-f0-9]{64}$/

function required(value, code) {
  if (!value) throw new Error(code)
  return value
}

async function jsonFetch(url, init, fetchImpl = fetch) {
  const response = await fetchImpl(url, init)
  if (!response.ok) throw new Error(`HTTP_${response.status}:${new URL(url).pathname}`)
  return response.json()
}

function supabaseHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  }
}

export async function listApprovedReview({ projectUrl, serviceRoleKey, fetchImpl = fetch }) {
  required(projectUrl, 'ARCHIVE_SUPABASE_URL_REQUIRED')
  required(serviceRoleKey, 'ARCHIVE_SUPABASE_SERVICE_ROLE_KEY_REQUIRED')
  const data = await jsonFetch(`${projectUrl.replace(/\/$/, '')}/rest/v1/rpc/archive_worker_list_approved_reviews`, {
    method: 'POST',
    headers: supabaseHeaders(serviceRoleKey),
    body: JSON.stringify({ p_limit: 1 }),
  }, fetchImpl)
  if (!Array.isArray(data)) throw new Error('APPROVED_REVIEW_RESPONSE_INVALID')
  return data[0] ?? null
}

export async function recordReviewConsumption({ projectUrl, serviceRoleKey, itemId, decidedAt, outcome, result = {}, fetchImpl = fetch }) {
  required(projectUrl, 'ARCHIVE_SUPABASE_URL_REQUIRED')
  required(serviceRoleKey, 'ARCHIVE_SUPABASE_SERVICE_ROLE_KEY_REQUIRED')
  if (!itemPattern.test(itemId ?? '')) throw new Error('REVIEW_ITEM_ID_INVALID')
  if (Number.isNaN(Date.parse(decidedAt ?? ''))) throw new Error('REVIEW_DECIDED_AT_INVALID')
  if (!['CONSUMED', 'BLOCKED', 'RETRYABLE'].includes(outcome)) throw new Error('REVIEW_CONSUMPTION_OUTCOME_INVALID')
  if (!result || Array.isArray(result) || typeof result !== 'object') throw new Error('REVIEW_CONSUMPTION_RESULT_INVALID')
  return jsonFetch(`${projectUrl.replace(/\/$/, '')}/rest/v1/rpc/archive_worker_record_review_consumption`, {
    method: 'POST',
    headers: supabaseHeaders(serviceRoleKey),
    body: JSON.stringify({
      p_item_id: itemId,
      p_decided_at: decidedAt,
      p_outcome: outcome,
      p_result: result,
    }),
  }, fetchImpl)
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'survival-diary-human-review-consumer',
  }
}

const allowedPreparedPath = (path, briefId) =>
  path === `knowledge/content/briefs/${briefId}.json`
  || path === 'archive/web/public/knowledge/index.html'
  || path === 'archive/web/public/sitemap.xml'
  || /^archive\/web\/public\/knowledge\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/.test(path)

async function preparedContinuation({ approvedHead, preparedHead, briefId, prBody, githubToken, fetchImpl }) {
  if (!shaPattern.test(preparedHead ?? '') || preparedHead === approvedHead) return { ok: false }
  if (!prBody?.includes('<!-- knowledge-worker-phase-v1:PUBLICATION_HANDOFF -->')) return { ok: false }
  const compare = await jsonFetch(
    `https://api.github.com/repos/${repo}/compare/${approvedHead}...${preparedHead}`,
    { headers: githubHeaders(githubToken) },
    fetchImpl,
  )
  const commits = Array.isArray(compare.commits) ? compare.commits : []
  const files = Array.isArray(compare.files) ? compare.files.map((file) => file.filename) : []
  const exactCommit = compare.status === 'ahead' && compare.ahead_by === 1 && compare.behind_by === 0 && commits.length === 1
  const exactMessage = commits[0]?.commit?.message?.startsWith(`knowledge: prepare ${briefId} human-approved publication`)
  const exactFiles = files.length >= 1 && files.every((path) => allowedPreparedPath(path, briefId))
  return { ok: Boolean(exactCommit && exactMessage && exactFiles), files }
}

export function validateReviewIdentity(item) {
  if (!item || item.decision !== 'APPROVED') return { ok: false, reason: 'REVIEW_NOT_APPROVED' }
  if (!itemPattern.test(item.id ?? '')) return { ok: false, reason: 'REVIEW_ITEM_ID_INVALID' }
  if (Number.isNaN(Date.parse(item.decided_at ?? ''))) return { ok: false, reason: 'REVIEW_DECIDED_AT_INVALID' }
  const payload = item.payload
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') return { ok: false, reason: 'REVIEW_PAYLOAD_INVALID' }
  const briefId = payload.brief_id
  const headSha = payload.head_sha
  const prNumber = payload.pr_number
  const headRef = payload.head_ref
  const operatorJobId = payload.operator_job_id ?? null
  const operatorDraftRevision = payload.operator_draft_revision ?? null
  const operatorDraftSha256 = payload.operator_draft_sha256 ?? null
  const hasOperatorDraft = operatorJobId != null || operatorDraftRevision != null || operatorDraftSha256 != null
  if (!briefPattern.test(briefId ?? '')) return { ok: false, reason: 'REVIEW_BRIEF_INVALID' }
  if (!shaPattern.test(headSha ?? '')) return { ok: false, reason: 'REVIEW_HEAD_SHA_INVALID' }
  if (!Number.isInteger(prNumber) || prNumber <= 0) return { ok: false, reason: 'REVIEW_PR_NUMBER_MISSING' }
  if (!headRefPattern.test(headRef ?? '')) return { ok: false, reason: 'REVIEW_HEAD_REF_MISSING' }
  const expectedSource = `https://github.com/${repo}/blob/${headSha}/knowledge/content/briefs/${briefId}.json`
  if (item.source_ref !== expectedSource) return { ok: false, reason: 'REVIEW_SOURCE_REF_MISMATCH' }
  if (hasOperatorDraft) {
    if (!itemPattern.test(operatorJobId ?? '')) return { ok: false, reason: 'REVIEW_OPERATOR_JOB_INVALID' }
    if (!Number.isInteger(operatorDraftRevision) || operatorDraftRevision < 1) return { ok: false, reason: 'REVIEW_OPERATOR_DRAFT_REVISION_INVALID' }
    if (!sha256Pattern.test(operatorDraftSha256 ?? '')) return { ok: false, reason: 'REVIEW_OPERATOR_DRAFT_SHA_INVALID' }
  }
  return {
    ok: true, briefId, headSha, prNumber, headRef,
    operatorJobId: hasOperatorDraft ? operatorJobId : null,
    operatorDraftRevision: hasOperatorDraft ? operatorDraftRevision : null,
    operatorDraftSha256: hasOperatorDraft ? operatorDraftSha256 : null,
  }
}

export async function inspectApprovedReview({ projectUrl, serviceRoleKey, githubToken, fetchImpl = fetch }) {
  const item = await listApprovedReview({ projectUrl, serviceRoleKey, fetchImpl })
  if (!item) return { status: 'NOOP' }

  const identity = validateReviewIdentity(item)
  if (!identity.ok) {
    return { status: 'BLOCKED', reason: identity.reason, item_id: item.id, decided_at: item.decided_at }
  }

  required(githubToken, 'ARCHIVE_GITHUB_TOKEN_REQUIRED')
  const [pr, mainRef] = await Promise.all([
    jsonFetch(`https://api.github.com/repos/${repo}/pulls/${identity.prNumber}`, { headers: githubHeaders(githubToken) }, fetchImpl),
    jsonFetch(`https://api.github.com/repos/${repo}/git/ref/heads/main`, { headers: githubHeaders(githubToken) }, fetchImpl),
  ])
  const currentMain = mainRef?.object?.sha
  if (!shaPattern.test(currentMain ?? '')) {
    return { status: 'BLOCKED', reason: 'CURRENT_MAIN_INVALID', item_id: item.id, decided_at: item.decided_at }
  }

  const baseChecks = [
    [pr.base?.ref === 'main', 'REVIEW_PR_BASE_NOT_MAIN'],
    [pr.head?.repo?.full_name === repo, 'REVIEW_PR_REPOSITORY_MISMATCH'],
    [pr.head?.ref === identity.headRef, 'REVIEW_PR_REF_CHANGED'],
  ]
  const failedBase = baseChecks.find(([ok]) => !ok)
  if (failedBase) return { status: 'BLOCKED', reason: failedBase[1], item_id: item.id, decided_at: item.decided_at }

  if (pr.head?.sha !== identity.headSha) {
    const continuation = await preparedContinuation({
      approvedHead: identity.headSha,
      preparedHead: pr.head?.sha,
      briefId: identity.briefId,
      prBody: pr.body,
      githubToken,
      fetchImpl,
    })
    if (!continuation.ok) {
      return { status: 'BLOCKED', reason: 'REVIEW_PR_HEAD_CHANGED', item_id: item.id, decided_at: item.decided_at }
    }
    if (pr.state === 'closed' && pr.merged_at && shaPattern.test(pr.merge_commit_sha ?? '')) {
      return {
        status: 'RECOVER_CONSUMED',
        item_id: item.id,
        decided_at: item.decided_at,
        brief_id: identity.briefId,
        approved_head_sha: identity.headSha,
        prepared_head_sha: pr.head.sha,
        pr_number: identity.prNumber,
        head_ref: identity.headRef,
        merge_sha: pr.merge_commit_sha,
        current_main: currentMain,
      }
    }
    if (pr.state !== 'open') {
      return { status: 'BLOCKED', reason: 'REVIEW_PR_NOT_OPEN', item_id: item.id, decided_at: item.decided_at }
    }
    return {
      status: 'RESUME_PREPARED',
      item_id: item.id,
      decided_at: item.decided_at,
      brief_id: identity.briefId,
      approved_head_sha: identity.headSha,
      prepared_head_sha: pr.head.sha,
      pr_number: identity.prNumber,
      head_ref: identity.headRef,
      current_main: currentMain,
      operator_job_id: identity.operatorJobId,
      operator_draft_revision: identity.operatorDraftRevision,
      operator_draft_sha256: identity.operatorDraftSha256,
    }
  }

  if (pr.state !== 'open') {
    return { status: 'BLOCKED', reason: 'REVIEW_PR_NOT_OPEN', item_id: item.id, decided_at: item.decided_at }
  }

  const compare = await jsonFetch(
    `https://api.github.com/repos/${repo}/compare/${currentMain}...${identity.headSha}`,
    { headers: githubHeaders(githubToken) },
    fetchImpl,
  )
  if (!['ahead', 'identical'].includes(compare.status)) {
    return {
      status: 'BLOCKED',
      reason: 'REVIEW_APPROVAL_STALE_MAIN_MOVED',
      item_id: item.id,
      decided_at: item.decided_at,
      current_main: currentMain,
    }
  }

  return {
    status: 'READY',
    item_id: item.id,
    decided_at: item.decided_at,
    brief_id: identity.briefId,
    approved_head_sha: identity.headSha,
    pr_number: identity.prNumber,
    head_ref: identity.headRef,
    current_main: currentMain,
    operator_job_id: identity.operatorJobId,
    operator_draft_revision: identity.operatorDraftRevision,
    operator_draft_sha256: identity.operatorDraftSha256,
  }
}

function parseArgs(argv) {
  const [action, ...args] = argv
  const options = { action }
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i]
    const value = args[++i]
    if (!value || value.startsWith('--')) throw new Error(`MISSING_VALUE:${key}`)
    options[key.replace(/^--/, '').replaceAll('-', '_')] = value
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const env = {
    projectUrl: process.env.ARCHIVE_SUPABASE_URL,
    serviceRoleKey: process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY,
  }
  if (options.action === 'inspect') {
    const result = await inspectApprovedReview({ ...env, githubToken: process.env.GH_TOKEN })
    process.stdout.write(JSON.stringify(result) + '\n')
    return
  }
  if (options.action === 'record') {
    let result = {}
    if (options.result_json) result = JSON.parse(options.result_json)
    const recorded = await recordReviewConsumption({
      ...env,
      itemId: options.item_id,
      decidedAt: options.decided_at,
      outcome: options.outcome,
      result,
    })
    process.stdout.write(JSON.stringify(recorded) + '\n')
    return
  }
  throw new Error('USAGE: knowledge-review-consumer.mjs inspect | record --item-id UUID --decided-at ISO --outcome OUTCOME [--result-json JSON]')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({ status: 'KNOWLEDGE_REVIEW_CONSUMER_FAILED', error: error.message }) + '\n')
    process.exitCode = 1
  })
}
