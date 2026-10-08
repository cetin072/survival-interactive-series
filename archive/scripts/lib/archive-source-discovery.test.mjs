import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadPublishedIndex, planSourceSessions, candidateState, verifyPublishedHashes, verifyDiscoveryCandidate, validateIntent } from './archive-source-discovery.mjs'
import { discoverCompletePairs, materializeSegment } from './archive-daily-core.mjs'
import { readDiscoverySnapshot } from './archive-discovery-read.mjs'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const sha = (v) => createHash('sha256').update(v).digest('hex')
const intent = (predecessor_id, extra = {}) => ({ version: 1, disposition: 'ADOPTED', publication: 'APPROVED',
  kind: 'CONTINUE', history: 'NEW_CAPTURE', initial_order: 0, predecessor_id,
  evidence_ref: 'https://github.com/cetin072/survival-interactive-series/issues/150', ...extra })
const session = (n, extra = {}) => ({ id: id(n), chronicle_id: 'C03', worldline_id: 'AFTERFALL', season_id: 'S03',
  status: 'CLOSED', last_message_order: 1, archive_intent: intent(n === 1 ? null : id(n - 1)), ...extra })
const row = (s, order) => {
  const content = order % 2 ? '# AFTERFALL\n그는 멈춰 서서 문을 바라보았다.' : '문을 확인한다.'
  return { id: id(order + 1000), session_id: s.id, chronicle_id: s.chronicle_id, worldline_id: s.worldline_id,
    season_id: s.season_id, message_order: order, role: order % 2 ? 'GM' : 'USER', turn_no: Math.floor(order / 2),
    content, content_sha256: sha(content), public_safe: true, source_type: 'LIVE',
    save_version: null, game_time: '2027-12-01 10:00', recorded_at: new Date('2026-10-08T00:00:00Z') }
}
const cursor = (max = 1) => ({ season: 'S03', nextOrder: max + 1, ranges: [{ min: 0, max }],
  hashes: new Map(Array.from({ length: max + 1 }, (_, i) => [i, sha(row(session(1), i).content)])) })
const published = () => ({ cursors: new Map([[id(1), cursor()]]), seasons: new Map(), frontier: id(1), latestSeason: 3 })
const plans = (ss, pub = published()) => planSourceSessions(ss, pub)
const base = resolve(import.meta.dirname, '../../..')
async function actualIndex() {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: base, encoding: 'utf8' }).trim()
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', revision], { cwd: base, encoding: 'utf8' }).trim().split('\n')
  return loadPublishedIndex({ paths, read: async (p) => execFileSync('git', ['show', `${revision}:${p}`], { cwd: base, maxBuffer: 4_000_000 }) })
}

test('continuation processes predecessor backlog before successor, independent of metadata listing order', () => {
  assert.equal(plans([session(2), session(1)]).candidate.source_session_uuid, id(2))
  const p = plans([session(2), session(1, { last_message_order: 3 })])
  assert.equal(p.candidate.source_session_uuid, id(1))
  assert.equal(p.sessions.find((s) => s.source_session_uuid === id(2)).blocker, 'PREDECESSOR_BACKLOG_OR_REVIEW')
})
test('new season starts SESSION_001; CLOSED does not change season completion', () => {
  const s = session(2, { season_id: 'S04', archive_intent: intent(id(1), { kind: 'NEW_SEASON' }) })
  assert.equal(plans([session(1), s]).candidate.season_id, 'S04')
  const state = candidateState(s, published())
  assert.equal(state.nextSessionId, 'SESSION_001'); assert.equal(state.manifest.overall_status, 'PARTIAL')
  const out = materializeSegment({ session: s, discovery: discoverCompletePairs(s, [row(s, 0), row(s, 1)], 0), sessionId: state.nextSessionId, sealedAt: '2026-10-08' })
  assert.equal(out.source.season_id, 'S04'); assert.match(out.part.toString(), /AFTERFALL \/ S04/)
  assert.equal(out.source.content_sha256[0].save_version, undefined)
})
test('OPEN completed pairs are allowed, trailing USER stays at the next cursor', () => {
  const s = session(2, { status: 'OPEN', last_message_order: 2 })
  const d = discoverCompletePairs(s, [row(s, 0), row(s, 1), row(s, 2)], 0)
  assert.equal(d.endOrder, 1)
  assert.equal(discoverCompletePairs(s, [row(s, 2)], 2).status, 'NO_NEW_SOURCE')
  assert.equal(plans([session(1, { status: 'OPEN' }), s]).candidate, null)
})
test('superseded source is preserved and never collected; changing published disposition blocks', () => {
  const before = session(2, { archive_intent: intent(id(1), { disposition: 'SUPERSEDED' }) })
  const original = JSON.stringify(before)
  assert.equal(plans([session(1), before]).sessions.find((p) => p.source_session_uuid === id(2)).status, 'SUPERSEDED')
  assert.equal(JSON.stringify(before), original)
  assert.equal(plans([session(1, { archive_intent: intent(null, { disposition: 'SUPERSEDED' }) })]).sessions[0].blocker, 'PUBLISHED_DISPOSITION_CONFLICT')
})
test('public_safe and CLOSED never substitute for explicit adoption/publication evidence', () => {
  for (const archive_intent of [null, intent(id(1), { publication: 'REVIEW_REQUIRED' }), intent(id(1), { disposition: 'REVIEW_REQUIRED' })]) {
    assert.equal(plans([session(1), session(2, { archive_intent, close_note: 'approved continuation' })]).candidate, null)
  }
})
test('cross-session pairing, gap/RLS-hidden row, scope, turn and UTF8 hash mismatch fail closed', () => {
  const s = session(2), a = row(s, 0), b = row(s, 1)
  for (const bad of [{ ...b, session_id: id(3) }, { ...b, message_order: 3 }, { ...b, season_id: 'S04' },
    { ...b, turn_no: 2 }, { ...b, content: b.content + ' ' }, { ...b, public_safe: false }, { ...b, source_type: 'RECOVERY' }]) {
    assert.throws(() => discoverCompletePairs(s, [a, bad], 0))
  }
  assert.throws(() => discoverCompletePairs(s, [b], 0))
})
test('402-row backlog progresses in 200/200/2 pages without changing source orders', () => {
  const s = session(2, { last_message_order: 401 }), rows = Array.from({ length: 402 }, (_, i) => row(s, i))
  const seen = []
  for (let next = 0; next <= 401;) {
    const d = discoverCompletePairs(s, rows.slice(next, next + 200), next)
    seen.push(...d.rows.map((r) => r.message_order)); next = d.endOrder + 1
  }
  assert.deepEqual(seen, rows.map((r) => r.message_order))
})
test('snapshot bound excludes rows appended after capture and keeps them for next run', () => {
  const s = session(2, { last_message_order: 3 })
  const d = discoverCompletePairs(s, [row(s, 0), row(s, 1)], 0, { snapshotEnd: 1 })
  assert.equal(d.endOrder, 1)
  assert.equal(discoverCompletePairs(s, [row(s, 2), row(s, 3)], 2).pairs, 1)
})
test('optional state-link identifies actual USER/GM and versions; absence does not fabricate provenance', () => {
  const s = session(2), rows = [row(s, 0), row(s, 1)], discovery = discoverCompletePairs(s, rows, 0)
  const args = { session: s, discovery, sessionId: 'SESSION_002', sealedAt: '2026-10-08' }
  assert.equal(materializeSegment(args).source.content_sha256[1].state_link, undefined)
  assert.throws(() => materializeSegment({ ...args, links: [{ turn_no: 0, user_message_id: rows[0].id,
    gm_message_id: rows[1].id, user_save_version: 900, gm_save_version: null, linked_save_version: null, outcome: 'APPLIED' }] }), /INVALID_OPTIONAL_STATE_LINK/)
})
test('proposal/CI failure or ambiguous acknowledgement never changes committed cursor or retry identity', () => {
  const s = session(1, { last_message_order: 3 }), pub = published(), before = pub.cursors.get(id(1)).nextOrder
  const discovery = discoverCompletePairs(s, [row(s, 2), row(s, 3)], 2)
  const candidate = () => materializeSegment({ session: s, discovery, sessionId: 'SESSION_002', sealedAt: '2026-10-08' })
  assert.equal(candidate().segmentId, candidate().segmentId)
  assert.equal(pub.cursors.get(id(1)).nextOrder, before)
  assert.equal(plans([s], pub).candidate.next_order, 2)
  pub.cursors.set(id(1), cursor(3))
  assert.equal(plans([s], pub).sessions[0].status, 'NO_NEW_SOURCE')
})
test('same published range with changed hash or hidden row is blocked', () => {
  const c = cursor(), rows = [...c.hashes].map(([message_order, content_sha256]) => ({ message_order, content_sha256, hash_valid: true }))
  verifyPublishedHashes(c, rows)
  assert.throws(() => verifyPublishedHashes(c, [{ ...rows[0], content_sha256: sha('changed') }, rows[1]]))
  assert.throws(() => verifyPublishedHashes(c, rows.slice(1)))
  assert.throws(() => verifyPublishedHashes(c, [{ ...rows[0], hash_valid: false }, rows[1]]))
})
test('legacy and late historical sources cannot append to current Reader', () => {
  assert.equal(plans([session(1), session(2, { season_id: 'S02' })]).sessions.find((p) => p.source_session_uuid === id(2)).status, 'LEGACY_REVIEW_REQUIRED')
  const p = plans([session(1), session(2, { archive_intent: intent(id(1), { history: 'LEGACY' }) })])
  assert.equal(p.candidate, null)
  const pub = published(); pub.latestSeason = 4
  assert.equal(plans([session(1), session(2)], pub).candidate, null)
})
test('continuity forks/missing predecessors do not pick an arbitrary UUID or date', () => {
  assert.equal(plans([session(1), session(2), session(3, { archive_intent: intent(id(1)) })]).candidate, null)
  assert.equal(plans([session(1), session(3)]).candidate, null)
  const cycle = plans([session(1, { archive_intent: intent(id(2)) }), session(2)])
  assert.ok(cycle.sessions.every((p) => p.blocker === 'CONTINUITY_CYCLE'))
})
test('unapproved C04 and unrecognized aliases fail closed; missing published rows are not absence', () => {
  assert.throws(() => plans([session(2)]), /PUBLISHED_SESSION_NOT_VISIBLE/)
  assert.throws(() => planSourceSessions([], published(), { scope: { chronicle_id: 'C04', worldline_id: 'AFTERFALL' } }), /UNAPPROVED_DISCOVERY_SCOPE/)
  assert.equal(plans([session(1), session(2, { chronicle_id: '03' })]).candidate, null)
  assert.throws(() => validateIntent({ ...intent(id(1)), gm_state: {} }, session(2)))
})
test('real committed S03 cursor retains baseline 42 and next 106', async () => {
  const index = await actualIndex()
  const actual = [...index.cursors.values()].find((c) => c.season === 'S03')
  assert.equal(actual.ranges[0].min, 42); assert.equal(actual.nextOrder, 106)
  const state = candidateState({ season_id: 'S03' }, index)
  assert.equal(state.nextSessionId, 'SESSION_009')
  assert.equal(candidateState({ season_id: 'S04' }, index).nextSessionId, 'SESSION_001')
})
test('committed overlapping ranges and reused Archive SESSION identifiers are rejected', async () => {
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: base, encoding: 'utf8' }).trim().split('\n')
  const read = async (p) => execFileSync('git', ['show', `HEAD:${p}`], { cwd: base, maxBuffer: 4_000_000 })
  const ref = 'archive/content/transcripts/C03-AFTERFALL/S03/MANIFEST.json'
  const original = JSON.parse((await read(ref)).toString())
  const duplicate = structuredClone(original); duplicate.sessions.push(duplicate.sessions[0])
  await assert.rejects(loadPublishedIndex({ paths, read: async (p) => p === ref ? Buffer.from(JSON.stringify(duplicate)) : read(p) }), /SEGMENT_ID_COLLISION/)
  const overlap = structuredClone(original), entry = { ...overlap.sessions[0], session_id: 'SESSION_999', source_manifest: 'SESSION_999/SOURCE_MANIFEST.json' }
  overlap.sessions.push(entry)
  const oldPrefix = ref.replace('MANIFEST.json', 'SESSION_001/'), newPrefix = ref.replace('MANIFEST.json', 'SESSION_999/')
  const expanded = [...paths, ...paths.filter((p) => p.startsWith(oldPrefix)).map((p) => p.replace(oldPrefix, newPrefix))]
  await assert.rejects(loadPublishedIndex({ paths: expanded, read: async (p) => {
    if (p === ref) return Buffer.from(JSON.stringify(overlap))
    if (p === newPrefix + 'SOURCE_MANIFEST.json') {
      const source = JSON.parse((await read(oldPrefix + 'SOURCE_MANIFEST.json')).toString()); source.session_id = 'SESSION_999'
      return Buffer.from(JSON.stringify(source))
    }
    return read(p.replace(newPrefix, oldPrefix))
  } }), /PUBLISHED_RANGE_OVERLAP/)
})

const allowedRole = { role_name: 'archive_exporter', session_role: 'archive_exporter', read_only: 'on',
  rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false,
  can_read_messages: true, can_read_sessions: true, can_read_links: true, can_write_messages: false,
  can_write_sessions: false, can_write_links: false, other_source_selects: 0 }
function fakeClient({ ss = [session(1), session(2)], role = allowedRole, bad = false } = {}) {
  const queries = [], c = cursor()
  return { queries, async query(sql, values) {
    queries.push({ sql, values })
    if (/from pg_roles/.test(sql)) return { rows: [role] }
    if (/from survival_rpg.transcript_sessions s/.test(sql)) return { rows: ss }
    if (/as hash_valid/.test(sql)) return { rows: [...c.hashes].map(([message_order, content_sha256]) => ({ message_order, content_sha256, hash_valid: !bad })) }
    if (/recorded_at/.test(sql)) return { rows: [row(ss[1], 0), row(ss[1], 1)] }
    return { rows: [] }
  } }
}
test('snapshot performs only bounded SELECT and closes before handing out candidate, without raw in report', async () => {
  const client = fakeClient(), out = await readDiscoverySnapshot(client, published())
  assert.equal(client.queries[0].sql, 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.equal(client.queries.at(-1).sql, 'COMMIT')
  assert.equal(out.report.candidate.pairs, 1)
  assert.equal(JSON.stringify(out.report).includes('그는'), false)
  assert.ok(client.queries.every((q) => !/^\s*(INSERT|UPDATE|DELETE|CALL)/i.test(q.sql)))
  assert.ok(client.queries.filter((q) => /from survival_rpg/.test(q.sql)).every((q) => /limit/i.test(q.sql)))
})
test('restricted role admission rejects service_role and extra reads/writes; metadata old DB stays review', async () => {
  for (const role of [{ ...allowedRole, role_name: 'service_role' }, { ...allowedRole, other_source_selects: 1 }, { ...allowedRole, can_write_sessions: true }]) {
    const c = fakeClient({ role })
    await assert.rejects(readDiscoverySnapshot(c, published()), /RESTRICTED_EXPORT_ROLE_REQUIRED/)
    assert.equal(c.queries.at(-1).sql, 'ROLLBACK')
  }
  const c = fakeClient({ ss: [session(1, { archive_intent: null }), session(2, { archive_intent: null })] })
  const result = await readDiscoverySnapshot(c, published())
  assert.equal(result.live, null)
  assert.equal(c.queries.some((q) => /recorded_at/.test(q.sql)), false)
})
test('mutated published source blocks its descendant, leaving bodies unread', async () => {
  const c = fakeClient({ bad: true }), out = await readDiscoverySnapshot(c, published())
  assert.equal(out.live, null)
  assert.equal(out.report.sessions.find((p) => p.source_session_uuid === id(2)).blocker, 'PUBLISHED_PREDECESSOR_CHANGED')
})
test('post-CI revalidation rejects changed adoption, RAW or state link, permitting only new tail', () => {
  const s = session(2), rows = [row(s, 0), row(s, 1)]
  const original = { session: s, discovery: discoverCompletePairs(s, rows, 0), links: [] }
  const clone = () => structuredClone(original)
  verifyDiscoveryCandidate(original, clone())
  const appended = clone(); appended.session.last_message_order = 3
  appended.discovery = discoverCompletePairs(appended.session, [...rows, row(s, 2), row(s, 3)], 0)
  verifyDiscoveryCandidate(original, appended)
  const adoption = clone(); adoption.session.archive_intent.disposition = 'SUPERSEDED'
  assert.throws(() => verifyDiscoveryCandidate(original, adoption), /SOURCE_ADOPTION_CHANGED/)
  const changed = clone(); changed.discovery.rows[1].content += ' changed'
  assert.throws(() => verifyDiscoveryCandidate(original, changed), /SOURCE_CANDIDATE_CHANGED/)
  const link = clone(); link.links = [{ turn_no: 0, outcome: 'APPLIED' }]
  assert.throws(() => verifyDiscoveryCandidate(original, link), /SOURCE_STATE_LINK_CHANGED/)
})

 test('isolated synthetic S04 integration preserves all public source files and appends exactly one Reader chapter', async () => {
  const { candidateCheck } = await import('../run-daily-archive.mjs')
  const result = await candidateCheck(resolve(import.meta.dirname, 'fixtures/archive-discovery-synthetic.json'))
  assert.equal(result.status, 'ISOLATED_CANDIDATE_PASS')
  assert.equal(result.session_id, 'SESSION_001')
  assert.equal(result.reader_chapters_added, 1)
  assert.ok(result.preserved_public_files > 100)
  assert.equal(result.database_writes, 0); assert.equal(result.remote_writes, 0)
  assert.equal(result.graph, 'NO_STRUCTURED_ANCHOR')
})

 test('publication admission checks the actual origin/main ref and rejects an older candidate base', async () => {
  const { assertMainBase } = await import('../run-daily-archive.mjs')
  const current = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: base, encoding: 'utf8' }).trim()
  assertMainBase(current)
  assert.throws(() => assertMainBase('0'.repeat(40)), /STALE_BASE_HUMAN_REVIEW_REQUIRED/)
})
