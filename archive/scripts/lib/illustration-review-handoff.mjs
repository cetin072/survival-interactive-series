const SHA256 = /^[a-f0-9]{64}$/
const SHA1 = /^[a-f0-9]{40}$/
const JOB_ID = /^[a-z0-9][a-z0-9-]{7,119}$/
const POINT_ID = /^point-[a-f0-9]{64}$/
const GENERATION_KEY = /^generation-[a-f0-9]{64}$/
const SUBJECT_ID = /^(char|loc|event)-[a-z0-9]+(?:-[a-z0-9]+)*$/
const LIBRARY_FILE_ID = /^file_[A-Za-z0-9_-]{16,80}$/
const REJECTION_CODE = /^[A-Z0-9_]{2,64}$/
const DECISIONS = new Set(['PASS', 'REJECT', 'HUMAN_REVIEW'])
const TARGET_STATUS = {
  PASS: 'REVIEW_PASS_STAGED',
  REJECT: 'REVIEW_REJECTED',
  HUMAN_REVIEW: 'HUMAN_REVIEW',
}

export const REVIEW_HANDOFF_VERSION = 'illustration-review-handoff-v1'
export const REVIEW_HANDOFF_PATH = 'archive/automation/runtime/illustration-review-handoff.json'
export const REVIEW_HANDOFF_BRANCH = 'automation-b-review-handoff'

function demand(ok, code) {
  if (!ok) throw new Error(code)
}

function exactKeys(value, expected) {
  return Object.keys(value).sort().join('\n') === [...expected].sort().join('\n')
}

export function validateIllustrationReviewHandoff(value) {
  demand(value && typeof value === 'object' && !Array.isArray(value), 'ILLUSTRATION_REVIEW_HANDOFF_INVALID')
  const keys = [
    'version', 'job_id', 'main_sha', 'point_id', 'generation_key', 'subject_id',
    'prompt_sha256', 'review_context_sha256', 'source_library_path', 'source_library_file_id',
    'decision', 'review_provider', 'review_summary', 'rejection_codes', 'created_at',
  ]
  demand(exactKeys(value, keys), 'ILLUSTRATION_REVIEW_HANDOFF_KEYS_INVALID')
  demand(value.version === REVIEW_HANDOFF_VERSION, 'ILLUSTRATION_REVIEW_HANDOFF_VERSION_INVALID')
  demand(JOB_ID.test(value.job_id ?? ''), 'ILLUSTRATION_REVIEW_HANDOFF_JOB_ID_INVALID')
  demand(SHA1.test(value.main_sha ?? ''), 'ILLUSTRATION_REVIEW_HANDOFF_MAIN_SHA_INVALID')
  demand(POINT_ID.test(value.point_id ?? ''), 'ILLUSTRATION_REVIEW_HANDOFF_POINT_ID_INVALID')
  demand(GENERATION_KEY.test(value.generation_key ?? ''), 'ILLUSTRATION_REVIEW_HANDOFF_GENERATION_KEY_INVALID')
  demand(SUBJECT_ID.test(value.subject_id ?? ''), 'ILLUSTRATION_REVIEW_HANDOFF_SUBJECT_ID_INVALID')
  demand(SHA256.test(value.prompt_sha256 ?? ''), 'ILLUSTRATION_REVIEW_HANDOFF_PROMPT_SHA_INVALID')
  demand(SHA256.test(value.review_context_sha256 ?? ''), 'ILLUSTRATION_REVIEW_HANDOFF_CONTEXT_SHA_INVALID')
  demand(value.source_library_path === '/IMAGE-RENDER/output/current.png',
    'ILLUSTRATION_REVIEW_HANDOFF_LIBRARY_PATH_INVALID')
  demand(LIBRARY_FILE_ID.test(value.source_library_file_id ?? ''),
    'ILLUSTRATION_REVIEW_HANDOFF_LIBRARY_FILE_ID_INVALID')
  demand(DECISIONS.has(value.decision), 'ILLUSTRATION_REVIEW_HANDOFF_DECISION_INVALID')
  demand(value.review_provider === 'native_chatgpt_vision',
    'ILLUSTRATION_REVIEW_HANDOFF_PROVIDER_INVALID')
  demand(typeof value.review_summary === 'string'
    && value.review_summary.trim().length >= 1
    && value.review_summary.length <= 500,
  'ILLUSTRATION_REVIEW_HANDOFF_SUMMARY_INVALID')
  demand(Array.isArray(value.rejection_codes)
    && value.rejection_codes.length <= 12
    && value.rejection_codes.every((code) => typeof code === 'string' && REJECTION_CODE.test(code)),
  'ILLUSTRATION_REVIEW_HANDOFF_REJECTION_CODES_INVALID')
  demand(value.decision !== 'REJECT' || value.rejection_codes.length > 0,
    'ILLUSTRATION_REVIEW_HANDOFF_REJECT_REASON_REQUIRED')
  demand(value.decision !== 'PASS' || value.rejection_codes.length === 0,
    'ILLUSTRATION_REVIEW_HANDOFF_PASS_REASON_INVALID')
  demand(typeof value.created_at === 'string'
    && Number.isFinite(Date.parse(value.created_at))
    && new Date(value.created_at).toISOString() === value.created_at,
  'ILLUSTRATION_REVIEW_HANDOFF_CREATED_AT_INVALID')
  return structuredClone(value)
}

export function reviewTargetStatus(decision) {
  demand(DECISIONS.has(decision), 'ILLUSTRATION_REVIEW_HANDOFF_DECISION_INVALID')
  return TARGET_STATUS[decision]
}

export function reviewProviderAssetId(handoff) {
  validateIllustrationReviewHandoff(handoff)
  return `chatgpt-library:${handoff.source_library_file_id}`
}

export function assertIllustrationReviewJobBinding(job, handoff) {
  validateIllustrationReviewHandoff(handoff)
  demand(job && typeof job === 'object' && !Array.isArray(job), 'ILLUSTRATION_REVIEW_JOB_INVALID')
  const exact = [
    ['job_id', handoff.job_id],
    ['main_sha', handoff.main_sha],
    ['point_id', handoff.point_id],
    ['generation_key', handoff.generation_key],
    ['subject_id', handoff.subject_id],
    ['prompt_sha256', handoff.prompt_sha256],
    ['review_context_sha256', handoff.review_context_sha256],
  ]
  for (const [key, expected] of exact) {
    demand(job[key] === expected, `ILLUSTRATION_REVIEW_HANDOFF_BINDING_MISMATCH_${key.toUpperCase()}`)
  }
  demand(job.active_provider === 'native_chatgpt', 'ILLUSTRATION_REVIEW_HANDOFF_PROVIDER_BINDING_INVALID')
  return true
}

export function buildIllustrationReviewRpcPayload(handoff, leaseToken) {
  validateIllustrationReviewHandoff(handoff)
  demand(typeof leaseToken === 'string' && /^[0-9a-f-]{36}$/.test(leaseToken),
    'ILLUSTRATION_REVIEW_HANDOFF_LEASE_INVALID')
  return {
    job_id: handoff.job_id,
    lease_token: leaseToken,
    review_context_sha256: handoff.review_context_sha256,
    review_provider: handoff.review_provider,
    provider_asset_id: reviewProviderAssetId(handoff),
    decision: handoff.decision,
    review_summary: handoff.review_summary,
    rejection_codes: [...handoff.rejection_codes],
  }
}

export function isAlreadyAppliedReview(job, handoff) {
  assertIllustrationReviewJobBinding(job, handoff)
  return job.status === reviewTargetStatus(handoff.decision)
    && job.review_decision === handoff.decision
    && job.review_provider === handoff.review_provider
    && job.provider_asset_id === reviewProviderAssetId(handoff)
}
