import { createHash } from 'node:crypto'
import { splitRoleBlocks } from './reader-transform.mjs'

const fail = (code) => { throw new Error(code) }
const requireThat = (condition, code) => { if (!condition) fail(code) }
const sha = (value) => createHash('sha256').update(value).digest('hex')
const sourceId = '8ef127f7-4729-4161-9784-49123171ad2a'
export const DAILY_SOURCE_SESSION = sourceId

export function publishedWatermark(manifest, sources) {
  requireThat(manifest?.chronicle_id === 'C03-AFTERFALL' && manifest.worldline_id === 'AFTERFALL'
    && manifest.season_id === 'S03' && manifest.visibility === 'PUBLIC_ARCHIVE'
    && Array.isArray(manifest.sessions), 'INVALID_PUBLISHED_MANIFEST')
  const segments = manifest.sessions.filter((item) => item.source_session_uuid === sourceId)
    .sort((a, b) => a.source_message_order.min - b.source_message_order.min)
  requireThat(segments.length > 0, 'MISSING_PUBLISHED_SOURCE')
  const ids = new Set()
  let last = null
  for (const item of segments) {
    const range = item.source_message_order
    requireThat(/^SESSION_\d{3}$/.test(item.session_id) && !ids.has(item.session_id)
      && item.visibility === 'PUBLIC_ARCHIVE' && item.atomic_pairing_complete === true
      && range?.contiguous === true && Number.isSafeInteger(range.min)
      && Number.isSafeInteger(range.max) && range.min % 2 === 0
      && range.max % 2 === 1 && range.max >= range.min
      && (last === null || range.min === last + 1), 'PUBLISHED_SEGMENT_GAP_OR_COLLISION')
    ids.add(item.session_id)
    const source = sources.get(item.session_id)
    requireThat(source?.source_session_uuid === sourceId && source.session_id === item.session_id
      && source.source_message_order?.min === range.min
      && source.source_message_order?.max === range.max
      && source.parts?.length === 1 && source.parts[0] === 'PART_001.md', 'PUBLISHED_SOURCE_IDENTITY_MISMATCH')
    last = range.max
  }
  return { nextOrder: last + 1, nextSessionId: `SESSION_${String(Math.max(...manifest.sessions.map((s) => Number(s.session_id?.slice(8)))) + 1).padStart(3, '0')}` }
}

export function discoverCompletePairs(session, rows, nextOrder) {
  requireThat(session?.id === sourceId && session.worldline_id === 'AFTERFALL'
    && session.chronicle_id === 'C03' && session.season_id === 'S03'
    && ['OPEN', 'CLOSED'].includes(session.status) && Number.isSafeInteger(session.last_message_order), 'SOURCE_NAMESPACE_MISMATCH')
  requireThat(nextOrder >= 0 && nextOrder % 2 === 0, 'INVALID_WATERMARK')
  if (session.last_message_order < nextOrder) return { status: 'NO_NEW_SOURCE', rows: [] }
  requireThat(Array.isArray(rows) && rows.length === session.last_message_order - nextOrder + 1
    && rows.length <= 200, 'SOURCE_RANGE_GAP_OR_TOO_LARGE')
  const selected = []
  for (const [index, row] of rows.entries()) {
    const order = nextOrder + index
    requireThat(row.message_order === order && row.session_id === sourceId
      && row.worldline_id === 'AFTERFALL' && row.chronicle_id === 'C03'
      && row.season_id === 'S03' && row.role === (index % 2 ? 'GM' : 'USER')
      && row.public_safe === true && row.source_type === 'LIVE'
      && typeof row.content === 'string' && row.content.trim().length > 0
      && !row.content.includes('\0') && Buffer.byteLength(row.content) <= 200_000
      && !/(?:\bgm_state\b|\bhidden_state\b|<\/?(?:tool|system|developer)\b|\[tool(?:_call|_result)?\])/i.test(row.content)
      && /^[a-f0-9]{64}$/.test(row.content_sha256)
      && sha(Buffer.from(row.content, 'utf8')) === row.content_sha256
      && Number.isSafeInteger(row.turn_no), 'UNSAFE_OR_INVALID_SOURCE_ROW')
    if (index % 2 === 1) {
      requireThat(row.turn_no === rows[index - 1].turn_no
        && (index === 1 || row.turn_no === rows[index - 2].turn_no + 1), 'SOURCE_TURN_PAIR_MISMATCH')
    }
    if (index % 2 === 0 && index === rows.length - 1) break // Incomplete USER tail stays unpublished.
    selected.push(row)
  }
  if (!selected.length) return { status: 'NO_NEW_SOURCE', rows: [] }
  requireThat(selected.length % 2 === 0, 'INCOMPLETE_PAIR_SELECTED')
  return { status: 'NEW_SOURCE_RANGE', startOrder: nextOrder,
    endOrder: selected.at(-1).message_order, pairs: selected.length / 2, rows: selected }
}

export function materializeSegment({ session, discovery, sessionId, links = [], sealedAt }) {
  requireThat(discovery.status === 'NEW_SOURCE_RANGE' && /^SESSION_\d{3}$/.test(sessionId), 'INVALID_NEW_SEGMENT')
  const rows = discovery.rows, start = discovery.startOrder, end = discovery.endOrder
  const linked = new Map(links.map((item) => [item.turn_no, item]))
  requireThat(linked.size === links.length && links.every((link) => {
    const pair = rows.find((row) => row.turn_no === link.turn_no && row.role === 'GM')
    return pair && link.gm_message_id === pair.id && link.linked_save_version === pair.save_version
  }), 'INVALID_OPTIONAL_STATE_LINK')
  const blocks = rows.map((row, index) => `## ${row.role} ${String(index).padStart(3, '0')}\n\n${row.content}`)
  const preface = `# Chronicle 03 / AFTERFALL / S03 — daily RAW ${sessionId}\n\nSource session UUID: \`${sourceId}\` (${session.status} at capture).\nOriginal message orders: **${start}–${end}**. Archive labels 000–${String(rows.length - 1).padStart(3, '0')} map to those orders in SOURCE_MANIFEST.json.\nContent below is verbatim from public_safe USER/GM rows; headers and this note are archive metadata.\n\n`
  const part = Buffer.from(preface + blocks.join('\n\n') + '\n', 'utf8')
  const parsed = splitRoleBlocks(part.toString('utf8'))
  requireThat(parsed.length === rows.length && parsed.every((block, index) =>
    block.header.role === rows[index].role && Number(block.header.messageLabel) === index
    && block.body === rows[index].content.trim()), 'RAW_HEADER_COLLISION')
  const range = { start: rows[0].game_time, end: rows.at(-1).game_time }
  requireThat(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(range.start)
    && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(range.end) && range.start <= range.end,
  'INVALID_CAPTURE_TIME')
  const segmentId = `segment-${sha(JSON.stringify({ sourceId, start, end, hashes: rows.map((row) => row.content_sha256) }))}`
  const entry = {
    session_id: sessionId, source_type: 'SUPABASE_ROLLING_RAW_SEGMENT', source_session_uuid: sourceId,
    visibility: 'PUBLIC_ARCHIVE', status: 'PARTIAL', capture_quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS',
    atomic_pairing_complete: true, source_manifest: `${sessionId}/SOURCE_MANIFEST.json`,
    coverage_basis: 'captured_message_range', captured_message_range: range,
    source_message_order: { min: start, max: end, contiguous: true, archive_offset: start },
    user_messages: discovery.pairs, gm_public_blocks: discovery.pairs,
  }
  const source = {
    chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', protagonist: '서진우', season_id: 'S03',
    session_id: sessionId, publication_segment_id: segmentId,
    source_type: entry.source_type, source_session_uuid: sourceId,
    source_session_status_at_capture: session.status, visibility: 'PUBLIC_ARCHIVE', archive_class: 'COLD_RAW',
    public_safe_only: true, status: 'PARTIAL', capture_quality: entry.capture_quality,
    atomic_pairing_complete: true, coverage_basis: entry.coverage_basis,
    captured_message_range: range, source_message_order: entry.source_message_order,
    closed_at: sealedAt, closure_meaning: 'This publication segment is sealed; the source DB session may remain OPEN.',
    counts: { user: discovery.pairs, gm: discovery.pairs, total: rows.length, assistant_public_meta: 0 },
    message_order: { min: 0, max: rows.length - 1, contiguous: true },
    parts: ['PART_001.md'], parts_sha256: { 'PART_001.md': sha(part) },
    content_sha256: rows.map((row, index) => ({ message_order: index, source_message_order: row.message_order,
      turn_no: row.turn_no, role: row.role, sha256: row.content_sha256,
      ...(row.save_version == null ? {} : { save_version: row.save_version }),
      source_type: row.source_type,
      ...(linked.has(row.turn_no) && row.role === 'GM' ? { state_link: { outcome: linked.get(row.turn_no).outcome,
        linked_save_version: linked.get(row.turn_no).linked_save_version } } : {}),
    })),
    source_policy: 'Exact public_safe USER/GM content, contiguous complete pairs. State links are optional provenance.',
  }
  return { part, entry, source, segmentId }
}
