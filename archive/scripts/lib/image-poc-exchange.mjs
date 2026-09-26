/** Step 6: offline experiment request/observation, never an image-generation API. */
import { createHash } from 'node:crypto'
import { open, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'

const LIMIT_BYTES = 20 * 1024 * 1024
const demand = (v, code) => { if (!v) throw new Error(code) }
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype
const keys = (v, allowed) => demand(object(v) && Object.keys(v).every((k) => allowed.includes(k)), 'UNEXPECTED_POC_FIELD')
const hex = (v, prefix = '') => typeof v === 'string' && new RegExp(`^${prefix}[a-f0-9]{64}$`).test(v)
function ordered(v) {
  if (Array.isArray(v)) return v.map(ordered)
  if (object(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordered(v[k])]))
  demand(v === null || ['string', 'boolean'].includes(typeof v) || typeof v === 'number' && Number.isFinite(v), 'NON_JSON_POC')
  return v
}
export const pocDigest = (v) => createHash('sha256').update(JSON.stringify(ordered(v))).digest('hex')
const hashBytes = (v) => createHash('sha256').update(v).digest('hex')

/** The caller first validates the full Step 5 catalog. No permission to spend or execute is returned. */
export function makeImagePocRequest(point, { batch_id, source_revision }) {
  demand(point?.visibility === 'PUBLIC_ARCHIVE' && point.status === 'READY' && point.brief, 'POINT_NOT_PUBLIC_READY')
  demand(hex(point.point_id, 'point-') && point.point_type === 'CHARACTER' && point.brief.point_type === 'CHARACTER', 'POC_PORTRAIT_ONLY')
  demand(point.brief.subject?.node_id === point.subject_id && /^char-[a-z0-9-]+$/.test(point.subject_id), 'POC_SUBJECT_MISMATCH')
  demand(point.generation_key === `generation-${pocDigest(point.brief)}`, 'BRIEF_DIGEST_MISMATCH')
  demand(point.brief.art_direction?.style_version === 'AFTERFALL_ARCHIVE_V1', 'POC_STYLE_MISMATCH')
  demand(hex(batch_id, 'batch-') && typeof source_revision === 'string' && /^[a-f0-9]{40}$/.test(source_revision), 'POC_SOURCE_NOT_PINNED')
  const body = {
    version: 'chatgpt-image-poc-request-v1', chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL',
    visibility: 'PUBLIC_ARCHIVE', batch_id, source_revision, point_id: point.point_id,
    generation_key: point.generation_key, subject_id: point.subject_id,
    intended_brief: structuredClone(point.brief), intended_output: { images: 1, aspect_ratio: '1:1', embedded_text: false },
    instruction_delivery: 'CONVERSATION_CONTEXT_NOT_CONFIRMED_PROVIDER_PROMPT',
    execution_authorized: false, paid_api_enabled: false, scheduled_execution_enabled: false,
  }
  return { ...body, request_id: `request-${pocDigest(body)}` }
}
export function validateImagePocRequest(request) {
  keys(request, ['version', 'chronicle_id', 'worldline_id', 'visibility', 'batch_id', 'source_revision', 'point_id', 'generation_key', 'subject_id', 'intended_brief', 'intended_output', 'instruction_delivery', 'execution_authorized', 'paid_api_enabled', 'scheduled_execution_enabled', 'request_id'])
  const recreated = makeImagePocRequest({ visibility: request.visibility, status: 'READY', point_type: request.intended_brief?.point_type,
    point_id: request.point_id, generation_key: request.generation_key, subject_id: request.subject_id, brief: request.intended_brief }, request)
  demand(pocDigest(request) === pocDigest(recreated), 'POC_REQUEST_CHANGED')
}
function crc32(bytes) {
  let crc = 0xffffffff
  for (const value of bytes) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) }
  return (crc ^ 0xffffffff) >>> 0
}
/** Container/CRC checks only, NOT pixel decoding, visual QA or a publish permission. */
export function inspectPng(bytes) {
  demand(Buffer.isBuffer(bytes) && bytes.length > 44 && bytes.length <= LIMIT_BYTES, 'POC_IMAGE_SIZE_INVALID')
  demand(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'POC_EXPECTED_PNG')
  let offset = 8, width, height, idat = false, ended = false, chunks = 0
  while (offset < bytes.length) {
    demand(offset + 12 <= bytes.length && ++chunks <= 10000, 'PNG_CHUNK_TRUNCATED')
    const size = bytes.readUInt32BE(offset), end = offset + 12 + size
    demand(end <= bytes.length, 'PNG_CHUNK_TRUNCATED')
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    demand(/^[A-Za-z]{4}$/.test(type) && crc32(bytes.subarray(offset + 4, end - 4)) === bytes.readUInt32BE(end - 4), 'PNG_CRC_INVALID')
    if (offset === 8) {
      demand(type === 'IHDR' && size === 13, 'PNG_HEADER_INVALID')
      width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12)
      demand(width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 20_000_000, 'PNG_DIMENSIONS_INVALID')
    } else demand(type !== 'IHDR', 'PNG_DUPLICATE_HEADER')
    if (type === 'IDAT') { demand(size > 0, 'PNG_EMPTY_IMAGE_DATA'); idat = true }
    if (type === 'IEND') { demand(size === 0 && end === bytes.length && idat, 'PNG_END_INVALID'); ended = true }
    offset = end
  }
  demand(ended, 'PNG_MISSING_END')
  return { format: 'PNG', mime_type: 'image/png', bytes: bytes.length, width, height, sha256: hashBytes(bytes),
    structure_check: 'SIGNATURE_CHUNKS_CRC_PASS', pixel_decode_check: 'NOT_PERFORMED_BY_THIS_MODULE' }
}

/** The association is a trusted observer's tool-event record, never inferred from filename/image text. */
export function imagePocReceipt(request, bytes, observation) {
  validateImagePocRequest(request)
  keys(observation, ['request_id', 'point_id', 'generation_key', 'tool_result_id', 'tool', 'surface', 'review'])
  demand(observation.request_id === request.request_id && observation.point_id === request.point_id
    && observation.generation_key === request.generation_key, 'POC_OBSERVATION_BINDING_MISMATCH')
  demand(typeof observation.tool_result_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(observation.tool_result_id), 'POC_MISSING_REAL_RESULT_ID')
  demand(observation.tool === 'image_gen.text2im' && observation.surface === 'CHATGPT_FOREGROUND', 'POC_UNVERIFIED_EXECUTION_SURFACE')
  demand(['NOT_REVIEWED', 'MATCHES_INTENDED_BRIEF', 'REJECTED_REQUEST_MISMATCH'].includes(observation.review), 'POC_INVALID_REVIEW')
  const file = inspectPng(bytes)
  const shape_matches = file.width === file.height
  const rejected = !shape_matches || observation.review === 'REJECTED_REQUEST_MISMATCH'
  const receipt = { version: 'chatgpt-image-poc-receipt-v1', request_id: request.request_id,
    point_id: request.point_id, generation_key: request.generation_key,
    tool_result_id: observation.tool_result_id, tool: observation.tool, surface: observation.surface,
    observed_file: file, shape_matches, content_review: observation.review,
    status: rejected ? 'QUARANTINED_NOT_AN_ASSET' : 'LOCAL_SAMPLE_REVIEW_REQUIRED',
    accepted_as_completed_asset: false, publication_allowed: false,
    unattended_generation_proven: false, cost_invoice_audited: false, model_id: null,
    provider_prompt_equality_proven: false, database_writes: 0, storage_uploads: 0, site_publications: 0 }
  return { ...receipt, receipt_id: `receipt-${pocDigest(receipt)}` }
}

/** Read only the exact observed tool path within the supplied working root. No URL or file search. */
export async function readPocImage(root, file) {
  demand(typeof root === 'string' && isAbsolute(root) && typeof file === 'string' && isAbsolute(file), 'POC_ABSOLUTE_LOCAL_PATH_REQUIRED')
  const base = resolve(root), target = resolve(file), rel = relative(base, target)
  demand(rel && rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel), 'POC_FILE_OUTSIDE_ROOT')
  demand(await realpath(base) === base && await realpath(target) === target, 'POC_SYMLINK_NOT_ALLOWED')
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    demand(before.isFile() && before.size <= LIMIT_BYTES, 'POC_FILE_NOT_BOUNDED_REGULAR_FILE')
    // Read one bounded buffer; a concurrently growing file cannot cause an unbounded read.
    const buffer = Buffer.alloc(before.size)
    let filled = 0
    while (filled < buffer.length) { const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled); demand(bytesRead > 0, 'POC_FILE_CHANGED'); filled += bytesRead }
    const after = await handle.stat()
    demand(before.size === after.size && before.mtimeMs === after.mtimeMs, 'POC_FILE_CHANGED')
    inspectPng(buffer)
    return buffer
  } finally { await handle.close() }
}
