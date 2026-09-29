import { loadKnowledge, validateKnowledge, root } from './lib/knowledge-content.mjs'
import { checkRelease, changedFilesFromGit } from './lib/knowledge-release.mjs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function buildReviewQueuePayload({ brief, result, headSha, prNumber = null, headRef = null }) {
  if (!/^K-\d{3,}$/.test(brief?.id ?? '') || !/^[a-f0-9]{40}$/.test(headSha ?? '')) throw new Error('REVIEW_QUEUE_TARGET_INVALID')
  const sourceIds = Array.isArray(brief.sources) ? brief.sources.map((source) => source.id).filter((id) => typeof id === 'string') : []
  return {
    p_idempotency_key: `C_KNOWLEDGE:${brief.id}:${headSha}`,
    p_source_worker: 'C_KNOWLEDGE',
    p_item_type: 'KNOWLEDGE',
    p_chronicle_id: null,
    p_priority: brief.risk_level === 'HIGH' ? 'P1' : 'P2',
    p_title: brief.title,
    p_summary: `Automation C requires human review (${result.decision}). Review the linked BRIEF and evidence before publication.`,
    p_risk_level: ['LOW', 'MEDIUM', 'HIGH'].includes(brief.risk_level) ? brief.risk_level : 'UNKNOWN',
    p_source_ref: `https://github.com/cetin072/survival-interactive-series/blob/${headSha}/knowledge/content/briefs/${brief.id}.json`,
    // Metadata only: never copy article prose, source notes, or unpublished content into the control plane.
    p_payload: {
      brief_id: brief.id,
      head_sha: headSha,
      decision: result.decision,
      reason_codes: result.reasons,
      risk_domains: brief.risk_domains ?? [],
      source_ids: sourceIds,
      ...(Number.isInteger(prNumber) && prNumber > 0 ? { pr_number: prNumber } : {}),
      ...(typeof headRef === 'string' && headRef.startsWith('knowledge/worker/') ? { head_ref: headRef } : {}),
    },
  }
}

export async function enqueueReview(payload, { projectUrl, serviceRoleKey, fetchImpl = fetch }) {
  if (!projectUrl || !serviceRoleKey) throw new Error('ARCHIVE_REVIEW_SUPABASE_SECRETS_MISSING')
  const endpoint = `${projectUrl.replace(/\/$/, '')}/rest/v1/rpc/archive_worker_enqueue_review_item`
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`ARCHIVE_REVIEW_ENQUEUE_FAILED:${response.status}`)
  return response.json()
}

async function main() {
  const args = process.argv.slice(2)
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index], value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`)
    if (key === '--brief') options.briefId = value
    else if (key === '--base') options.baseRef = value
    else if (key === '--head') options.headRef = value
    else if (key === '--pr-number') options.prNumber = Number(value)
    else if (key === '--pr-head-ref') options.prHeadRef = value
    else throw new Error(`Unknown argument: ${key}`)
  }
  if (!options.briefId || !options.headRef) throw new Error('Usage: knowledge-review-sync.mjs --brief K-... --base REF --head REF [--pr-number N --pr-head-ref REF]')
  if (options.prNumber != null && (!Number.isInteger(options.prNumber) || options.prNumber <= 0)) throw new Error('INVALID_PR_NUMBER')
  if (options.prHeadRef != null && !options.prHeadRef.startsWith('knowledge/worker/')) throw new Error('INVALID_PR_HEAD_REF')
  const data = await loadKnowledge(root)
  await validateKnowledge(data)
  const changedFiles = changedFilesFromGit({ baseRef: options.baseRef, headRef: options.headRef, cwd: root })
  const result = await checkRelease(data, { changedFiles, briefIds: [options.briefId], mode: data.config.publication_mode, base: root })
  const brief = data.briefs.find((item) => item.id === options.briefId)
  if (!brief) throw new Error(`BRIEF_MISSING:${options.briefId}`)
  if (result.decision !== 'HUMAN_REVIEW_REQUIRED' && result.requires_human !== true) {
    console.log(JSON.stringify({ status: 'NO_HUMAN_REVIEW', brief_id: brief.id, decision: result.decision }))
    return
  }
  const exactSha = execFileSync('git', ['rev-parse', options.headRef], { cwd: root, encoding: 'utf8' }).trim()
  const payload = buildReviewQueuePayload({ brief, result, headSha: exactSha, prNumber: options.prNumber, headRef: options.prHeadRef })
  const item = await enqueueReview(payload, {
    projectUrl: process.env.ARCHIVE_SUPABASE_URL,
    serviceRoleKey: process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY,
  })
  console.log(JSON.stringify({ status: 'QUEUED_FOR_HUMAN_REVIEW', brief_id: brief.id, decision: result.decision, item_status: item.status, created: item.created }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
