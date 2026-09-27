/** Verify exported bodies against a sealed metadata range and build one RAW candidate in memory.
 * This function has no publication authority and performs no I/O.
 */
import { createHash } from 'node:crypto'
import { extractReaderNarrative, splitRoleBlocks } from './reader-transform.mjs'
import { sealPublicationSegment } from './publication-segment.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const demand = (ok, code) => { if (!ok) throw new Error(code) }
const keys = (value, names) => demand(value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && Object.keys(value).every((key) => names.includes(key)),
'INVALID_MATERIALIZED_ROW')

export function materializePublicationSegment(snapshot, rows) {
  const segment = sealPublicationSegment(snapshot)
  demand(Array.isArray(rows) && rows.length === snapshot.messages.length, 'MATERIALIZED_RANGE_MISMATCH')
  let totalBytes = 0
  const blocks = []
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index], expected = snapshot.messages[index]
    keys(row, ['message_id', 'content'])
    demand(row.message_id === expected.message_id && typeof row.content === 'string'
      && row.content.trim().length > 0 && !row.content.includes('\0'), 'MATERIALIZED_ROW_IDENTITY_MISMATCH')
    const bytes = Buffer.from(row.content, 'utf8')
    totalBytes += bytes.length
    demand(bytes.length <= 200_000 && totalBytes <= 2_000_000, 'MATERIALIZED_BODY_TOO_LARGE')
    demand(hash(bytes) === expected.content_sha256, 'MATERIALIZED_CONTENT_HASH_MISMATCH')
    blocks.push(`## ${expected.role} ${String(index).padStart(3, '0')}\n\n${row.content}`)
  }
  const partBytes = Buffer.from(blocks.join('\n\n') + '\n', 'utf8')
  const parsed = splitRoleBlocks(partBytes.toString('utf8'))
  demand(parsed.length === rows.length && parsed.every((block, index) =>
    block.header.role === snapshot.messages[index].role
    && Number(block.header.messageLabel) === index
    && block.body === rows[index].content.trim()), 'RAW_ROLE_HEADER_COLLISION')
  const readerPreview = extractReaderNarrative(partBytes.toString('utf8'), { details: true })
  const candidate = {
    version: 'publication-segment-raw-candidate-v1', chronicle_id: segment.chronicle_id,
    worldline_id: segment.worldline_id, season_id: segment.season_id,
    source_session_uuid: segment.session_id, source_session_status: segment.session_status,
    segment_id: segment.segment_id, semantic_batch_id: segment.semantic_batch_id,
    source_digest: segment.source_digest, source_message_order: {
      start: segment.snapshot_start_order, end: segment.snapshot_end_order,
    },
    part_name: 'PART_001.md', part_sha256: hash(partBytes),
    content_sha256: snapshot.messages.map((message, index) => ({
      source_message_order: message.message_order, local_message_order: index,
      role: message.role, sha256: message.content_sha256,
    })),
    visibility: 'PENDING_PUBLIC_APPROVAL', publication_allowed: false,
  }
  return { candidate, partBytes, report: { segment_id: segment.segment_id,
    source_session_status: segment.session_status, message_count: rows.length,
    content_bytes: totalBytes, part_sha256: candidate.part_sha256,
    reader_preview_status: readerPreview.body ? 'UNAPPROVED_TEXT_PREVIEW' : 'NO_NARRATIVE_IN_RANGE',
    reader_preview_sha256: readerPreview.body ? hash(readerPreview.body) : null,
    reader_preview_gm_blocks: readerPreview.gmBlocks,
    publication_allowed: false, files_written: 0, database_writes: 0, site_publications: 0 } }
}
