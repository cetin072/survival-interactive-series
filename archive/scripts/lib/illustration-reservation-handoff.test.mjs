import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  RESERVATION_OUTPUT_PATH,
  RESERVATION_RENDER_SUFFIX,
  buildReservationRendererPrompt,
  buildReservationDispatch,
  validateReservationReceipt,
  assertReservationJobBinding,
  assertReservationPromptReadback,
  collectReservationResult,
} from './illustration-reservation-handoff.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const promptText = '현대 한국의 작은 도로교량. 푸른 회색 자연광과 붓터치가 보이는 회화적 풍경.\n'
const rendererId = 'renderer-1234567890abcdef'
const job = (overrides = {}) => ({
  job_id: 'illustration-loc-bridge-0123456789ab-20261005-1234567890',
  main_sha: 'a'.repeat(40),
  point_id: `point-${'b'.repeat(64)}`,
  generation_key: `generation-${'c'.repeat(64)}`,
  subject_id: 'loc-bridge',
  prompt_sha256: hash(promptText),
  review_context_sha256: 'd'.repeat(64),
  active_provider: 'native_chatgpt',
  status: 'PREPARED',
  created_at: '2026-10-05T01:00:00.000Z',
  ...overrides,
})
const baselineFile = (overrides = {}) => ({
  path: RESERVATION_OUTPUT_PATH,
  library_file_id: `libfile_${'a'.repeat(32)}`,
  file_id: `file_${'b'.repeat(32)}`,
  version_id: 'version-before',
  modified_at: '2026-10-04T23:00:00.000Z',
  sha256: 'e'.repeat(64),
  ...overrides,
})
const dispatch = (overrides = {}) => buildReservationDispatch({
  job: job(), promptText, rendererId, baselineFile: baselineFile(),
  requestedAt: '2026-10-05T01:01:00.000Z', ...overrides,
})
const currentFile = (overrides = {}) => ({
  ...baselineFile(), file_id: `file_${'c'.repeat(32)}`, version_id: 'version-after',
  modified_at: '2026-10-05T01:03:00.000Z', sha256: 'f'.repeat(64),
  mime_type: 'image/png', size_bytes: 2831359, ...overrides,
})
const input = (overrides = {}) => {
  const value = dispatch()
  const current = overrides.currentFile ?? currentFile()
  return {
    job: job(), receipt: value.receipt, promptText, rendererId,
    scheduledPrompt: value.renderer_prompt, currentFile: current,
    pngEvidence: {
      file_id: current.file_id, sha256: current.sha256, size_bytes: current.size_bytes,
      format: 'PNG', fully_decoded: true, width: 1536, height: 1024,
    },
    observedAt: '2026-10-05T01:05:00.000Z', ...overrides,
  }
}

test('dispatch preserves exact visual bytes and adds only a fixed output instruction', () => {
  const { renderer_prompt: rendered, receipt } = dispatch()
  assert.equal(rendered, `${promptText}\n\n${RESERVATION_RENDER_SUFFIX}`)
  assert.equal(rendered, buildReservationRendererPrompt(promptText, hash(promptText)))
  assert.equal(receipt.renderer_prompt_sha256, hash(rendered))
  assert.equal(receipt.mode, 'LIVE')
  for (const binding of [job().job_id, job().main_sha, rendererId, job().subject_id]) {
    assert.equal(rendered.includes(binding), false)
  }
  assert.equal(assertReservationPromptReadback(input()), true)
})

test('visual prompt changes and operational context fail before scheduling', () => {
  assert.throws(() => dispatch({ promptText: promptText.trim() }), /PROMPT_SHA_MISMATCH/)
  assert.throws(() => buildReservationRendererPrompt('', hash('')), /PROMPT_REQUIRED/)
  for (const context of ['Automation B', 'Supabase', 'GitHub', 'Reviewer', 'Finalizer',
    'SITE_ASSETS', 'provider_complete', 'prompt_sha256', 'DB', 'job_id', '리뷰어',
    job().main_sha, job().point_id, job().subject_id]) {
    const contaminated = `${promptText}\n${context}`
    assert.throws(() => buildReservationRendererPrompt(contaminated, hash(contaminated)),
      /OPERATIONAL_PROMPT_FORBIDDEN/)
  }
})

test('dispatch requires a live prepared native job and an explicit baseline observation', () => {
  assert.throws(() => dispatch({ job: job({ status: 'INGESTING' }) }), /JOB_NOT_PREPARED/)
  assert.throws(() => dispatch({ job: job({ active_provider: 'api_openai' }) }), /PROVIDER_INVALID/)
  assert.throws(() => dispatch({ baselineFile: undefined }), /BASELINE_READ_REQUIRED/)
  assert.throws(() => dispatch({ baselineFile: baselineFile({ sha256: undefined }) }), /FILE_SHA256_REQUIRED/)
  assert.throws(() => dispatch({ baselineFile: baselineFile({ path: '/other.png' }) }), /BASELINE_PATH_INVALID/)
  assert.throws(() => dispatch({ baselineFile: baselineFile({ modified_at: job().created_at }) }),
    /EXISTING_JOB_IMAGE_MUST_BE_RESUMED/)
  assert.throws(() => dispatch({ requestedAt: '2026-10-04T22:00:00.000Z' }), /REQUEST_BEFORE_JOB/)
})

test('receipt and all immutable job bindings are checked on readback and collection', () => {
  const { receipt } = dispatch()
  assert.throws(() => validateReservationReceipt({ ...receipt, mode: 'PREVIEW' }), /MODE_INVALID/)
  assert.throws(() => validateReservationReceipt({ ...receipt, unknown: true }), /RECEIPT_KEYS_INVALID/)
  for (const key of ['job_id', 'main_sha', 'point_id', 'generation_key', 'subject_id',
    'prompt_sha256', 'review_context_sha256']) {
    const changed = key === 'job_id' ? 'different-job-12345678'
      : key === 'subject_id' ? 'loc-shelter'
      : key === 'point_id' ? `point-${'1'.repeat(64)}`
      : key === 'generation_key' ? `generation-${'1'.repeat(64)}`
      : '1'.repeat(key === 'main_sha' ? 40 : 64)
    assert.throws(() => assertReservationJobBinding(job({ [key]: changed }), receipt), /BINDING_MISMATCH/)
    assert.throws(() => collectReservationResult(input({ job: job({ [key]: changed }) })), /BINDING_MISMATCH/)
  }
  assert.throws(() => collectReservationResult(input({ scheduledPrompt: `${input().scheduledPrompt}\nextra` })),
    /SCHEDULED_PROMPT_MISMATCH/)
  assert.throws(() => collectReservationResult(input({ rendererId: 'other-renderer' })), /RENDERER_ID_MISMATCH/)
})

test('a changed valid PNG at the same Library identity yields only the existing RPC payload', () => {
  const result = collectReservationResult(input())
  assert.equal(currentFile().library_file_id, baselineFile().library_file_id)
  assert.equal(result.status, 'READY_FOR_PROVIDER_COMPLETE')
  assert.deepEqual(result.provider_complete, { p_job_id: job().job_id, p_prompt_sha256: job().prompt_sha256 })
  assert.equal(result.source_library_file_id, currentFile().file_id)
  assert.doesNotThrow(() => collectReservationResult(input({
    currentFile: currentFile({ file_id: baselineFile().file_id }),
  })))
})

test('an explicitly absent baseline accepts only fresh fully decoded output', () => {
  const value = dispatch({ baselineFile: null })
  assert.equal(collectReservationResult(input({ receipt: value.receipt })).status, 'READY_FOR_PROVIDER_COMPLETE')
  assert.throws(() => collectReservationResult(input({ receipt: value.receipt,
    currentFile: currentFile({ modified_at: '2026-10-05T01:00:59.999Z' }),
  })), /OUTPUT_STALE/)
})

test('old files, same bytes, unmodified identities, and future metadata fail closed', () => {
  const cases = [
    [{ modified_at: '2026-10-04T23:00:00.000Z' }, /OUTPUT_STALE/],
    [{ modified_at: '2026-10-05T02:00:00.000Z' }, /OUTPUT_FROM_FUTURE/],
    [{ file_id: baselineFile().file_id, version_id: baselineFile().version_id }, /OUTPUT_UNCHANGED/],
    [{ file_id: baselineFile().file_id, version_id: null }, /OUTPUT_UNCHANGED/],
    [{ sha256: baselineFile().sha256 }, /OUTPUT_BYTES_UNCHANGED/],
    [{ path: '/IMAGE-RENDER/output/other.png' }, /OUTPUT_PATH_INVALID/],
    [{ mime_type: 'image/jpeg' }, /OUTPUT_MIME_INVALID/],
    [{ size_bytes: 0 }, /OUTPUT_SIZE_INVALID/],
    [{ size_bytes: 32 }, /OUTPUT_SIZE_INVALID/],
    [{ modified_at: undefined }, /FILE_MODIFIED_AT_INVALID/],
  ]
  for (const [overrides, error] of cases) {
    assert.throws(() => collectReservationResult(input({ currentFile: currentFile(overrides) })), error)
  }
})

test('collection requires matching full decode evidence, never a MIME or signature check alone', () => {
  for (const evidence of [null, {}, { ...input().pngEvidence, fully_decoded: false }]) {
    assert.throws(() => collectReservationResult(input({ pngEvidence: evidence })), /PNG_DECODE_EVIDENCE_REQUIRED/)
  }
  for (const overrides of [{ file_id: baselineFile().file_id }, { sha256: baselineFile().sha256 }, { size_bytes: 99 }]) {
    assert.throws(() => collectReservationResult(input({ pngEvidence: { ...input().pngEvidence, ...overrides } })),
      /PNG_EVIDENCE_BINDING_MISMATCH/)
  }
  assert.throws(() => collectReservationResult(input({ pngEvidence: { ...input().pngEvidence, width: 0 } })),
    /PNG_DIMENSIONS_INVALID/)
})

test('already completed and terminal jobs never produce another provider mutation', () => {
  const already = collectReservationResult(input({ job: job({ status: 'INGESTING' }), currentFile: null }))
  assert.deepEqual(already, { status: 'ALREADY_COMPLETED', job_id: job().job_id })
  for (const status of ['SUCCEEDED', 'REVIEW_REJECTED', 'HUMAN_REVIEW', 'FINALIZING', 'BLOCKED']) {
    const result = collectReservationResult(input({ job: job({ status }), currentFile: null }))
    assert.equal(result.status, 'NOOP')
    assert.equal(result.provider_complete, undefined)
  }
  assert.throws(() => collectReservationResult(input({ job: job({ status: 'UNKNOWN' }) })), /JOB_NOT_PREPARED/)
})
