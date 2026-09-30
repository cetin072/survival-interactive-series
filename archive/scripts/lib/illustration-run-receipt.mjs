export const ILLUSTRATION_WORKER_RUN_RECEIPT_VERSION = 'illustration-worker-run-receipt-v1'

const RUN_ID = /^[a-z0-9][a-z0-9._:+-]{7,159}$/i
const MAIN_SHA = /^[a-f0-9]{40}$/
const POINT_ID = /^point-[a-f0-9]{64}$/
const GENERATION_KEY = /^generation-[a-f0-9]{64}$/
const SHA256 = /^[a-f0-9]{64}$/
const FINAL_STATUSES = ['STARTED', 'NO_CANDIDATE', 'BLOCKED', 'SUCCEEDED']
const STAGE_STATUSES = ['NOT_STARTED', 'BLOCKED', 'IN_PROGRESS', 'SUCCEEDED']
const GENERATION_STATUSES = ['SUCCEEDED', 'FAILED']
const REVIEW_STATUSES = ['ACCEPTED', 'REJECTED', 'NOT_REVIEWED']

const record = (value) => value && typeof value === 'object' && !Array.isArray(value)
const isoOrNull = (value) => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)))

export function validateIllustrationWorkerRunReceipt(receipt) {
  if (!record(receipt)
    || receipt.receipt_version !== ILLUSTRATION_WORKER_RUN_RECEIPT_VERSION
    || typeof receipt.run_id !== 'string' || !RUN_ID.test(receipt.run_id)
    || typeof receipt.scheduler !== 'string' || !receipt.scheduler
    || typeof receipt.worker !== 'string' || !receipt.worker
    || !isoOrNull(receipt.scheduled_for ?? null)
    || !isoOrNull(receipt.started_at ?? null)
    || !isoOrNull(receipt.finished_at ?? null)
    || !(receipt.main_sha === null || MAIN_SHA.test(receipt.main_sha ?? ''))
    || !(receipt.active_provider === null || typeof receipt.active_provider === 'string')
    || !record(receipt.target)
    || !(receipt.target.subject_id === null || typeof receipt.target.subject_id === 'string')
    || !(receipt.target.point_id === null || POINT_ID.test(receipt.target.point_id ?? ''))
    || !(receipt.target.generation_key === null || GENERATION_KEY.test(receipt.target.generation_key ?? ''))
    || !record(receipt.prompt)
    || !(receipt.prompt.contract_version === null || receipt.prompt.contract_version === 'illustration-image-prompt-v1')
    || !Array.isArray(receipt.generation_attempts) || receipt.generation_attempts.length > 3
    || !record(receipt.accepted)
    || !Number.isInteger(receipt.accepted.count) || receipt.accepted.count < 0 || receipt.accepted.count > 1
    || !record(receipt.downstream)
    || !STAGE_STATUSES.includes(receipt.downstream.trusted_handoff)
    || !STAGE_STATUSES.includes(receipt.downstream.storage_readback)
    || !STAGE_STATUSES.includes(receipt.downstream.registry)
    || !STAGE_STATUSES.includes(receipt.downstream.cleanup)
    || !FINAL_STATUSES.includes(receipt.final_status)
    || !record(receipt.blocker)) {
    throw new Error('INVALID_ILLUSTRATION_WORKER_RUN_RECEIPT')
  }

  for (let index = 0; index < receipt.generation_attempts.length; index++) {
    const attempt = receipt.generation_attempts[index]
    if (!record(attempt)
      || attempt.attempt_no !== index + 1
      || !GENERATION_STATUSES.includes(attempt.generation_status)
      || !REVIEW_STATUSES.includes(attempt.review_status)
      || !Array.isArray(attempt.rejection_codes)
      || !(attempt.source_sha256 === null || SHA256.test(attempt.source_sha256 ?? ''))
      || !(attempt.transferable_original === null || typeof attempt.transferable_original === 'boolean')) {
      throw new Error('INVALID_ILLUSTRATION_WORKER_RUN_ATTEMPT')
    }
  }

  if (receipt.accepted.count === 1) {
    if (!SHA256.test(receipt.accepted.source_sha256 ?? '')
      || typeof receipt.accepted.transferable_original !== 'boolean'
      || receipt.generation_attempts.filter((attempt) => attempt.review_status === 'ACCEPTED').length !== 1) {
      throw new Error('INVALID_ACCEPTED_ILLUSTRATION_WORKER_RUN')
    }
  } else if (receipt.accepted.source_sha256 !== null || receipt.accepted.transferable_original !== null) {
    throw new Error('INVALID_EMPTY_ACCEPTED_ILLUSTRATION_WORKER_RUN')
  }

  if (receipt.final_status === 'SUCCEEDED') {
    if (receipt.accepted.count !== 1
      || receipt.downstream.trusted_handoff !== 'SUCCEEDED'
      || receipt.downstream.storage_readback !== 'SUCCEEDED'
      || receipt.downstream.registry !== 'SUCCEEDED'
      || receipt.downstream.cleanup !== 'SUCCEEDED'
      || receipt.blocker.code !== null
      || receipt.blocker.stage !== null) {
      throw new Error('INVALID_SUCCEEDED_ILLUSTRATION_WORKER_RUN')
    }
  }

  if (receipt.final_status === 'BLOCKED'
    && (typeof receipt.blocker.code !== 'string' || !receipt.blocker.code
      || typeof receipt.blocker.stage !== 'string' || !receipt.blocker.stage)) {
    throw new Error('INVALID_BLOCKED_ILLUSTRATION_WORKER_RUN')
  }

  return receipt
}

export function createIllustrationWorkerRunReceipt({
  runId,
  scheduledFor = null,
  startedAt = new Date().toISOString(),
  mainSha = null,
  scheduler = 'chatgpt_automation',
  worker = 'afterfall-illustration-b',
} = {}) {
  return validateIllustrationWorkerRunReceipt({
    receipt_version: ILLUSTRATION_WORKER_RUN_RECEIPT_VERSION,
    run_id: runId,
    scheduler,
    worker,
    scheduled_for: scheduledFor,
    started_at: startedAt,
    finished_at: null,
    main_sha: mainSha,
    active_provider: null,
    target: { subject_id: null, point_id: null, generation_key: null },
    prompt: { contract_version: null, status: 'NOT_STARTED' },
    generation_attempts: [],
    accepted: { count: 0, source_sha256: null, transferable_original: null },
    downstream: {
      identity_pr_number: null,
      draft_release_id: null,
      trusted_handoff: 'NOT_STARTED',
      storage_readback: 'NOT_STARTED',
      registry: 'NOT_STARTED',
      cleanup: 'NOT_STARTED',
    },
    blocker: { code: null, stage: null },
    final_status: 'STARTED',
  })
}
