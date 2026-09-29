import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createIllustrationWorkerRunReceipt,
  validateIllustrationWorkerRunReceipt,
} from './illustration-run-receipt.mjs'

const base = () => createIllustrationWorkerRunReceipt({
  runId: 'illustration-20260929T164500+0900-char-taehoon',
  scheduledFor: '2026-09-29T16:45:00+09:00',
  startedAt: '2026-09-29T16:45:12+09:00',
  mainSha: 'a'.repeat(40),
})

test('creates a valid STARTED receipt with explicit empty stages', () => {
  const receipt = base()
  assert.equal(receipt.receipt_version, 'illustration-worker-run-receipt-v1')
  assert.equal(receipt.final_status, 'STARTED')
  assert.equal(receipt.generation_attempts.length, 0)
  assert.equal(receipt.accepted.count, 0)
  assert.equal(receipt.downstream.trusted_handoff, 'NOT_STARTED')
})

test('records exact generation rejection reasons without pretending acceptance', () => {
  const receipt = base()
  receipt.active_provider = 'native_chatgpt'
  receipt.target = {
    subject_id: 'char-taehoon',
    point_id: `point-${'b'.repeat(64)}`,
    generation_key: `generation-${'c'.repeat(64)}`,
  }
  receipt.prompt = { contract_version: 'illustration-image-prompt-v1', status: 'PASS' }
  receipt.generation_attempts = [
    {
      attempt_no: 1,
      generation_status: 'SUCCEEDED',
      review_status: 'REJECTED',
      rejection_codes: ['AGE_MISMATCH'],
      source_sha256: null,
      transferable_original: null,
    },
    {
      attempt_no: 2,
      generation_status: 'SUCCEEDED',
      review_status: 'REJECTED',
      rejection_codes: ['INVENTED_ACCESSORY'],
      source_sha256: null,
      transferable_original: null,
    },
  ]
  receipt.finished_at = '2026-09-29T16:50:00+09:00'
  receipt.blocker = { code: 'NO_ACCEPTABLE_CANDIDATE', stage: 'QUALITY_GATE' }
  receipt.final_status = 'BLOCKED'
  assert.equal(validateIllustrationWorkerRunReceipt(receipt).generation_attempts[0].rejection_codes[0], 'AGE_MISMATCH')
})

test('accepted image requires exact SHA and one ACCEPTED attempt', () => {
  const receipt = base()
  receipt.generation_attempts = [{
    attempt_no: 1,
    generation_status: 'SUCCEEDED',
    review_status: 'ACCEPTED',
    rejection_codes: [],
    source_sha256: 'd'.repeat(64),
    transferable_original: true,
  }]
  receipt.accepted = { count: 1, source_sha256: 'd'.repeat(64), transferable_original: true }
  assert.doesNotThrow(() => validateIllustrationWorkerRunReceipt(receipt))

  const invalid = structuredClone(receipt)
  invalid.accepted.source_sha256 = null
  assert.throws(() => validateIllustrationWorkerRunReceipt(invalid), /INVALID_ACCEPTED/)
})

test('BLOCKED receipt requires a precise blocker code and stage', () => {
  const receipt = base()
  receipt.final_status = 'BLOCKED'
  assert.throws(() => validateIllustrationWorkerRunReceipt(receipt), /INVALID_BLOCKED/)
  receipt.blocker = { code: 'ORIGINAL_BINARY_NOT_TRANSFERABLE', stage: 'BINARY_HANDOFF' }
  assert.doesNotThrow(() => validateIllustrationWorkerRunReceipt(receipt))
})

test('SUCCEEDED means handoff, storage, registry and cleanup all succeeded', () => {
  const receipt = base()
  receipt.generation_attempts = [{
    attempt_no: 1,
    generation_status: 'SUCCEEDED',
    review_status: 'ACCEPTED',
    rejection_codes: [],
    source_sha256: 'e'.repeat(64),
    transferable_original: true,
  }]
  receipt.accepted = { count: 1, source_sha256: 'e'.repeat(64), transferable_original: true }
  receipt.downstream.trusted_handoff = 'SUCCEEDED'
  receipt.downstream.storage_readback = 'SUCCEEDED'
  receipt.downstream.registry = 'SUCCEEDED'
  receipt.downstream.cleanup = 'SUCCEEDED'
  receipt.finished_at = '2026-09-29T16:55:00+09:00'
  receipt.final_status = 'SUCCEEDED'
  assert.doesNotThrow(() => validateIllustrationWorkerRunReceipt(receipt))

  const invalid = structuredClone(receipt)
  invalid.downstream.registry = 'BLOCKED'
  assert.throws(() => validateIllustrationWorkerRunReceipt(invalid), /INVALID_SUCCEEDED/)
})

test('run receipts cap image generation at three attempts', () => {
  const receipt = base()
  receipt.generation_attempts = Array.from({ length: 4 }, (_, index) => ({
    attempt_no: index + 1,
    generation_status: 'FAILED',
    review_status: 'NOT_REVIEWED',
    rejection_codes: ['GENERATION_FAILED'],
    source_sha256: null,
    transferable_original: null,
  }))
  assert.throws(() => validateIllustrationWorkerRunReceipt(receipt), /INVALID_ILLUSTRATION_WORKER_RUN_RECEIPT/)
})
