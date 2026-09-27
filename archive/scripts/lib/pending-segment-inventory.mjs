/** Reconcile a private sealed segment against prior segment identities.
 * Returns metadata only: no approval, body, filesystem, database or site write.
 */
import { createHash } from 'node:crypto'
import { splitRoleBlocks } from './reader-transform.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const uuid = (value) => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const demand = (ok, code) => { if (!ok) throw new Error(code) }
function exact(value, names, code) {
  demand(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === names.length
    && Object.keys(value).every((key) => names.includes(key)), code)
}
function validTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) return false
  const date = new Date(value.replace(' ', 'T') + ':00Z')
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 16).replace('T', ' ') === value
}
const orderKeys = ['start', 'end']
function validOrder(value) {
  exact(value, orderKeys, 'INVALID_SOURCE_ORDER')
  demand(Number.isSafeInteger(value.start) && value.start >= 0 && value.start % 2 === 0
    && Number.isSafeInteger(value.end) && value.end >= value.start && value.end % 2 === 1
    && value.end - value.start + 1 <= 10000, 'INVALID_SOURCE_ORDER')
}
function checkCandidate(candidate, partBytes) {
  exact(candidate, ['version', 'chronicle_id', 'worldline_id', 'season_id',
    'source_session_uuid', 'source_session_status', 'segment_id', 'semantic_batch_id',
    'source_digest', 'source_message_order', 'captured_message_range', 'source_save_version',
    'capture_quality', 'atomic_pairing_complete', 'counts', 'part_name', 'part_sha256',
    'content_sha256', 'visibility', 'publication_allowed', 'candidate_id'],
  'INVALID_SEGMENT_CANDIDATE')
  demand(candidate.version === 'publication-segment-raw-candidate-v1'
    && candidate.chronicle_id === 'C03-AFTERFALL' && candidate.worldline_id === 'AFTERFALL'
    && /^S\d{2,3}$/.test(candidate.season_id)
    && uuid(candidate.source_session_uuid)
    && ['OPEN', 'CLOSED'].includes(candidate.source_session_status)
    && /^segment-[a-f0-9]{64}$/.test(candidate.segment_id)
    && /^batch-[a-f0-9]{64}$/.test(candidate.semantic_batch_id)
    && digest(candidate.source_digest), 'INVALID_SEGMENT_CANDIDATE')
  validOrder(candidate.source_message_order)
  exact(candidate.captured_message_range, ['start', 'end'], 'INVALID_CAPTURED_RANGE')
  demand(validTime(candidate.captured_message_range.start)
    && validTime(candidate.captured_message_range.end)
    && candidate.captured_message_range.start <= candidate.captured_message_range.end,
  'INVALID_CAPTURED_RANGE')
  exact(candidate.counts, ['user', 'gm', 'total'], 'INVALID_SEGMENT_COUNTS')
  const count = candidate.source_message_order.end - candidate.source_message_order.start + 1
  demand(candidate.counts.total === count && candidate.counts.user === count / 2
    && candidate.counts.gm === count / 2
    && Number.isSafeInteger(candidate.source_save_version) && candidate.source_save_version > 0
    && candidate.capture_quality === 'VERIFIED_CONTIGUOUS_TURN_PAIRS'
    && candidate.atomic_pairing_complete === true
    && candidate.visibility === 'PENDING_PUBLIC_APPROVAL'
    && candidate.publication_allowed === false, 'INVALID_SEGMENT_COUNTS')
  demand(candidate.part_name === 'PART_001.md' && digest(candidate.part_sha256)
    && Buffer.isBuffer(partBytes) && partBytes.length > 0 && partBytes.length <= 2_500_000
    && hash(partBytes) === candidate.part_sha256, 'SEGMENT_PART_HASH_MISMATCH')
  demand(Array.isArray(candidate.content_sha256) && candidate.content_sha256.length === count
    && candidate.content_sha256.every((entry, index) => {
      try { exact(entry, ['source_message_order', 'local_message_order', 'role', 'sha256'],
        'INVALID_SEGMENT_CONTENT_HASH') } catch { return false }
      return entry.source_message_order === candidate.source_message_order.start + index
        && entry.local_message_order === index && entry.role === (index % 2 ? 'GM' : 'USER')
        && digest(entry.sha256)
    }), 'INVALID_SEGMENT_CONTENT_HASH')
  const blocks = splitRoleBlocks(partBytes.toString('utf8'))
  demand(blocks.length === count && blocks.every((block, index) =>
    block.header.role === (index % 2 ? 'GM' : 'USER')
    && Number(block.header.messageLabel) === index), 'SEGMENT_PART_ROLE_MISMATCH')
  const expectedId = `candidate-${hash(JSON.stringify({ segment_id: candidate.segment_id,
    part_sha256: candidate.part_sha256,
    captured_message_range: candidate.captured_message_range,
    source_save_version: candidate.source_save_version }))}`
  demand(candidate.candidate_id === expectedId, 'SEGMENT_CANDIDATE_ID_MISMATCH')
}

/** `existing` is a reviewed segment inventory; reserved IDs include other season entries. */
export function planPendingSegment(candidate, partBytes, existing, reservedSessionIds = []) {
  checkCandidate(candidate, partBytes)
  demand(Array.isArray(existing) && existing.length <= 999
    && Array.isArray(reservedSessionIds) && reservedSessionIds.length <= 999
    && reservedSessionIds.every((id) => typeof id === 'string' && /^SESSION_\d{3}$/.test(id))
    && new Set(reservedSessionIds).size === reservedSessionIds.length,
  'INVALID_SEGMENT_INVENTORY')
  const sessionIds = new Set(), segmentIds = new Set(), candidateIds = new Set()
  const ranges = new Map()
  let maxSession = Math.max(0, ...reservedSessionIds.map((id) => Number(id.slice(8))))
  let same = null, latestSameSessionEnd = -1
  for (const entry of existing) {
    exact(entry, ['chronicle_id', 'worldline_id', 'season_id', 'session_id',
      'source_session_uuid', 'source_message_order',
      'segment_id', 'candidate_id', 'part_sha256'], 'INVALID_SEGMENT_INVENTORY')
    demand(entry.chronicle_id === candidate.chronicle_id
      && entry.worldline_id === candidate.worldline_id
      && entry.season_id === candidate.season_id
      && /^SESSION_\d{3}$/.test(entry.session_id) && uuid(entry.source_session_uuid)
      && /^segment-[a-f0-9]{64}$/.test(entry.segment_id)
      && /^candidate-[a-f0-9]{64}$/.test(entry.candidate_id)
      && digest(entry.part_sha256), 'INVALID_SEGMENT_INVENTORY')
    validOrder(entry.source_message_order)
    demand(!sessionIds.has(entry.session_id) && !segmentIds.has(entry.segment_id)
      && !candidateIds.has(entry.candidate_id),
      'DUPLICATE_SEGMENT_INVENTORY')
    sessionIds.add(entry.session_id); segmentIds.add(entry.segment_id)
    candidateIds.add(entry.candidate_id)
    const prior = ranges.get(entry.source_session_uuid) ?? []
    prior.push(entry.source_message_order)
    ranges.set(entry.source_session_uuid, prior)
    maxSession = Math.max(maxSession, Number(entry.session_id.slice(8)))
    if (entry.segment_id === candidate.segment_id) {
      demand(entry.source_session_uuid === candidate.source_session_uuid
        && entry.source_message_order.start === candidate.source_message_order.start
        && entry.source_message_order.end === candidate.source_message_order.end
        && entry.candidate_id === candidate.candidate_id
        && entry.part_sha256 === candidate.part_sha256, 'SEALED_SEGMENT_CHANGED')
      same = entry
    }
    if (entry.source_session_uuid !== candidate.source_session_uuid) continue
    latestSameSessionEnd = Math.max(latestSameSessionEnd, entry.source_message_order.end)
    const overlap = entry.source_message_order.start <= candidate.source_message_order.end
      && candidate.source_message_order.start <= entry.source_message_order.end
    demand(!overlap || entry.segment_id === candidate.segment_id, 'SOURCE_RANGE_COLLISION')
  }
  for (const sessionRanges of ranges.values()) {
    sessionRanges.sort((a, b) => a.start - b.start)
    demand(sessionRanges.every((range, index) => index === 0
      || range.start > sessionRanges[index - 1].end), 'CORRUPT_SEGMENT_INVENTORY')
  }
  if (same) return { status: 'NOOP_ALREADY_RECORDED', session_id: same.session_id,
    candidate_id: candidate.candidate_id, publication_allowed: false, files_written: 0 }
  demand(candidate.source_message_order.start > latestSameSessionEnd,
    'BACKFILL_REQUIRES_REVIEW')
  demand(candidate.source_message_order.start === latestSameSessionEnd + 1,
    'SOURCE_ORDER_GAP_REQUIRES_REVIEW')
  demand(maxSession < 999, 'SESSION_ID_SPACE_EXHAUSTED')
  const sessionId = `SESSION_${String(maxSession + 1).padStart(3, '0')}`
  const prefix = `archive/content/transcripts/C03-AFTERFALL/${candidate.season_id}/${sessionId}`
  const sourceManifest = {
    chronicle_id: candidate.chronicle_id, worldline_id: candidate.worldline_id,
    season_id: candidate.season_id, session_id: sessionId,
    source_type: 'SUPABASE_ROLLING_RAW', source_session_uuid: candidate.source_session_uuid,
    source_session_status: candidate.source_session_status,
    segment_id: candidate.segment_id, candidate_id: candidate.candidate_id,
    source_digest: candidate.source_digest, source_message_order: { ...candidate.source_message_order },
    source_save_version: candidate.source_save_version, segment_status: 'SEALED',
    visibility: 'PENDING_PUBLIC_APPROVAL', public_safe_only: true,
    capture_quality: candidate.capture_quality, atomic_pairing_complete: true,
    coverage_basis: 'captured_message_range',
    captured_message_range: { ...candidate.captured_message_range },
    counts: { ...candidate.counts },
    message_order: { min: 0, max: candidate.counts.total - 1, contiguous: true },
    content_sha256: candidate.content_sha256.map((entry) => ({
      message_order: entry.local_message_order, role: entry.role, sha256: entry.sha256 })),
    parts: [candidate.part_name], parts_sha256: { [candidate.part_name]: candidate.part_sha256 },
    approval_provenance_ref: null, publication_allowed: false,
  }
  return { status: 'PENDING_PUBLIC_APPROVAL', session_id: sessionId,
    source_manifest_ref: `${prefix}/SOURCE_MANIFEST.json`, part_ref: `${prefix}/${candidate.part_name}`,
    source_manifest_candidate: sourceManifest, publication_allowed: false, files_written: 0 }
}
