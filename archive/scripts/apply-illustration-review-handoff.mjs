import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertIllustrationReviewJobBinding,
  buildIllustrationReviewRpcPayload,
  isAlreadyAppliedReview,
  reviewTargetStatus,
  validateIllustrationReviewHandoff,
} from './lib/illustration-review-handoff.mjs'

function demand(ok, code) {
  if (!ok) throw new Error(code)
}

async function rpc(name, body) {
  const base = (process.env.ARCHIVE_SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY ?? ''
  demand(base === 'https://jgsxpdflgkqroecfjzxq.supabase.co' && key.length >= 20,
    'ILLUSTRATION_REVIEW_HANDOFF_SUPABASE_CREDENTIALS_REQUIRED')
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'public',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`ILLUSTRATION_REVIEW_HANDOFF_RPC_${response.status}:${text.slice(0, 1000)}`)
  return text ? JSON.parse(text) : null
}

export async function applyIllustrationReviewHandoff(path) {
  const raw = await readFile(resolve(path), 'utf8')
  const handoff = validateIllustrationReviewHandoff(JSON.parse(raw))
  const job = await rpc('archive_illustration_render_job_readback', { p_job_id: handoff.job_id })
  assertIllustrationReviewJobBinding(job, handoff)

  if (isAlreadyAppliedReview(job, handoff)) {
    return {
      status: 'ALREADY_APPLIED',
      job_id: handoff.job_id,
      decision: handoff.decision,
      job_status: job.status,
    }
  }

  demand(job.status === 'INGESTING', 'ILLUSTRATION_REVIEW_HANDOFF_JOB_STATE_INVALID')
  demand(job.review_decision === null && job.reviewed_at === null,
    'ILLUSTRATION_REVIEW_HANDOFF_ALREADY_REVIEWED_CONFLICT')

  const lease = await rpc('archive_illustration_render_job_lease_acquire', {
    p_job_id: handoff.job_id,
    p_owner: `gha-review-handoff-${process.env.GITHUB_RUN_ID ?? 'manual'}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`,
    p_lease_seconds: 600,
  })
  demand(lease?.status === 'LEASE_ACQUIRED'
    && typeof lease.lease_token === 'string'
    && /^[0-9a-f-]{36}$/.test(lease.lease_token),
  'ILLUSTRATION_REVIEW_HANDOFF_LEASE_NOT_ACQUIRED')

  const applied = await rpc('archive_illustration_review_decide_v3', {
    p_review: buildIllustrationReviewRpcPayload(handoff, lease.lease_token),
  })
  const expected = reviewTargetStatus(handoff.decision)
  demand(applied?.status === expected && applied?.review_recorded === true,
    'ILLUSTRATION_REVIEW_HANDOFF_APPLY_FAILED')

  const readback = await rpc('archive_illustration_render_job_readback', { p_job_id: handoff.job_id })
  assertIllustrationReviewJobBinding(readback, handoff)
  demand(readback.status === expected
    && readback.review_decision === handoff.decision
    && readback.review_provider === handoff.review_provider
    && readback.provider_asset_id === `chatgpt-library:${handoff.source_library_file_id}`
    && typeof readback.reviewed_at === 'string',
  'ILLUSTRATION_REVIEW_HANDOFF_READBACK_FAILED')

  return {
    status: 'APPLIED',
    job_id: handoff.job_id,
    decision: handoff.decision,
    job_status: readback.status,
    reviewed_at: readback.reviewed_at,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const path = process.argv[2]
    demand(typeof path === 'string' && path.length > 0, 'ILLUSTRATION_REVIEW_HANDOFF_FILE_REQUIRED')
    const result = await applyIllustrationReviewHandoff(path)
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } catch (error) {
    process.stderr.write(JSON.stringify({
      status: 'ILLUSTRATION_REVIEW_HANDOFF_BLOCKED',
      error: error.message ?? 'UNKNOWN',
    }) + '\n')
    process.exitCode = 1
  }
}
