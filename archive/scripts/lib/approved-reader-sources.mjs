/** Public cold-archive input, not a projection of arbitrary live/GM tables. */
import { createHash } from 'node:crypto'
import { splitRoleBlocks } from './reader-transform.mjs'
const hash = (v) => createHash('sha256').update(v).digest('hex')
const demand = (c) => { if (!c) throw new Error('INVALID_APPROVED_READER_SOURCE') }
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const uuid = (v) => typeof v === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
function validTime(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return false
  const d = new Date(v.replace(' ', 'T') + ':00Z')
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 16).replace('T', ' ') === v
}

/** Unapproved seasons are not scanned as narratives. Approved malformed input fails closed. */
export async function approvedSeasonCatalog(manifest, seasonId, { read, listParts }) {
  if (manifest.visibility !== 'PUBLIC_ARCHIVE') return []
  demand(manifest.chronicle_id === 'C03-AFTERFALL' && manifest.worldline_id === 'AFTERFALL')
  demand(/^S\d{2,3}$/.test(seasonId) && manifest.season_id === seasonId)
  demand(manifest.archive_class === 'COLD_RAW' && Array.isArray(manifest.sessions))
  demand(new Set(manifest.sessions.map((s) => s.session_id)).size === manifest.sessions.length)
  const result = []
  const nextSegmentOrder = new Map(), segmentIds = new Set(), candidateIds = new Set()
  for (const session of manifest.sessions) {
    demand(/^SESSION_\d{3}$/.test(session.session_id))
    if (session.visibility !== 'PUBLIC_ARCHIVE') continue
    // A fragment never becomes a complete story merely because a manifest claims it is public.
    if (session.capture_quality === 'PARTIAL_CAPTURE_INCOMPLETE_PAIRING' && session.atomic_pairing_complete === false) continue
    demand(session.capture_quality === 'VERIFIED_CONTIGUOUS_TURN_PAIRS' && session.atomic_pairing_complete === true)
    const prefix = `archive/content/transcripts/C03-AFTERFALL/${seasonId}/${session.session_id}`
    demand(session.source_manifest === `${session.session_id}/SOURCE_MANIFEST.json`)
    const sourceManifestRef = `${prefix}/SOURCE_MANIFEST.json`
    const manifestBytes = await read(sourceManifestRef)
    const source = JSON.parse(manifestBytes.toString('utf8'))
    demand(source.chronicle_id === manifest.chronicle_id && source.worldline_id === manifest.worldline_id && source.season_id === seasonId && source.session_id === session.session_id)
    demand(source.visibility === 'PUBLIC_ARCHIVE' && source.public_safe_only === true)
    const segmented = Object.hasOwn(session, 'segment_id') || Object.hasOwn(source, 'segment_id')
    if (segmented) {
      const order = source.source_message_order
      demand(source.source_type === 'SUPABASE_ROLLING_RAW'
        && source.segment_status === 'SEALED' && source.publication_allowed === true
        && ['OPEN', 'CLOSED'].includes(source.source_session_status)
        && (source.source_session_status !== 'OPEN' || !source.closed_at)
        && typeof source.approval_provenance_ref === 'string'
        && /^[-A-Za-z0-9_./:#]{1,300}$/.test(source.approval_provenance_ref)
        && uuid(source.source_session_uuid)
        && /^segment-[a-f0-9]{64}$/.test(source.segment_id)
        && /^candidate-[a-f0-9]{64}$/.test(source.candidate_id)
        && digest(source.source_digest)
        && Number.isSafeInteger(source.source_save_version) && source.source_save_version > 0
        && source.source_session_uuid === session.source_session_uuid
        && source.segment_id === session.segment_id
        && source.candidate_id === session.candidate_id
        && (!Object.hasOwn(session, 'segment_status') || session.segment_status === source.segment_status)
        && (!Object.hasOwn(session, 'publication_allowed')
          || session.publication_allowed === source.publication_allowed)
        && (!Object.hasOwn(session, 'approval_provenance_ref')
          || session.approval_provenance_ref === source.approval_provenance_ref)
        && (!Object.hasOwn(session, 'source_session_status')
          || session.source_session_status === source.source_session_status)
        && Number.isSafeInteger(order?.start) && order.start >= 0 && order.start % 2 === 0
        && Number.isSafeInteger(order?.end) && order.end >= order.start && order.end % 2 === 1
        && order.start === session.source_message_order?.start
        && order.end === session.source_message_order?.end
        && order.start === (nextSegmentOrder.get(source.source_session_uuid) ?? 0)
        && !segmentIds.has(source.segment_id) && !candidateIds.has(source.candidate_id))
      nextSegmentOrder.set(source.source_session_uuid, order.end + 1)
      segmentIds.add(source.segment_id); candidateIds.add(source.candidate_id)
    } else demand(source.closed_at)
    demand(source.atomic_pairing_complete === true && source.capture_quality === session.capture_quality)
    const range = source.captured_message_range
    demand(source.coverage_basis === 'captured_message_range' && session.coverage_basis === 'captured_message_range')
    demand(validTime(range?.start) && validTime(range?.end) && range.start <= range.end)
    demand(range.start === session.captured_message_range?.start && range.end === session.captured_message_range?.end)
    const counts = source.counts
    demand(Number.isSafeInteger(counts?.user) && counts.user > 0 && counts.user === counts.gm && counts.total === 2 * counts.user)
    demand(session.user_messages === counts.user && session.gm_public_blocks === counts.gm && (counts.assistant_public_meta ?? 0) === 0)
    if (segmented) demand(source.source_message_order.end - source.source_message_order.start + 1 === counts.total)
    demand(Array.isArray(source.content_sha256) && source.content_sha256.length === counts.total)
    demand(source.content_sha256.every((h, i) => h.message_order === i && h.role === (i % 2 ? 'GM' : 'USER') && digest(h.sha256)))
    demand(source.message_order?.min === 0 && source.message_order?.max === counts.total - 1 && source.message_order.contiguous === true)
    demand(Array.isArray(source.parts) && source.parts.length > 0 && new Set(source.parts).size === source.parts.length)
    if (segmented) demand(source.parts.length === 1 && source.parts[0] === 'PART_001.md')
    demand(source.parts.every((name) => /^PART_\d{3}\.md$/.test(name)))
    demand(JSON.stringify([...source.parts].sort()) === JSON.stringify((await listParts(prefix)).sort()))
    demand(source.parts_sha256 && JSON.stringify(Object.keys(source.parts_sha256).sort()) === JSON.stringify([...source.parts].sort()))
    const roles = []
    for (const part of [...source.parts].sort()) {
      const archivePath = `${prefix}/${part}`
      const bytes = await read(archivePath)
      demand(digest(source.parts_sha256[part]) && bytes.length > 0 && hash(bytes) === source.parts_sha256[part])
      roles.push(...splitRoleBlocks(bytes.toString('utf8')).map((block) => block.header))
      result.push({
        archivePath, canonicalRef: `worldlines/AFTERFALL/seasons/${seasonId}/raw_transcript/${session.session_id}/${part}`,
        group: seasonId, title: '공개 플레이 기록',
        autoPublication: { visibility: 'PUBLIC_ARCHIVE', sessionId: session.session_id, part, sourceManifestRef,
          sourceManifestSha256: hash(manifestBytes), rawSha256: hash(bytes), capturedRange: { ...range },
          ...(segmented ? { segmentId: source.segment_id, candidateId: source.candidate_id,
            sourceSessionUuid: source.source_session_uuid,
            sourceMessageOrder: { ...source.source_message_order },
            approvalProvenanceRef: source.approval_provenance_ref } : {}) },
      })
    }
    demand(roles.length === counts.total && roles.every((header, i) => header.role === (i % 2 ? 'GM' : 'USER') && Number(header.messageLabel) === i))
  }
  return result
}
