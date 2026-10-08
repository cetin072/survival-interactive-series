/** C03 discovery: committed manifests are cursors; Runtime intent is adoption evidence. */
import { createHash } from 'node:crypto'
import { approvedSeasonCatalog } from './approved-reader-sources.mjs'

export const C03_SCOPE = Object.freeze({ chronicle_id: 'C03', worldline_id: 'AFTERFALL', archive_id: 'C03-AFTERFALL' })
export const DISCOVERY_LIMITS = Object.freeze({ sessions: 100, publishedMessages: 10000, page: 200 })
const need = (ok, code) => { if (!ok) throw new Error(code) }
export const intentDigest = (value) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex')
const uuid = (v) => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)

export function validateIntent(intent, session) {
  need(intent && Object.keys(intent).every((key) => ['version','disposition','publication','kind','history','initial_order','predecessor_id','evidence_ref','checkpoint_ref','checkpoint_revision'].includes(key))
    && intent.version === 1 && ['ADOPTED', 'SUPERSEDED', 'REVIEW_REQUIRED'].includes(intent.disposition)
    && ['APPROVED', 'REVIEW_REQUIRED'].includes(intent.publication)
    && ['CONTINUE', 'NEW_SEASON', 'RESTART', 'LEGACY'].includes(intent.kind)
    && ['NEW_CAPTURE', 'MAPPED_BASELINE', 'LEGACY'].includes(intent.history)
    && Number.isSafeInteger(intent.initial_order) && intent.initial_order >= 0 && intent.initial_order % 2 === 0
    && (intent.predecessor_id === null || uuid(intent.predecessor_id))
    && intent.predecessor_id !== session.id
    && typeof intent.evidence_ref === 'string' && /^https:\/\/github\.com\/cetin072\/survival-interactive-series\/(?:issues|pull)\/\d+$/.test(intent.evidence_ref), 'INVALID_ARCHIVE_INTENT')
  if (intent.checkpoint_ref !== undefined) need(new RegExp(`^worldlines/AFTERFALL/seasons/${session.season_id}/[A-Za-z0-9_-]+\\.md$`).test(intent.checkpoint_ref), 'INVALID_CHECKPOINT_REFERENCE')
  need((intent.checkpoint_ref === undefined && intent.checkpoint_revision === undefined)
    || (intent.checkpoint_ref !== undefined && /^[a-f0-9]{40}$/.test(intent.checkpoint_revision)), 'INVALID_CHECKPOINT_REVISION')
  return intent
}

/** read/list MUST address one immutable main revision, never the proposal worktree. */
export async function loadPublishedIndex({ read, paths, scope = C03_SCOPE }) {
  need(scope.chronicle_id === 'C03' && scope.worldline_id === 'AFTERFALL' && scope.archive_id === 'C03-AFTERFALL', 'UNAPPROVED_DISCOVERY_SCOPE')
  const prefix = `archive/content/transcripts/${scope.archive_id}/`
  const manifests = paths.filter((p) => new RegExp(`^${prefix}S\\d{2,3}/MANIFEST\\.json$`).test(p)).sort()
  const seasons = new Map(), cursors = new Map(), legacy = new Map()
  let total = 0
  for (const ref of manifests) {
    const manifest = JSON.parse((await read(ref)).toString('utf8')), season = ref.split('/').at(-2)
    need(manifest.chronicle_id === scope.archive_id && manifest.worldline_id === scope.worldline_id
      && manifest.season_id === season && Array.isArray(manifest.sessions), 'INVALID_PUBLISHED_MANIFEST')
    const ids = manifest.sessions.map((s) => s.session_id)
    need(new Set(ids).size === ids.length && ids.every((id) => /^SESSION_\d{3}$/.test(id)), 'SEGMENT_ID_COLLISION')
    seasons.set(season, { manifest, nextSessionId: `SESSION_${String(Math.max(0, ...ids.map((id) => Number(id.slice(8)))) + 1).padStart(3, '0')}` })
    // Legacy Reader input has its own established adapter. Absence of UUID mapping is not a fresh cursor.
    if (['S01', 'S02'].includes(season)) {
      for (const entry of manifest.sessions.filter((s) => s.source_session_uuid && s.source_manifest)) {
        need(entry.source_manifest === `${entry.session_id}/SOURCE_MANIFEST.json`, 'INVALID_LEGACY_SOURCE_REFERENCE')
        const source = JSON.parse((await read(`${prefix}${season}/${entry.source_manifest}`)).toString('utf8'))
        need(source.source_session_uuid === entry.source_session_uuid && source.season_id === season
          && source.chronicle_id === scope.archive_id && source.worldline_id === scope.worldline_id, 'INVALID_LEGACY_SOURCE_IDENTITY')
        legacy.set(source.source_session_uuid, { season, archive_session_id: entry.session_id,
          range: source.message_order, capture_quality: source.capture_quality })
      }
      continue
    }
    await approvedSeasonCatalog(manifest, season, { read, listParts: async (p) => paths.filter((f) => f.startsWith(`${p}/`) && /^PART_\d{3}\.md$/.test(f.slice(p.length + 1))).map((f) => f.slice(p.length + 1)) })
    for (const entry of manifest.sessions) {
      if (entry.visibility !== 'PUBLIC_ARCHIVE') continue
      need(entry.atomic_pairing_complete === true, 'LEGACY_REVIEW_REQUIRED')
      const source = JSON.parse((await read(`${prefix}${season}/${entry.session_id}/SOURCE_MANIFEST.json`)).toString('utf8'))
      const range = entry.source_message_order
      need(uuid(entry.source_session_uuid) && source.source_session_uuid === entry.source_session_uuid
        && JSON.stringify(source.source_message_order) === JSON.stringify(range)
        && Number.isSafeInteger(range?.min) && Number.isSafeInteger(range.max)
        && range.min >= 0 && range.min % 2 === 0 && range.max % 2 === 1 && range.max >= range.min
        && range.contiguous === true && source.content_sha256.length === range.max - range.min + 1,
      'INVALID_PUBLISHED_SOURCE_RANGE')
      const cursor = cursors.get(source.source_session_uuid) ?? { season, ranges: [], hashes: new Map(), nextOrder: range.min }
      need(cursor.season === season && !cursor.ranges.some((r) => r.min <= range.max && range.min <= r.max), 'PUBLISHED_RANGE_OVERLAP')
      source.content_sha256.forEach((item, i) => {
        need(item.source_message_order === range.min + i && digest(item.sha256)
          && Number.isSafeInteger(item.turn_no) && (i % 2 === 0
            ? i === 0 || item.turn_no === source.content_sha256[i - 1].turn_no + 1
            : item.turn_no === source.content_sha256[i - 1].turn_no), 'INVALID_PUBLISHED_SOURCE_HASH')
        cursor.hashes.set(item.source_message_order, item.sha256)
      })
      total += source.content_sha256.length
      need(total <= DISCOVERY_LIMITS.publishedMessages, 'PUBLISHED_AUDIT_BUDGET_REVIEW_REQUIRED')
      cursor.ranges.push({ ...range, last_turn: source.content_sha256.at(-1).turn_no,
        first_turn: source.content_sha256[0].turn_no })
      cursors.set(source.source_session_uuid, cursor)
    }
  }
  for (const cursor of cursors.values()) {
    cursor.ranges.sort((a, b) => a.min - b.min)
    need(cursor.ranges.every((r, i) => i === 0 || (r.min === cursor.ranges[i - 1].max + 1
      && r.first_turn === cursor.ranges[i - 1].last_turn + 1)), 'PUBLISHED_SOURCE_GAP')
    cursor.nextOrder = cursor.ranges.at(-1).max + 1
    cursor.lastTurn = cursor.ranges.at(-1).last_turn
  }
  const book = JSON.parse((await read(`archive/content/stories/${scope.archive_id}/BOOK.json`)).toString('utf8'))
  const frontierRef = book.chapters.at(-1)?.publicationProvenance?.sourceManifestRef
  const frontier = frontierRef ? JSON.parse((await read(frontierRef)).toString('utf8')).source_session_uuid : null
  return { seasons, cursors, legacy, frontier, latestSeason: Math.max(0, ...[...seasons.keys()].map((s) => Number(s.slice(1)))) }
}

/** No bodies, no dates used for narrative ordering, no state changes. */
export function planSourceSessions(sessions, published, { scope = C03_SCOPE } = {}) {
  need(scope.chronicle_id === 'C03' && scope.worldline_id === 'AFTERFALL', 'UNAPPROVED_DISCOVERY_SCOPE')
  need(sessions.length <= DISCOVERY_LIMITS.sessions, 'SESSION_INVENTORY_LIMIT_REVIEW_REQUIRED')
  need(new Set(sessions.map((s) => s.id)).size === sessions.length, 'SOURCE_ID_COLLISION')
  const sourceMap = new Map(sessions.map((s) => [s.id, s]))
  const plans = new Map(sessions.map((s) => {
    const cursor = published.cursors.get(s.id)
    const legacy = published.legacy?.get(s.id)
    const plan = { source_session_uuid: s.id, season_id: s.season_id, source_status: s.status,
      published_ranges: cursor?.ranges.map(({ min, max }) => [min, max]) ?? (legacy ? [[legacy.range.min, legacy.range.max]] : []),
      ...(legacy ? { legacy_archive_session: legacy.archive_session_id, legacy_capture_quality: legacy.capture_quality } : {}),
      next_order: cursor?.nextOrder ?? null, snapshot_upper: s.last_message_order,
      status: 'REVIEW_REQUIRED', blocker: 'MISSING_STRUCTURED_INTENT', intent_sha256: intentDigest(s.archive_intent) }
    if (!uuid(s.id) || s.chronicle_id !== scope.chronicle_id || s.worldline_id !== scope.worldline_id
      || !/^S\d{2,3}$/.test(s.season_id) || !['OPEN', 'CLOSED'].includes(s.status)
      || !Number.isSafeInteger(s.last_message_order) || s.last_message_order < -1) {
      plan.status = 'BLOCKED'; plan.blocker = 'SOURCE_NAMESPACE_MISMATCH'
    } else if (cursor && (cursor.season !== s.season_id || cursor.nextOrder > s.last_message_order + 1)) {
      plan.status = 'BLOCKED'; plan.blocker = 'PUBLISHED_SOURCE_REGRESSED'
    } else if (Number(s.season_id.slice(1)) <= 2 && !cursor) {
      plan.status = 'LEGACY_REVIEW_REQUIRED'; plan.blocker = 'LEGACY_MAPPING_UNVERIFIED'
    } else if (s.archive_intent) {
      try {
        const intent = validateIntent(s.archive_intent, s)
        if (intent.disposition === 'SUPERSEDED') {
          plan.status = cursor ? 'BLOCKED' : 'SUPERSEDED'; plan.blocker = cursor ? 'PUBLISHED_DISPOSITION_CONFLICT' : null
        } else if (intent.disposition === 'ADOPTED' && intent.publication === 'APPROVED') {
          if (intent.history === 'LEGACY' || intent.kind === 'LEGACY' || (!cursor && intent.history !== 'NEW_CAPTURE')) {
            plan.status = 'LEGACY_REVIEW_REQUIRED'; plan.blocker = 'LEGACY_MAPPING_UNVERIFIED'
          } else if ((cursor && intent.initial_order !== cursor.ranges[0].min)
            || (!cursor && intent.initial_order !== 0)) {
            plan.status = 'BLOCKED'; plan.blocker = 'INITIAL_ORDER_CONFLICT'
          } else {
            plan.next_order ??= intent.initial_order
            plan.status = plan.next_order > s.last_message_order ? 'NO_NEW_SOURCE' : 'PLANNED'
            plan.blocker = null
          }
        } else plan.blocker = 'ADOPTION_OR_PUBLICATION_REVIEW_REQUIRED'
      } catch (error) { plan.status = 'BLOCKED'; plan.blocker = error.message }
    }
    return [s.id, plan]
  }))
  const children = new Map()
  for (const s of sessions) {
    if (s.archive_intent?.disposition !== 'ADOPTED') continue
    const pred = s.archive_intent.predecessor_id
    children.set(pred, [...(children.get(pred) ?? []), s.id])
  }
  // Validate metadata ancestry even for mapped published baselines.
  for (const s of sessions) {
    const chain = [], seen = new Set()
    let current = s
    while (current?.archive_intent?.disposition === 'ADOPTED') {
      if (seen.has(current.id)) {
        for (const id of chain) { const p = plans.get(id); p.status = 'BLOCKED'; p.blocker = 'CONTINUITY_CYCLE' }
        break
      }
      seen.add(current.id); chain.push(current.id)
      current = sourceMap.get(current.archive_intent.predecessor_id)
    }
  }
  const visited = new Set(), visiting = new Set()
  function check(id) {
    const p = plans.get(id), s = sourceMap.get(id)
    if (visited.has(id)) return p
    if (visiting.has(id)) { p.status = 'BLOCKED'; p.blocker = 'CONTINUITY_CYCLE'; return p }
    visiting.add(id)
    if (['PLANNED', 'NO_NEW_SOURCE'].includes(p.status)) {
      const pred = s.archive_intent.predecessor_id, prior = sourceMap.get(pred)
      let reason = null
      if ((children.get(pred)?.length ?? 0) > 1) reason = 'CONTINUITY_FORK_REVIEW_REQUIRED'
      // Published history establishes a baseline, never authorization for new RAW.
      if (!published.cursors.has(id)) {
        if (!prior) reason ??= 'CONTINUITY_PREDECESSOR_MISSING'
        else {
          const pp = check(pred)
          const committedEnd = published.cursors.get(pred)?.nextOrder
          if (prior.status !== 'CLOSED' || committedEnd !== prior.last_message_order + 1
            || pp.status !== 'NO_NEW_SOURCE') reason ??= 'PREDECESSOR_BACKLOG_OR_REVIEW'
          if ((s.archive_intent.kind === 'CONTINUE') !== (prior.season_id === s.season_id)) reason ??= 'CONTINUITY_SEASON_CONFLICT'
          if (s.archive_intent.kind === 'RESTART') reason ??= 'RESTART_REQUIRES_EDITORIAL_REVIEW'
        }
        if (Number(s.season_id.slice(1)) < published.latestSeason) reason ??= 'LATE_HISTORICAL_SOURCE_REVIEW_REQUIRED'
      }
      if (p.status === 'PLANNED' && published.frontier !== id && published.frontier !== pred) reason ??= 'READER_FRONTIER_REVIEW_REQUIRED'
      if (reason) { p.status = 'REVIEW_REQUIRED'; p.blocker = reason }
    }
    visiting.delete(id); visited.add(id)
    return p
  }
  // UUID sorting only stabilizes the report. It never grants a publication order.
  const result = [...plans.keys()].sort().map(check)
  for (const [id] of published.cursors) need(sourceMap.has(id), 'PUBLISHED_SESSION_NOT_VISIBLE')
  return { version: 'archive-source-discovery-v2', database_writes: 0,
    sessions: result, candidate: result.find((p) => p.status === 'PLANNED') ?? null }
}

export function verifyPublishedHashes(cursor, rows) {
  need(rows.length === cursor.hashes.size && rows.every((r) => cursor.hashes.get(r.message_order) === r.content_sha256
    && r.hash_valid === true), 'PUBLISHED_SOURCE_HASH_CHANGED_OR_HIDDEN')
}

/** Compare a newly admitted snapshot after build/CI, including optional provenance. */
export function verifyDiscoveryCandidate(original, current) {
  need(current?.session.id === original.session.id
    && intentDigest(current.session.archive_intent) === intentDigest(original.session.archive_intent)
    && current.discovery.startOrder === original.discovery.startOrder, 'SOURCE_ADOPTION_CHANGED')
  const retained = current.discovery.rows.filter((r) => r.message_order <= original.discovery.endOrder)
  need(retained.length === original.discovery.rows.length
    && retained.every((r, i) => JSON.stringify(r) === JSON.stringify(original.discovery.rows[i])), 'SOURCE_CANDIDATE_CHANGED')
  const links = current.links.filter((link) => link.turn_no <= original.discovery.rows.at(-1).turn_no)
  need(JSON.stringify(links) === JSON.stringify(original.links), 'SOURCE_STATE_LINK_CHANGED')
}

export function candidateState(session, published) {
  const existing = published.seasons.get(session.season_id)
  const manifest = existing?.manifest ?? { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL',
    protagonist: '서진우', season_id: session.season_id, archive_class: 'COLD_RAW', visibility: 'PUBLIC_ARCHIVE', overall_status: 'PARTIAL', sessions: [] }
  const nextSessionId = existing?.nextSessionId ?? 'SESSION_001'
  need(/^SESSION_\d{3}$/.test(nextSessionId), 'SEGMENT_ID_EXHAUSTED')
  return { manifest, nextSessionId }
}
