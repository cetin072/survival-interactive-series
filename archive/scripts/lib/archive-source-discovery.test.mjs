import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadPublishedIndex, planSourceSessions, candidateState, verifyPublishedHashes, verifyDiscoveryCandidate, validateIntent, intentDigest } from './archive-source-discovery.mjs'
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
// Explicit isolated authority fixtures; caller strings alone are tested separately below.
const approvals = (ss) => ss.filter(s => s.archive_intent && s.archive_intent.disposition !== 'REVIEW_REQUIRED'
  && s.archive_intent.publication === 'APPROVED').map(s => ({ session_id:s.id,chronicle_id:s.chronicle_id,
  worldline_id:s.worldline_id,season_id:s.season_id,runtime_intent:structuredClone(s.archive_intent),decision:{
    disposition:s.archive_intent.disposition,publication:s.archive_intent.disposition === 'SUPERSEDED' ? 'REVIEW_REQUIRED' : 'APPROVED',
    evidence_ref:s.archive_intent.evidence_ref,allow_continuation:s.archive_intent.disposition === 'ADOPTED',
    published_predecessor_id:s.archive_intent.predecessor_id,supersedes_id:null,approved_through:null }}))
const plans = (ss, pub = published()) => planSourceSessions(ss, pub, {authorizations:approvals(ss)})
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
    if (/c.relname='archive_source_authorizations'/.test(sql)) return { rows: [{oid:123}] }
    if (/as other_ops_reads/.test(sql)) return { rows: [{can_read:true,can_write:false,can_approve:false,other_ops_reads:0}] }
    if (/from survival_ops.archive_source_authorizations where/.test(sql)) return { rows: approvals(ss) }
    if (/from pg_roles/.test(sql)) return { rows: [role] }
    if (/from survival_rpg.transcript_sessions s/.test(sql)) return { rows: ss }
    if (/select message_order,content,content_sha256/.test(sql)) return { rows: [...c.hashes].map(([message_order, content_sha256]) => ({ message_order, content_sha256, content: bad ? 'changed' : row(session(1), message_order).content })) }
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
  const approval = clone(); approval.authorization_sha256 = sha('different protected policy')
  assert.throws(() => verifyDiscoveryCandidate(original, approval), /SOURCE_ADOPTION_CHANGED/)
})

test('forged APPROVED, real Issue URL and notes alone never authorize RAW', () => {
  const ss = [session(1),session(2, {close_note:'approved by operator'})]
  const out = planSourceSessions(ss,published())
  assert.equal(out.candidate,null)
  assert.equal(out.sessions.find(s => s.source_session_uuid === id(2)).blocker,'ADOPTION_OR_PUBLICATION_REVIEW_REQUIRED')
  const a = approvals(ss); a[1].runtime_intent.kind='NEW_SEASON'
  assert.equal(planSourceSessions(ss,published(),{authorizations:a}).candidate,null)
  a[1].runtime_intent=ss[1].archive_intent; a[1].worldline_id='OTHER'
  assert.equal(planSourceSessions(ss,published(),{authorizations:a}).candidate,null)
})

const pending = (i) => ({...i,disposition:'REVIEW_REQUIRED',publication:'REVIEW_REQUIRED'})
test('trusted same-season policy auto inherits pending normal continuity only', () => {
  const root=session(1), child=session(2,{archive_intent:pending(intent(id(1)))})
  const auth=approvals([root])
  const out=planSourceSessions([child,root],published(),{authorizations:auth})
  assert.equal(out.candidate.source_session_uuid,child.id)
  auth[0].decision.allow_continuation=false
  assert.equal(planSourceSessions([root,child],published(),{authorizations:auth}).candidate,null)
  auth[0].decision.allow_continuation=true
  for (const kind of ['NEW_SEASON','RESTART','LEGACY']) {
    const bad={...child,archive_intent:{...child.archive_intent,kind}}
    assert.equal(planSourceSessions([root,bad],published(),{authorizations:auth}).candidate,null)
  }
  const fork=session(3,{archive_intent:pending(intent(root.id))})
  assert.equal(planSourceSessions([root,child,fork],published(),{authorizations:auth}).candidate,null)
})

function reviewedRestart() {
  const root=session(1), a=session(2,{season_id:'S04',archive_intent:pending(intent(id(1),{kind:'NEW_SEASON'}))})
  const b=session(3,{season_id:'S04',status:'OPEN',last_message_order:3,archive_intent:pending(intent(a.id,{kind:'RESTART'}))})
  const auth=approvals([root])
  for (const s of [a,b]) auth.push({session_id:s.id,chronicle_id:s.chronicle_id,worldline_id:s.worldline_id,season_id:s.season_id,
    runtime_intent:structuredClone(s.archive_intent),decision:{disposition:s===a?'SUPERSEDED':'ADOPTED',
      publication:s===a?'REVIEW_REQUIRED':'APPROVED',evidence_ref:s.archive_intent.evidence_ref,
      allow_continuation:s===b,published_predecessor_id:root.id,supersedes_id:s===b?a.id:null,approved_through:s===b?1:null}})
  return {ss:[root,a,b],auth,pub:published(),root,a,b}
}
test('reviewed RESTART skips exactly the protected unpublished start and preserves original bytes/hashes', () => {
  const {ss,auth,pub,a,b}=reviewedRestart(), before=JSON.stringify(ss), rawA=[row(a,0),row(a,1)]
  const originalHashes=rawA.map(r => r.content_sha256)
  const out=planSourceSessions(ss,pub,{authorizations:auth})
  assert.equal(out.sessions.find(s => s.source_session_uuid===a.id).status,'SUPERSEDED')
  assert.equal(out.candidate.source_session_uuid,b.id); assert.equal(out.candidate.snapshot_upper,1)
  assert.equal(b.archive_intent.kind,'RESTART')
  const d=discoverCompletePairs(b,[row(b,0),row(b,1)],0,{snapshotEnd:out.candidate.snapshot_upper})
  const materialized=materializeSegment({session:b,discovery:d,sessionId:'SESSION_001',sealedAt:'synthetic'})
  assert.equal(materialized.source.source_session_uuid,b.id)
  assert.equal(materialized.source.season_id,'S04')
  assert.equal(JSON.stringify(ss),before); assert.deepEqual(rawA.map(r=>sha(r.content)),originalHashes)
  b.last_message_order=1
  pub.cursors.set(b.id,{...cursor(),season:'S04'});pub.frontier=b.id;pub.latestSeason=4
  const retained=pub.cursors.get(b.id).nextOrder
  assert.equal(planSourceSessions(ss,pub,{authorizations:auth}).candidate,null)
  assert.equal(pub.cursors.get(b.id).nextOrder,retained)
})
test('reviewed start must be committed before an explicit policy admits normal ongoing capture', () => {
  const f=reviewedRestart()
  assert.equal(planSourceSessions(f.ss,f.pub,{authorizations:f.auth}).candidate.snapshot_upper,1)
  f.pub.cursors.set(f.b.id,{...cursor(),season:'S04'});f.pub.frontier=f.b.id;f.pub.latestSeason=4
  const tail=planSourceSessions(f.ss,f.pub,{authorizations:f.auth}).candidate
  assert.equal(tail.source_session_uuid,f.b.id);assert.equal(tail.next_order,2);assert.equal(tail.snapshot_upper,3)
  assert.equal(f.pub.cursors.get(f.b.id).nextOrder,2)
  f.auth[2].decision.allow_continuation=false
  const held=planSourceSessions(f.ss,f.pub,{authorizations:f.auth})
  assert.equal(held.candidate,null)
  assert.equal(held.sessions.find(s=>s.source_session_uuid===f.b.id).blocker,'APPROVED_RANGE_EXHAUSTED')
  // A later normal source does not create a second season intro or invalidate B.
  f.auth[2].decision.allow_continuation=true;f.b.last_message_order=1;f.b.status='CLOSED'
  f.pub.seasons.set('S04',{manifest:{sessions:[{source_session_uuid:f.b.id}]}})
  const next=session(4,{season_id:'S04',archive_intent:pending(intent(f.b.id))})
  assert.equal(planSourceSessions([...f.ss,next],f.pub,{authorizations:f.auth}).candidate.source_session_uuid,next.id)
  f.pub.cursors.set(next.id,{...cursor(),season:'S04'});f.pub.frontier=next.id
  f.pub.seasons.get('S04').manifest.sessions.push({source_session_uuid:next.id})
  const following=session(5,{season_id:'S04',archive_intent:pending(intent(next.id))})
  assert.equal(planSourceSessions([...f.ss,next,following],f.pub,{authorizations:f.auth}).candidate.source_session_uuid,following.id)
})
test('unreviewed RESTART stays guarded; missing supersession and wrong connection fail closed', () => {
  const f=reviewedRestart()
  let out=planSourceSessions(f.ss,f.pub,{authorizations:f.auth.slice(0,1)})
  assert.equal(out.candidate,null)
  assert.equal(out.sessions.find(s => s.source_session_uuid===f.b.id).blocker,'RESTART_REQUIRES_EDITORIAL_REVIEW')
  for (const mutate of [a => a.pop(), a => a[1].decision.disposition='REVIEW_REQUIRED',
    a => a[2].decision.supersedes_id=id(9), a => a[2].decision.approved_through=null,
    a => a[2].decision.published_predecessor_id=id(9)]) {
    const auth=structuredClone(f.auth);mutate(auth)
    assert.equal(planSourceSessions(f.ss,f.pub,{authorizations:auth}).candidate,null)
  }
})
test('reviewed RESTART cannot skip published RAW, change frontier, or repeat a season intro', () => {
  for (const mutate of [f=>f.pub.cursors.set(f.a.id,{...cursor(),season:'S04'}),
    f=>f.pub.frontier=id(9),f=>f.pub.seasons.set('S04',{manifest:{sessions:[{session_id:'SESSION_001'}]}}),
    f=>f.a.worldline_id='OTHER',f=>f.a.season_id='S05',
    f=>{f.a.archive_intent.predecessor_id=f.b.id;f.auth[1].runtime_intent=structuredClone(f.a.archive_intent)}]) {
    const f=reviewedRestart();mutate(f)
    assert.equal(planSourceSessions(f.ss,f.pub,{authorizations:f.auth}).candidate,null)
  }
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

test('reviewed RESTART uses the existing isolated Reader compiler with preserved S03 order and source IDs', async () => {
  const {readFile,writeFile,mkdtemp,rm}=await import('node:fs/promises')
  const {tmpdir}=await import('node:os'),{join}=await import('node:path')
  const {candidateCheck}=await import('../run-daily-archive.mjs')
  const input=JSON.parse(await readFile(resolve(import.meta.dirname,'fixtures/archive-discovery-synthetic.json'),'utf8'))
  input.superseded=structuredClone(input.session);input.superseded.status='CLOSED'
  input.session.id=id(3);input.session.archive_intent= {...input.session.archive_intent,kind:'RESTART',predecessor_id:input.superseded.id}
  input.rows.forEach(r=>r.session_id=input.session.id)
  const a=input.authorizations[1]
  a.decision={...a.decision,disposition:'SUPERSEDED',publication:'REVIEW_REQUIRED',allow_continuation:false}
  input.authorizations.push({...a,session_id:input.session.id,runtime_intent:structuredClone(input.session.archive_intent),
    decision:{...a.decision,disposition:'ADOPTED',publication:'APPROVED',allow_continuation:true,
      supersedes_id:input.superseded.id,approved_through:1}})
  const temp=await mkdtemp(join(tmpdir(),'archive-restart-fixture-'))
  try {
    const path=join(temp,'synthetic.json');await writeFile(path,JSON.stringify(input))
    const result=await candidateCheck(path)
    assert.equal(result.status,'ISOLATED_CANDIDATE_PASS');assert.equal(result.source_session_uuid,input.session.id)
    assert.equal(result.session_id,'SESSION_001');assert.equal(result.reader_chapters_added,1)
    assert.ok(result.preserved_public_files>100)
  } finally {await rm(temp,{recursive:true,force:true})}
})

 test('publication admission checks the actual origin/main ref and rejects an older candidate base', async () => {
  const { assertMainBase } = await import('../run-daily-archive.mjs')
  const current = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: base, encoding: 'utf8' }).trim()
  assertMainBase(current)
  assert.throws(() => assertMainBase('0'.repeat(40)), /STALE_BASE_HUMAN_REVIEW_REQUIRED/)
})

test('isolated restricted PostgreSQL login executes bounded discovery with original grants',
  { skip: !process.env.ARCHIVE_ISOLATED_DB_URL }, async () => {
    const address = new URL(process.env.ARCHIVE_ISOLATED_DB_URL)
    assert.ok(['localhost', '127.0.0.1'].includes(address.hostname), 'isolated local PostgreSQL only')
    assert.equal(address.pathname, '/postgres')
    const { Client } = await import('pg')
    const admin = new Client({ connectionString: address.href }), s1 = session(1), s2 = session(2, {
      season_id: 'S04', status: 'OPEN', archive_intent: intent(id(1), { kind: 'NEW_SEASON' }) })
    const trusted = approvals([s1,s2])
    for (const s of [s1,s2]) { s.archive_intent.disposition='REVIEW_REQUIRED'; s.archive_intent.publication='REVIEW_REQUIRED' }
    for (const a of trusted) a.runtime_intent=structuredClone([s1,s2].find(s => s.id===a.session_id).archive_intent)
    await admin.connect()
    try {
      await admin.query("ALTER ROLE archive_exporter PASSWORD 'isolated-test'")
      await admin.query("ALTER ROLE service_role LOGIN PASSWORD 'isolated-service-test'")
      await admin.query('SET ROLE service_role')
      for (const s of [s1, s2]) {
        await admin.query(`insert into survival_rpg.transcript_sessions
          (id,worldline_id,chronicle_id,season_id,status,last_message_order,closed_at,archive_intent)
          values ($1,'AFTERFALL','C03',$2,$3,1,$4,$5)`,
        [s.id, s.season_id, s.status, s.status === 'CLOSED' ? new Date() : null, s.archive_intent])
        for (const r of [row(s, 0), row(s, 1)]) {
          await admin.query(`insert into survival_rpg.transcript_messages
            (worldline_id,chronicle_id,season_id,session_id,turn_no,message_order,role,content,content_sha256,game_time,idempotency_key)
            values ('AFTERFALL','C03',$1,$2,$3,$4,$5,$6,$7,$8,gen_random_uuid())`,
          [s.season_id, s.id, r.turn_no, r.message_order, r.role, r.content, r.content_sha256, r.game_time])
        }
      }
      // Protected approval is made through the existing operator RPC, never GM service_role.
      await admin.query('RESET ROLE')
      await admin.query('SET ROLE authenticated')
      await admin.query("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',false)")
      for (const a of trusted) await admin.query('select public.archive_operator_authorize_source($1,$2,$3)',[a.session_id,a.runtime_intent,a.decision])
    } finally { await admin.end() }
    const serviceAddress = new URL(address.href); serviceAddress.username='service_role';serviceAddress.password='isolated-service-test'
    const gm=new Client({connectionString:serviceAddress.href});await gm.connect()
    try {
      await gm.query("select set_config('request.jwt.claims','{\"role\":\"authenticated\",\"sub\":\"00000000-0000-4000-8000-000000000099\"}',false)")
      await assert.rejects(gm.query('SET ROLE authenticated'), e=>e.code==='42501')
      await assert.rejects(gm.query('select public.archive_operator_authorize_source($1,$2,$3)',[s2.id,s2.archive_intent,trusted[1].decision]),e=>e.code==='42501')
      await assert.rejects(gm.query("update survival_ops.archive_source_authorizations set decision='{}'"),e=>e.code==='42501')
      await assert.rejects(gm.query("update public.profiles set can_review=true"),e=>e.code==='42501')
      await assert.rejects(gm.query('update survival_rpg.transcript_sessions set archive_intent=$1 where id=$2',
        [{...s2.archive_intent,disposition:'ADOPTED',publication:'APPROVED'},s2.id]),e=>e.code==='23514')
      // Changing an otherwise valid intent also invalidates its protected attestation.
      await gm.query('update survival_rpg.transcript_sessions set archive_intent=$1 where id=$2',
        [{...s2.archive_intent,evidence_ref:'https://github.com/cetin072/survival-interactive-series/issues/193'},s2.id])
    } finally { await gm.end() }
    address.username = 'archive_exporter'; address.password = 'isolated-test'
    const exporter = new Client({ connectionString: address.href })
    await exporter.connect()
    try {
      const c = cursor(); c.lastTurn = 0
      const pub = published(); pub.cursors.set(id(1), c)
      const rejected = await readDiscoverySnapshot(exporter,pub)
      assert.equal(rejected.live,null)
      // Restore only the synthetic Runtime intent through the isolated GM login.
      const restore=new Client({connectionString:serviceAddress.href});await restore.connect()
      try { await restore.query('update survival_rpg.transcript_sessions set archive_intent=$1 where id=$2',[s2.archive_intent,s2.id]) }
      finally {await restore.end()}
      const result = await readDiscoverySnapshot(exporter, pub)
      assert.equal(result.report.candidate.source_session_uuid, id(2))
      assert.equal(result.report.candidate.pairs, 1)
      assert.equal(result.report.candidate.season_id, 'S04')
      assert.equal(result.report.database_writes, 0)
      await assert.rejects(exporter.query('select approved_by from survival_ops.archive_source_authorizations'),e=>e.code==='42501')
      assert.equal((await exporter.query("select current_setting('transaction_read_only') as ro")).rows[0].ro, 'on')
      // A real isolated RESTART RPC decision + restricted snapshot, not a mocked DTO.
      const b=session(3,{season_id:'S04',status:'OPEN',archive_intent:pending(intent(s2.id,{kind:'RESTART'}))})
      const capture=new Client({connectionString:serviceAddress.href});await capture.connect()
      try {
        await capture.query('select survival_rpg.close_public_transcript_session($1)',[s2.id])
        await capture.query('select survival_rpg.open_public_transcript_session_with_archive_intent($1,$2,$3,$4,$5)',
          [b.id,b.worldline_id,b.chronicle_id,b.season_id,b.archive_intent])
        for(const r of [row(b,0),row(b,1)]) await capture.query(`insert into survival_rpg.transcript_messages
          (worldline_id,chronicle_id,season_id,session_id,turn_no,message_order,role,content,content_sha256,game_time,idempotency_key)
          values ('AFTERFALL','C03',$1,$2,$3,$4,$5,$6,$7,$8,gen_random_uuid())`,
          [b.season_id,b.id,r.turn_no,r.message_order,r.role,r.content,r.content_sha256,r.game_time])
        await capture.query('update survival_rpg.transcript_sessions set last_message_order=1 where id=$1',[b.id])
      } finally {await capture.end()}
      const decide=new Client({connectionString:process.env.ARCHIVE_ISOLATED_DB_URL});await decide.connect()
      try {
        await decide.query('SET ROLE authenticated')
        await decide.query("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',false)")
        const superseded={...trusted[1].decision,disposition:'SUPERSEDED',publication:'REVIEW_REQUIRED',allow_continuation:false}
        const restart={...trusted[1].decision,supersedes_id:s2.id,approved_through:1}
        await assert.rejects(decide.query('select public.archive_operator_authorize_source($1,$2,$3)',
          [b.id,b.archive_intent,restart]),e=>e.message==='RESTART_SUPERSESSION_UNVERIFIED')
        await decide.query('select public.archive_operator_authorize_source($1,$2,$3,$4)',
          [s2.id,s2.archive_intent,superseded,trusted[1].decision])
        await decide.query('select public.archive_operator_authorize_source($1,$2,$3)',[b.id,b.archive_intent,restart])
      } finally {await decide.end()}
      const restarted=await readDiscoverySnapshot(exporter,pub)
      assert.equal(restarted.report.candidate.source_session_uuid,b.id)
      assert.equal(restarted.report.candidate.pairs,1)
      assert.equal(restarted.live.session.archive_intent.kind,'RESTART')
      pub.cursors.set(b.id,{...cursor(),season:'S04',lastTurn:0});pub.frontier=b.id;pub.latestSeason=4
      const repeat=await readDiscoverySnapshot(exporter,pub)
      assert.equal(repeat.live,null);assert.equal(repeat.report.candidate,null)
      assert.equal(pub.cursors.get(b.id).nextOrder,2)
    } finally { await exporter.end() }
  })
