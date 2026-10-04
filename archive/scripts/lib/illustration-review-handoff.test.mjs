import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REVIEW_HANDOFF_BRANCH,
  REVIEW_HANDOFF_PATH,
  REVIEW_HANDOFF_VERSION,
  assertIllustrationReviewJobBinding,
  buildIllustrationReviewRpcPayload,
  isAlreadyAppliedReview,
  reviewProviderAssetId,
  reviewTargetStatus,
  validateIllustrationReviewHandoff,
} from './illustration-review-handoff.mjs'

const handoff = (overrides = {}) => ({
  version: REVIEW_HANDOFF_VERSION,
  job_id: 'illustration-char-doyoon-377d18532ae4-20261004-37205326583',
  main_sha: 'a'.repeat(40),
  point_id: `point-${'b'.repeat(64)}`,
  generation_key: `generation-${'c'.repeat(64)}`,
  subject_id: 'char-doyoon',
  prompt_sha256: 'd'.repeat(64),
  review_context_sha256: 'e'.repeat(64),
  source_library_path: '/IMAGE-RENDER/output/current.png',
  source_library_file_id: 'file_0000000066fc823093670e1a224f3ed4',
  decision: 'REJECT',
  review_provider: 'native_chatgpt_vision',
  review_summary: 'Generated image conflicts with the bound character appearance.',
  rejection_codes: ['CHARACTER_APPEARANCE_MISMATCH'],
  created_at: '2026-10-04T14:10:00.000Z',
  ...overrides,
})

const job = (overrides = {}) => ({
  ...handoff(),
  active_provider: 'native_chatgpt',
  status: 'INGESTING',
  review_decision: null,
  review_provider: null,
  provider_asset_id: null,
  ...overrides,
})

test('review handoff contract is small, exact, and branch-scoped', () => {
  const value = validateIllustrationReviewHandoff(handoff())
  assert.equal(value.decision, 'REJECT')
  assert.equal(REVIEW_HANDOFF_BRANCH, 'automation-b-review-handoff')
  assert.equal(REVIEW_HANDOFF_PATH, 'archive/automation/runtime/illustration-review-handoff.json')
  assert.equal(reviewTargetStatus('PASS'), 'REVIEW_PASS_STAGED')
  assert.equal(reviewTargetStatus('REJECT'), 'REVIEW_REJECTED')
  assert.equal(reviewTargetStatus('HUMAN_REVIEW'), 'HUMAN_REVIEW')
})

test('reject requires a machine-readable reason and pass forbids rejection codes', () => {
  assert.throws(() => validateIllustrationReviewHandoff(handoff({ rejection_codes: [] })),
    /REJECT_REASON_REQUIRED/)
  assert.throws(() => validateIllustrationReviewHandoff(handoff({
    decision: 'PASS', rejection_codes: ['NOT_ALLOWED'],
  })), /PASS_REASON_INVALID/)
  assert.doesNotThrow(() => validateIllustrationReviewHandoff(handoff({
    decision: 'PASS', rejection_codes: [],
  })))
})

test('unknown keys and unsafe transport values fail closed', () => {
  assert.throws(() => validateIllustrationReviewHandoff({ ...handoff(), extra: 'x' }), /KEYS_INVALID/)
  assert.throws(() => validateIllustrationReviewHandoff(handoff({
    source_library_path: '/somewhere/else.png',
  })), /LIBRARY_PATH_INVALID/)
  assert.throws(() => validateIllustrationReviewHandoff(handoff({
    review_provider: 'manual_visual_audit',
  })), /PROVIDER_INVALID/)
})

test('program binds the review to the exact durable job snapshot', () => {
  const value = handoff()
  assert.equal(assertIllustrationReviewJobBinding(job(), value), true)
  assert.throws(() => assertIllustrationReviewJobBinding(job({
    prompt_sha256: 'f'.repeat(64),
  }), value), /BINDING_MISMATCH_PROMPT_SHA256/)
})

test('program derives provider asset identity and durable RPC payload', () => {
  const value = handoff()
  assert.equal(reviewProviderAssetId(value),
    'chatgpt-library:file_0000000066fc823093670e1a224f3ed4')
  assert.deepEqual(buildIllustrationReviewRpcPayload(value, '12345678-1234-1234-1234-123456789abc'), {
    job_id: value.job_id,
    lease_token: '12345678-1234-1234-1234-123456789abc',
    review_context_sha256: value.review_context_sha256,
    review_provider: value.review_provider,
    provider_asset_id: 'chatgpt-library:file_0000000066fc823093670e1a224f3ed4',
    decision: 'REJECT',
    review_summary: value.review_summary,
    rejection_codes: value.rejection_codes,
  })
})

test('idempotency accepts only the exact already-applied decision', () => {
  const value = handoff()
  assert.equal(isAlreadyAppliedReview(job({
    status: 'REVIEW_REJECTED',
    review_decision: 'REJECT',
    review_provider: 'native_chatgpt_vision',
    provider_asset_id: reviewProviderAssetId(value),
  }), value), true)
  assert.equal(isAlreadyAppliedReview(job(), value), false)
})


test('native reviewer hands off the decision instead of mutating Supabase directly', async () => {
  const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
  const worker = await readFile(resolve(root, 'docs/automation/ILLUSTRATION_B_NATIVE_WORKER_PROMPT.md'), 'utf8')
  const router = await readFile(resolve(root, 'docs/automation/ILLUSTRATION_B_NATIVE_WORKER_ROUTER.md'), 'utf8')
  const contract = JSON.parse(await readFile(
    resolve(root, 'archive/automation/illustration-native-worker-runtime-contract.json'), 'utf8',
  ))
  const workflow = await readFile(
    resolve(root, '.github/workflows/archive-illustration-review-handoff.yml'), 'utf8',
  )
  assert.match(worker, /Supabase의 lease acquire \/ review_decide \/ 상태변경 RPC를 이 AI 실행에서 직접 호출하지 않는다/)
  assert.match(worker, /automation-b-review-handoff/)
  assert.match(router, /Program owns durable review-decision mutation/)
  assert.equal(contract.review_handoff.ai_direct_db_mutation, false)
  assert.equal(contract.roles.INGESTING.decision_rpc_owner, 'PROGRAM_REVIEW_HANDOFF')
  assert.match(workflow, /Checkout current main program/)
  assert.match(workflow, /apply-illustration-review-handoff\.mjs/)
})

test('clean renderer can replace only a prior-job stale current image', async () => {
  const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
  const renderer = await readFile(resolve(root, 'docs/automation/ILLUSTRATION_B_CLEAN_RENDERER_PROMPT.md'), 'utf8')
  assert.match(renderer, /modified_at.*earlier than the current job .*created_at/)
  assert.match(renderer, /do not generate again/)
  assert.match(renderer, /Never replace a file while the current DB job is not `PREPARED`/)
})
