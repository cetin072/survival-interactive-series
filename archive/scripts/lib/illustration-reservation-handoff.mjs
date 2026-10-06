import { createHash } from 'node:crypto'

export const RESERVATION_HANDOFF_VERSION = 'illustration-reservation-handoff-v1'
export const RESERVATION_OUTPUT_PATH = '/IMAGE-RENDER/output/current.png'
export const RESERVATION_RENDER_SUFFIX = '이 설명으로 이미지 1장을 생성한다. 생성한 PNG를 개인 Library의 `/IMAGE-RENDER/output/current.png`에 저장한다. 같은 경로의 파일이 있으면 기존 파일을 교체한다. 저장 지시는 이미지에 표현하지 않는다. 다른 문서·이전 이미지·다른 대화를 읽지 않는다.'

const SHA256 = /^[a-f0-9]{64}$/
const FILE_ID = /^file_[A-Za-z0-9_-]{16,80}$/
const LIBRARY_ID = /^libfile_[A-Za-z0-9_-]{16,80}$/
const IDENTIFIER = /^[A-Za-z0-9_-]{1,160}$/
const BINDINGS = {
  job_id: /^[a-z0-9][a-z0-9-]{7,119}$/,
  main_sha: /^[a-f0-9]{40}$/,
  point_id: /^point-[a-f0-9]{64}$/,
  generation_key: /^generation-[a-f0-9]{64}$/,
  subject_id: /^(char|loc|event)-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  prompt_sha256: SHA256,
  review_context_sha256: SHA256,
}
const NOOP_STATUSES = new Set([
  'READY_FOR_REVIEW', 'REVIEW_PASS_STAGED', 'REVIEW_REJECTED', 'HUMAN_REVIEW',
  'FINALIZE_QUEUED', 'FINALIZING', 'SUCCEEDED', 'BLOCKED',
])
const OPERATIONAL_TEXT = /\b(?:Automation\s*[ABC]|Supabase|GitHub|Reviewer|Finalizer|SITE_ASSETS|provider_complete|PREPARED|INGESTING|job_id|main_sha|prompt_sha256|review_context(?:_sha256)?|generation_key|renderer_id|lease_token|AFTERFALL|DB|database)\b|생존일기|자동화\s*[ABC]|리뷰어|파이널라이저|(?:file_|libfile_|point-|generation-)[a-z0-9_-]{8,}|\b(?:char|loc|event)-[a-z0-9]+(?:-[a-z0-9]+)*\b|\b[a-f0-9]{40,64}\b|https?:\/\//i
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const object = (value) => value && typeof value === 'object' && !Array.isArray(value)

function demand(ok, code) {
  if (!ok) throw new Error(`ILLUSTRATION_RESERVATION_${code}`)
}

function exactKeys(value, keys) {
  return object(value) && Object.keys(value).sort().join('\n') === [...keys].sort().join('\n')
}

function timestamp(value, name) {
  demand(typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)), `${name}_INVALID`)
  return Date.parse(value)
}

function validateBinding(value) {
  demand(object(value), 'BINDING_INVALID')
  for (const [key, pattern] of Object.entries(BINDINGS)) {
    demand(typeof value[key] === 'string' && pattern.test(value[key]), `${key.toUpperCase()}_INVALID`)
  }
}

function validateFileIdentity(file) {
  demand(object(file), 'FILE_METADATA_REQUIRED')
  demand(LIBRARY_ID.test(file.library_file_id ?? ''), 'LIBRARY_FILE_ID_INVALID')
  demand(FILE_ID.test(file.file_id ?? ''), 'FILE_ID_INVALID')
  demand(file.version_id === null || (typeof file.version_id === 'string'
    && IDENTIFIER.test(file.version_id)), 'FILE_VERSION_INVALID')
  timestamp(file.modified_at, 'FILE_MODIFIED_AT')
  demand(SHA256.test(file.sha256 ?? ''), 'FILE_SHA256_REQUIRED')
}

// Read-only routing gate. Unknown observations are never permission to re-arm
// the single Library writer. The caller still owns fresh reads and blob CAS.
export function routeReservationJob({ job, runtime, previousJob, rendererPending }) {
  demand(runtime === null || object(runtime), 'RUNTIME_READ_REQUIRED')
  demand(typeof rendererPending === 'boolean', 'RENDERER_STATE_REQUIRED')
  if (runtime !== null) {
    const receipt = validateReservationReceipt(runtime.receipt)
    const boundJob = job?.job_id === receipt.job_id ? job : previousJob
    demand(boundJob, 'UNRESOLVED_DISPATCH')
    assertReservationJobBinding(boundJob, receipt)
    if (boundJob !== job) {
      demand(['SUCCEEDED', 'REVIEW_REJECTED'].includes(boundJob.status), 'UNRESOLVED_DISPATCH')
      demand(runtime.collection?.provider_complete?.p_job_id === receipt.job_id
        && runtime.collection.provider_complete.p_prompt_sha256 === receipt.prompt_sha256,
      'UNRESOLVED_DISPATCH')
      timestamp(runtime.collection.provider_completed_at, 'PROVIDER_COMPLETED_AT')
      const sourceId = runtime.collection.source_file_id
      demand(FILE_ID.test(sourceId ?? '')
        && boundJob.provider_asset_id === `chatgpt-library:${sourceId}`, 'COLLECTION_BINDING_MISMATCH')
    }
  }
  if (!job) return { role: 'NOOP' }
  validateBinding(job)
  demand(job.active_provider === 'native_chatgpt', 'PROVIDER_INVALID')
  if (job.status === 'PREPARED') {
    if (runtime?.receipt.job_id === job.job_id) return { role: 'COLLECT', job_id: job.job_id }
    demand(rendererPending === false, 'RENDERER_PENDING')
    return { role: 'DISPATCH', job_id: job.job_id }
  }
  if (job.status === 'INGESTING' || job.status === 'REVIEW_PASS_STAGED') {
    demand(runtime?.receipt.job_id === job.job_id, 'COLLECTION_BINDING_MISMATCH')
    const sourceId = runtime.collection?.source_file_id
    demand(FILE_ID.test(sourceId ?? '')
      && SHA256.test(runtime.collection?.source_sha256 ?? '')
      && runtime.collection?.source_library_path === RESERVATION_OUTPUT_PATH,
    'COLLECTION_BINDING_MISMATCH')
    // provider_complete sets time/status only. The Program review decision
    // binds provider_asset_id later; requiring it before review deadlocks INGESTING.
    timestamp(job.provider_completed_at, 'PROVIDER_COMPLETED_AT')
    demand((job.status === 'INGESTING' && job.provider_asset_id == null)
      || job.provider_asset_id === `chatgpt-library:${sourceId}`, 'COLLECTION_BINDING_MISMATCH')
    return { role: job.status === 'INGESTING' ? 'REVIEWER' : 'TRANSFER', job_id: job.job_id }
  }
  if (job.status === 'FINALIZE_QUEUED' || job.status === 'FINALIZING') {
    return { role: 'WAIT_PROGRAM_FINALIZER', job_id: job.job_id }
  }
  if (job.status === 'SUCCEEDED') return { role: 'AUDIT', job_id: job.job_id }
  demand(NOOP_STATUSES.has(job.status), 'JOB_STATUS_INVALID')
  return { role: 'NOOP', job_id: job.job_id }
}

// The visual prompt is immutable. The only addition is the fixed output instruction.
export function buildReservationRendererPrompt(promptText, promptSha256) {
  demand(typeof promptText === 'string' && promptText.trim().length > 0, 'PROMPT_REQUIRED')
  demand(SHA256.test(promptSha256 ?? '') && sha256(promptText) === promptSha256, 'PROMPT_SHA_MISMATCH')
  demand(!OPERATIONAL_TEXT.test(promptText), 'OPERATIONAL_PROMPT_FORBIDDEN')
  return `${promptText}\n\n${RESERVATION_RENDER_SUFFIX}`
}

export function validateReservationReceipt(receipt) {
  demand(exactKeys(receipt, [
    'version', 'mode', ...Object.keys(BINDINGS), 'renderer_id', 'requested_at',
    'job_created_at', 'renderer_prompt_sha256', 'baseline',
  ]), 'RECEIPT_KEYS_INVALID')
  demand(receipt.version === RESERVATION_HANDOFF_VERSION, 'VERSION_INVALID')
  demand(receipt.mode === 'LIVE', 'MODE_INVALID')
  validateBinding(receipt)
  demand(typeof receipt.renderer_id === 'string' && IDENTIFIER.test(receipt.renderer_id), 'RENDERER_ID_INVALID')
  demand(SHA256.test(receipt.renderer_prompt_sha256 ?? ''), 'RENDERER_PROMPT_SHA_INVALID')
  const requestedAt = timestamp(receipt.requested_at, 'REQUESTED_AT')
  const createdAt = timestamp(receipt.job_created_at, 'JOB_CREATED_AT')
  demand(requestedAt >= createdAt, 'REQUEST_BEFORE_JOB')
  if (receipt.baseline !== null) {
    demand(exactKeys(receipt.baseline, [
      'library_file_id', 'file_id', 'version_id', 'modified_at', 'sha256',
    ]), 'BASELINE_KEYS_INVALID')
    validateFileIdentity(receipt.baseline)
    demand(timestamp(receipt.baseline.modified_at, 'BASELINE_MODIFIED_AT') < createdAt,
      'EXISTING_JOB_IMAGE_MUST_BE_RESUMED')
  }
  return structuredClone(receipt)
}

export function assertReservationJobBinding(job, receipt) {
  validateReservationReceipt(receipt)
  validateBinding(job)
  for (const key of Object.keys(BINDINGS)) {
    demand(job[key] === receipt[key], `BINDING_MISMATCH_${key.toUpperCase()}`)
  }
  demand(job.active_provider === 'native_chatgpt', 'PROVIDER_INVALID')
  demand(timestamp(job.created_at, 'JOB_CREATED_AT') === Date.parse(receipt.job_created_at),
    'BINDING_MISMATCH_JOB_CREATED_AT')
  return true
}

// baselineFile must come from an exact-path Library read. Explicit null means absent;
// an omitted value is not evidence of absence. Never arm another job while one is in flight.
export function buildReservationDispatch({ job, promptText, rendererId, baselineFile, requestedAt }) {
  validateBinding(job)
  demand(job.active_provider === 'native_chatgpt', 'PROVIDER_INVALID')
  demand(job.status === 'PREPARED', 'JOB_NOT_PREPARED')
  const rendererPrompt = buildReservationRendererPrompt(promptText, job.prompt_sha256)
  demand(baselineFile !== undefined, 'BASELINE_READ_REQUIRED')
  let baseline = null
  if (baselineFile !== null) {
    demand(baselineFile.path === RESERVATION_OUTPUT_PATH, 'BASELINE_PATH_INVALID')
    validateFileIdentity(baselineFile)
    baseline = Object.fromEntries(['library_file_id', 'file_id', 'version_id', 'modified_at', 'sha256']
      .map((key) => [key, baselineFile[key]]))
  }
  const receipt = {
    version: RESERVATION_HANDOFF_VERSION,
    mode: 'LIVE',
    ...Object.fromEntries(Object.keys(BINDINGS).map((key) => [key, job[key]])),
    renderer_id: rendererId,
    requested_at: requestedAt,
    job_created_at: job.created_at,
    renderer_prompt_sha256: sha256(rendererPrompt),
    baseline,
  }
  validateReservationReceipt(receipt)
  return { renderer_prompt: rendererPrompt, receipt }
}

export function assertReservationPromptReadback({ job, receipt, promptText, rendererId, scheduledPrompt }) {
  assertReservationJobBinding(job, receipt)
  demand(rendererId === receipt.renderer_id, 'RENDERER_ID_MISMATCH')
  const expected = buildReservationRendererPrompt(promptText, receipt.prompt_sha256)
  demand(scheduledPrompt === expected && sha256(expected) === receipt.renderer_prompt_sha256,
    'SCHEDULED_PROMPT_MISMATCH')
  return true
}

// This helper checks caller-supplied full PNG decode evidence; it does not decode PNG
// bytes. The caller must download this exact file and verify+load it before collecting.
export function collectReservationResult({
  job, receipt, promptText, rendererId, scheduledPrompt, currentFile, pngEvidence, observedAt,
}) {
  assertReservationJobBinding(job, receipt)
  if (job.status === 'INGESTING') return { status: 'ALREADY_COMPLETED', job_id: job.job_id }
  if (NOOP_STATUSES.has(job.status)) return { status: 'NOOP', job_id: job.job_id, job_status: job.status }
  demand(job.status === 'PREPARED', 'JOB_NOT_PREPARED')
  assertReservationPromptReadback({ job, receipt, promptText, rendererId, scheduledPrompt })
  validateFileIdentity(currentFile)
  demand(currentFile.path === RESERVATION_OUTPUT_PATH, 'OUTPUT_PATH_INVALID')
  demand(currentFile.mime_type === 'image/png', 'OUTPUT_MIME_INVALID')
  demand(Number.isSafeInteger(currentFile.size_bytes)
    && currentFile.size_bytes >= 67 && currentFile.size_bytes <= 20971520, 'OUTPUT_SIZE_INVALID')
  const modifiedAt = timestamp(currentFile.modified_at, 'FILE_MODIFIED_AT')
  const observed = timestamp(observedAt, 'OBSERVED_AT')
  demand(modifiedAt >= Date.parse(receipt.requested_at)
    && modifiedAt >= Date.parse(job.created_at), 'OUTPUT_STALE')
  demand(modifiedAt <= observed && Date.parse(receipt.requested_at) <= observed, 'OUTPUT_FROM_FUTURE')
  if (receipt.baseline !== null) {
    const baseline = receipt.baseline
    demand(currentFile.file_id !== baseline.file_id || (currentFile.version_id !== null
      && currentFile.version_id !== baseline.version_id), 'OUTPUT_UNCHANGED')
    demand(currentFile.sha256 !== baseline.sha256, 'OUTPUT_BYTES_UNCHANGED')
  }
  demand(object(pngEvidence) && pngEvidence.format === 'PNG'
    && pngEvidence.fully_decoded === true, 'PNG_DECODE_EVIDENCE_REQUIRED')
  demand(pngEvidence.file_id === currentFile.file_id && pngEvidence.sha256 === currentFile.sha256
    && pngEvidence.size_bytes === currentFile.size_bytes, 'PNG_EVIDENCE_BINDING_MISMATCH')
  demand(Number.isInteger(pngEvidence.width) && pngEvidence.width > 0 && pngEvidence.width <= 8192
    && Number.isInteger(pngEvidence.height) && pngEvidence.height > 0 && pngEvidence.height <= 8192,
  'PNG_DIMENSIONS_INVALID')
  return {
    status: 'READY_FOR_PROVIDER_COMPLETE',
    provider_complete: { p_job_id: job.job_id, p_prompt_sha256: receipt.prompt_sha256 },
    source_library_path: RESERVATION_OUTPUT_PATH,
    source_library_file_id: currentFile.file_id,
    source_sha256: currentFile.sha256,
  }
}
