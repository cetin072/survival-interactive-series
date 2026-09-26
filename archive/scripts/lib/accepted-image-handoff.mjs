/** Offline Step 6 -> 7 handoff. A reviewed local file is not stored or published. */
import { imagePocReceipt, inspectPng, pocDigest, validateImagePocRequest } from './image-poc-exchange.mjs'
import { validateVisualCatalog } from './visual-compiler.mjs'

const demand = (condition, code) => { if (!condition) throw new Error(code) }
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const exactKeys = (value, allowed) => demand(object(value) && Object.keys(value).every((key) => allowed.includes(key)), 'UNEXPECTED_HANDOFF_FIELD')

/** Review assertions are made by an identified person who actually inspected the pixels. */
export function acceptLocalImage(request, receipt, bytes, review) {
  validateImagePocRequest(request)
  exactKeys(review, ['reviewer', 'reviewed_at', 'pixel_decoded', 'single_subject', 'no_embedded_text', 'brief_match', 'source_file_sha256'])
  demand(typeof review.reviewer === 'string' && /^[A-Za-z0-9._-]{2,80}$/.test(review.reviewer), 'REVIEWER_REQUIRED')
  demand(typeof review.reviewed_at === 'string' && !Number.isNaN(Date.parse(review.reviewed_at))
    && new Date(review.reviewed_at).toISOString() === review.reviewed_at, 'REVIEW_TIME_REQUIRED')
  demand(review.pixel_decoded === true && review.single_subject === true && review.no_embedded_text === true
    && review.brief_match === true, 'VISUAL_REVIEW_NOT_ACCEPTED')
  const file = inspectPng(bytes)
  demand(review.source_file_sha256 === file.sha256, 'REVIEWED_FILE_HASH_MISMATCH')
  demand(receipt?.request_id === request.request_id && receipt.point_id === request.point_id
    && receipt.generation_key === request.generation_key, 'RECEIPT_REQUEST_MISMATCH')
  demand(receipt.status === 'LOCAL_SAMPLE_REVIEW_REQUIRED' && receipt.content_review === 'MATCHES_INTENDED_BRIEF'
    && receipt.shape_matches === true && receipt.publication_allowed === false, 'RECEIPT_NOT_ELIGIBLE')
  const expected = imagePocReceipt(request, bytes, {
    request_id: request.request_id, point_id: request.point_id, generation_key: request.generation_key,
    tool_result_id: receipt.tool_result_id, tool: receipt.tool, surface: receipt.surface,
    review: 'MATCHES_INTENDED_BRIEF',
  })
  demand(pocDigest(receipt) === pocDigest(expected), 'RECEIPT_TAMPERED')
  const body = {
    version: 'accepted-local-image-v1', chronicle_id: request.chronicle_id, worldline_id: request.worldline_id,
    visibility: request.visibility, request_id: request.request_id, receipt_id: receipt.receipt_id,
    point_id: request.point_id, generation_key: request.generation_key, source_revision: request.source_revision,
    tool_result_id: receipt.tool_result_id, file, review: structuredClone(review),
    status: 'ACCEPTED_LOCAL_CANDIDATE', storage_status: 'NOT_STORED', publication_status: 'NOT_PUBLISHED',
    storage_object_path: null, public_url: null, storage_writes: 0, database_writes: 0,
  }
  return { ...body, candidate_id: `candidate-${pocDigest(body)}` }
}

/** A receiver plan has no file-system, Storage, database, or network side effect. */
export function planAcceptedImageIngest(candidate, catalog, request, receipt, bytes) {
  const recreated = acceptLocalImage(request, receipt, bytes, candidate?.review)
  demand(pocDigest(candidate) === pocDigest(recreated), 'CANDIDATE_TAMPERED_OR_FILE_CHANGED')
  validateVisualCatalog(catalog)
  exactKeys(candidate, ['version', 'chronicle_id', 'worldline_id', 'visibility', 'request_id', 'receipt_id',
    'point_id', 'generation_key', 'source_revision', 'tool_result_id', 'file', 'review', 'status',
    'storage_status', 'publication_status', 'storage_object_path', 'public_url', 'storage_writes',
    'database_writes', 'candidate_id'])
  const { candidate_id, ...body } = candidate
  demand(candidate.version === 'accepted-local-image-v1' && candidate_id === `candidate-${pocDigest(body)}`
    && candidate.status === 'ACCEPTED_LOCAL_CANDIDATE' && candidate.storage_status === 'NOT_STORED'
    && candidate.publication_status === 'NOT_PUBLISHED' && candidate.storage_object_path === null
    && candidate.public_url === null && candidate.storage_writes === 0 && candidate.database_writes === 0,
  'CANDIDATE_NOT_LOCAL_ONLY')
  demand(catalog?.version === 'visual-catalog-v1' && catalog.chronicle_id === candidate.chronicle_id
    && catalog.worldline_id === candidate.worldline_id && catalog.visibility === 'PUBLIC_ARCHIVE', 'CATALOG_SCOPE_MISMATCH')
  const point = catalog.points?.find((item) => item.point_id === candidate.point_id)
  demand(point?.status === 'READY' && point.generation_key === candidate.generation_key
    && point.visibility === 'PUBLIC_ARCHIVE' && point.point_type === 'CHARACTER', 'CANDIDATE_REVISION_NOT_CURRENT')
  const bodyPlan = {
    version: 'accepted-image-ingest-plan-v1', candidate_id, point_id: candidate.point_id,
    generation_key: candidate.generation_key, sha256: candidate.file.sha256, mime_type: candidate.file.mime_type,
    asset_type: point.asset_type, subject_id: point.subject_id, registry_asset_id: point.registry_asset_id,
    state: 'AWAITING_DURABLE_STORAGE_AND_REGISTRY_BINDING', execution_enabled: false,
    storage_writes: 0, database_writes: 0, site_publications: 0,
  }
  return { ...bodyPlan, plan_id: `ingest-${pocDigest(bodyPlan)}` }
}
