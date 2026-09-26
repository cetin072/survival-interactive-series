import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reconcilePublicGraph, graphHash, graphBytes, byteHash, relationId, legacyPublicFacts } from './publication-graph.mjs'
import { writeGraphAtomically } from './atomic-graph.mjs'

// Synthetic, metadata-only examples. Never committed as a played scene or Canon.
const namespace = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
const boundary = { save_version: 253, game_time: '2027-03-23 17:50' }
const node = (id, type = 'character', label = '시험인물') => ({ id, type, label, subtitle: 'TEST ONLY', summary: '공개 시험 설명', tags: ['TEST'], source: 'SYNTHETIC_TEST_ONLY' })
function fixture() {
  const a = { ...node('char-test', 'character', '시험인물'), meta: { 별칭: '옛이름' } }, b = node('loc-test', 'location', '시험건물'), e = node('event-test', 'event', '시험사건')
  return {
    batch: { batch_id: `batch-${'a'.repeat(64)}`, snapshot: { ...namespace, season_id: 'S02', source_save_version: 253, source_game_time: boundary.game_time } },
    facts: { version: 'public-graph-facts-v1', ...namespace, season_id: 'S02', anchor: { ...boundary }, nodes: [a, b, e], relations: [{ from: a.id, to: b.id, kind: 'works_at', label: '근무' }] },
    source: { source_ref: 'archive/content/public-facts/C03-AFTERFALL/S02/TEST.json', source_sha256: 'a'.repeat(64) },
    book: { chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', chapters: [{ id: 'c03-afterfall-chapter-01', title: '시험 장면', sourceKind: 'VERIFIED_GM_NARRATIVE', relatedNodeIds: [], body: '시험인물은 시험건물에서 만났다. 옛이름도 기록했다.' }] },
    bookSource: { source_ref: 'archive/content/stories/C03-AFTERFALL/BOOK.json', source_sha256: 'b'.repeat(64) },
  }
}
function next(f) { f.batch.snapshot.source_save_version++; f.batch.snapshot.source_game_time = '2027-03-24 10:00'; f.facts.anchor = { save_version: f.batch.snapshot.source_save_version, game_time: f.batch.snapshot.source_game_time }; return f }
function rejects(edit) { const f = fixture(); edit(f); assert.throws(() => reconcilePublicGraph(f)) }
function reseal(g) { const { content_sha256, ...body } = g; g.content_sha256 = graphHash(body); return g }

test('compiles public nodes, explicit relations and articles', () => { const r = reconcilePublicGraph(fixture()); assert.equal(r.graph.nodes.length, 3); assert.equal(r.graph.relations.length, 1); assert.equal(r.graph.articles.length, 3); assert.equal(r.report.inferred_relationships, 0) })
test('same inputs produce byte-identical graph and report', () => assert.deepEqual(reconcilePublicGraph(fixture()), reconcilePublicGraph(fixture())))
test('repeat graph reconciliation is NOOP', () => { const f = fixture(); f.previous = reconcilePublicGraph(f).graph; const again = reconcilePublicGraph(f); assert.equal(again.report.status, 'NOOP'); assert.equal(again.report.unchanged_records, 4) })
test('does not mutate caller-owned inputs', () => { const f = fixture(), old = structuredClone(f); reconcilePublicGraph(f); assert.deepEqual(f, old) })
test('node ids and prior public prose are preserved', () => { const f = fixture(), r = reconcilePublicGraph(f); assert.deepEqual(r.graph.nodes.find((n) => n.id === 'char-test').data, f.facts.nodes[0]); assert.equal(r.graph.articles.find((n) => n.id === 'char-test').overview, f.facts.nodes[0].summary) })
test('node update on newer save records history', () => { const f = fixture(); f.previous = reconcilePublicGraph(f).graph; next(f); f.facts.nodes[0].summary = '새 공개 시험 설명'; const r = reconcilePublicGraph(f); assert.equal(r.report.nodes_updated, 1); assert.equal(r.graph.nodes.find((n) => n.id === 'char-test').history.length, 1) })
test('same-save conflicting node does not silently overwrite', () => { const f = fixture(); f.previous = reconcilePublicGraph(f).graph; f.facts.nodes[0].summary = 'CONFLICT'; assert.throws(() => reconcilePublicGraph(f), /SAME_REVISION/) })
test('node type cannot change even on a later save', () => { const f = fixture(); f.previous = reconcilePublicGraph(f).graph; next(f); f.facts.nodes[0].type = 'location'; assert.throws(() => reconcilePublicGraph(f), /ENTITY_TYPE_CHANGED/) })
test('omission of a node or edge never deletes existing state', () => { const f = fixture(); f.previous = reconcilePublicGraph(f).graph; next(f); f.facts.nodes = []; f.facts.relations = []; const r = reconcilePublicGraph(f); assert.equal(r.graph.nodes.length, 3); assert.equal(r.graph.relations.length, 1) })
test('older batch cannot roll back a newer graph', () => { const f = fixture(), first = reconcilePublicGraph(f); f.previous = first.graph; next(f); f.facts.nodes[0].summary = 'LATEST'; const latest = reconcilePublicGraph(f).graph; const old = fixture(); old.previous = latest; const r = reconcilePublicGraph(old); assert.equal(r.graph.nodes.find((n) => n.id === 'char-test').data.summary, 'LATEST'); assert.equal(r.graph.anchor.save_version, 254); assert.equal(r.report.status, 'NOOP') })
test('an old batch cannot add a new lost entity into current state', () => { const f = fixture(); next(f); const latest = reconcilePublicGraph(f).graph; const old = fixture(); old.previous = latest; old.facts.nodes.push(node('char-old')); const r = reconcilePublicGraph(old); assert.equal(r.graph.nodes.length, 3) })
test('time and save progression must agree', () => rejects((f) => { f.previous = reconcilePublicGraph(f).graph; f.batch.snapshot.source_save_version++; f.facts.anchor.save_version++; f.facts.anchor.game_time = f.batch.snapshot.source_game_time = '2027-03-22 00:00' }))
test('future facts cannot be used by earlier snapshot', () => rejects((f) => { f.facts.anchor.save_version++ }))
test('invalid date rejected', () => rejects((f) => { f.facts.anchor.game_time = '2027-02-30 00:00' }))
test('string save version rejected', () => rejects((f) => { f.facts.anchor.save_version = '253' }))
test('duplicate node ids rejected', () => rejects((f) => f.facts.nodes.push(f.facts.nodes[0])))
test('duplicate semantic relation rejected', () => rejects((f) => f.facts.relations.push({ ...f.facts.relations[0], label: '중복' })))
test('dangling relation rejected', () => rejects((f) => { f.facts.relations[0].to = 'missing' }))
test('self relationship rejected', () => rejects((f) => { f.facts.relations[0].to = 'char-test' }))
test('typed relationship endpoints checked', () => rejects((f) => { f.facts.relations[0].kind = 'participated_in' }))
test('unsupported relation kind rejected', () => rejects((f) => { f.facts.relations[0].kind = 'secret_motive' }))
test('explicit participated_in and occurred_at are preserved', () => { const f = fixture(); f.facts.relations = [{ from: 'char-test', to: 'event-test', kind: 'participated_in', label: '참여' }, { from: 'event-test', to: 'loc-test', kind: 'occurred_at', label: '발생 장소' }]; assert.equal(reconcilePublicGraph(f).graph.relations.length, 2) })
test('typed relationship identity is stable across label corrections', () => { const a = fixture().facts.relations[0]; assert.equal(relationId(a), relationId({ ...a, label: '변경' })) })
test('different legacy labels are not wrongly collapsed', () => { const a = { ...fixture().facts.relations[0], kind: 'published_relation' }; assert.notEqual(relationId(a), relationId({ ...a, label: '다른 공개 관계' })) })
test('newer relationship label keeps one edge and history', () => { const f = fixture(); f.previous = reconcilePublicGraph(f).graph; next(f); f.facts.relations[0].label = '새 근무 표시'; const r = reconcilePublicGraph(f); assert.equal(r.graph.relations.length, 1); assert.equal(r.graph.relations[0].history.length, 1) })
for (const visibility of ['PLAYER_ARCHIVE', 'CORE_PRIVATE', undefined]) {
  test(`rejects ${visibility} facts`, () => rejects((f) => { f.facts.visibility = visibility }))
  test(`rejects ${visibility} batch`, () => rejects((f) => { f.batch.snapshot.visibility = visibility }))
}
test('cross Chronicle rejected', () => rejects((f) => { f.facts.chronicle_id = 'C02-STRONGHOLD' }))
test('wrong worldline rejected', () => rejects((f) => { f.batch.snapshot.worldline_id = 'STRONGHOLD' }))
test('cross-season source reference rejected', () => rejects((f) => { f.source.source_ref = f.source.source_ref.replace('S02', 'S03') }))
test('private source path rejected', () => rejects((f) => { f.source.source_ref = 'worldlines/AFTERFALL/CURRENT_STATE.json' }))
test('traversal source path rejected', () => rejects((f) => { f.source.source_ref = 'archive/content/public-facts/C03-AFTERFALL/S02/../SECRET.json' }))
test('invalid source hash rejected', () => rejects((f) => { f.source.source_sha256 = 'bad' }))
test('hidden top-level fields rejected rather than published', () => rejects((f) => { f.facts.gm_state = 'PRIVATE_TEST' }))
test('hidden nested node fields rejected', () => rejects((f) => { f.facts.nodes[0].hidden_state = 'PRIVATE_TEST' }))
test('hidden relationship payload rejected', () => rejects((f) => { f.facts.relations[0].secret = 'PRIVATE_TEST' }))
test('non-string metadata and reserved fields rejected', () => { rejects((f) => { f.facts.nodes[0].meta = { coordinates: 'PRIVATE_TEST' } }); rejects((f) => { f.facts.nodes[0].meta = { field: { hidden_state: 'x' } } }) })
test('malformed previous graph hash rejected', () => { const f = fixture(); f.previous = reconcilePublicGraph(f).graph; f.previous.nodes[0].data.summary = 'CHANGED'; assert.throws(() => reconcilePublicGraph(f), /INTEGRITY/) })
test('unknown prior record field rejected even with new hash', () => { const f = fixture(); f.previous = reconcilePublicGraph(f).graph; f.previous.nodes[0].gm_state = {}; reseal(f.previous); assert.throws(() => reconcilePublicGraph(f)) })
test('unknown previous namespace rejected', () => { const f = fixture(); f.previous = reconcilePublicGraph(f).graph; f.previous.chronicle_id = 'C02-STRONGHOLD'; reseal(f.previous); assert.throws(() => reconcilePublicGraph(f)) })
test('wrong Reader Chronicle rejected', () => rejects((f) => { f.book.chronicleId = 'C02-STRONGHOLD' }))
test('private Reader chapter rejected', () => rejects((f) => { f.book.chapters[0].publicationProvenance = { visibility: 'PLAYER_ARCHIVE', capturedRange: { end: boundary.game_time } } }))
test('future chapter omitted until its public batch boundary', () => { const f = fixture(); f.book.chapters[0].publicationProvenance = { visibility: 'PUBLIC_ARCHIVE', capturedRange: { end: '2027-03-24 00:00' } }; assert.equal(reconcilePublicGraph(f).graph.story_links.length, 0) })
test('duplicate chapter ids rejected', () => rejects((f) => f.book.chapters.push(f.book.chapters[0])))
test('unknown editorial id rejected', () => rejects((f) => { f.book.chapters[0].relatedNodeIds = ['c02-person'] }))
test('explicit Reader link exists even without a literal mention', () => { const f = fixture(); f.book.chapters[0].body = '다른 문장'; f.book.chapters[0].relatedNodeIds = ['event-test']; const r = reconcilePublicGraph(f); assert.equal(r.graph.story_links[0].node_id, 'event-test'); assert.equal(r.graph.story_links[0].reasons[0].kind, 'EDITORIAL_REFERENCE') })
test('Korean particles match unique exact names', () => { const r = reconcilePublicGraph(fixture()); assert.equal(r.graph.story_links.length, 2); const link = r.graph.story_links.find((l) => l.node_id === 'char-test'); assert.equal(link.reasons.filter((r) => r.kind === 'EXACT_TEXT_MENTION').length, 2) })
test('similar substring is not a character match', () => { const f = fixture(); f.book.chapters[0].body = '가짜시험인물과 시험인물복제품'; assert.equal(reconcilePublicGraph(f).graph.story_links.length, 0) })
test('ambiguous alias is withheld rather than resolved by guess', () => { const f = fixture(); f.facts.nodes.push({ ...node('char-other', 'character', '다른사람'), meta: { 별칭: '옛이름' } }); f.book.chapters[0].body = '옛이름은 기록했다.'; const r = reconcilePublicGraph(f); assert.equal(r.graph.story_links.length, 0); assert.equal(r.report.ambiguous_aliases, 1) })
test('same-scene mentions never create a social relationship', () => { const f = fixture(); f.facts.relations = []; const r = reconcilePublicGraph(f); assert.equal(r.graph.story_links.length, 2); assert.equal(r.graph.relations.length, 0); assert.equal(r.report.inferred_relationships, 0) })
test('mention evidence contains offsets and body hash, not invented prose', () => { const f = fixture(), r = reconcilePublicGraph(f); const l = r.graph.story_links.find((l) => l.node_id === 'char-test'); assert.equal(l.body_sha256, byteHash(f.book.chapters[0].body)); assert.equal(l.reasons[0].offsets[0], 0) })
test('article relations are two-way navigation without changing edge direction', () => { const r = reconcilePublicGraph(fixture()); assert.equal(r.graph.articles.find((n) => n.id === 'char-test').relations[0].direction, 'outgoing'); assert.equal(r.graph.articles.find((n) => n.id === 'loc-test').relations[0].direction, 'incoming') })
test('legacy adapter retains only the explicitly known deployed baseline', () => { const f = fixture(); const s = legacyPublicFacts({ archiveMeta: { worldline: 'AFTERFALL', season: 'S02 COMPLETE', saveVersion: '253', gameTime: boundary.game_time }, archiveNodes: f.facts.nodes, archiveEdges: [{ from: 'char-test', to: 'loc-test', label: '공개 기존관계' }] }); assert.equal(s.relations[0].kind, 'published_relation'); assert.equal(s.visibility, 'PUBLIC_ARCHIVE') })
test('changed baseline metadata requires review', () => assert.throws(() => legacyPublicFacts({ archiveMeta: { worldline: 'AFTERFALL', season: 'S03', saveVersion: '999' } })))
test('no image generation, database or site-publication effect', () => { const r = reconcilePublicGraph(fixture()).report; assert.equal(r.database_writes, 0); assert.equal(r.external_calls, 0); assert.equal(r.site_publications, 0) })

async function disk(fn) { const dir = await mkdtemp(join(tmpdir(), 'graph-test-')); try { await fn(join(dir, 'GRAPH.json'), dir) } finally { await rm(dir, { recursive: true, force: true }) } }
test('first graph is created atomically', async () => disk(async (file) => { const r = await writeGraphAtomically(file, null, 'GRAPH'); assert.equal(r.files_written, 1); assert.equal(await readFile(file, 'utf8'), 'GRAPH') }))
test('unchanged local graph produces no write', async () => disk(async (file) => { await writeFile(file, 'GRAPH'); assert.equal((await writeGraphAtomically(file, 'GRAPH', 'GRAPH')).status, 'NOOP') }))
test('existing graph is replaced only with a complete output', async () => disk(async (file) => { await writeFile(file, 'OLD'); await writeGraphAtomically(file, 'OLD', 'NEW'); assert.equal(await readFile(file, 'utf8'), 'NEW') }))
test('stale expected bytes cannot overwrite a graph', async () => disk(async (file) => { await writeFile(file, 'OLD'); await assert.rejects(writeGraphAtomically(file, 'STALE', 'NEW')); assert.equal(await readFile(file, 'utf8'), 'OLD') }))
test('existing lock is not stolen', async () => disk(async (file) => { await writeFile(`${file}.publication-lock`, 'OWNER'); await assert.rejects(writeGraphAtomically(file, null, 'NEW')); assert.equal(await readFile(`${file}.publication-lock`, 'utf8'), 'OWNER') }))
test('failure before replace preserves good graph and removes own temporary', async () => disk(async (file, dir) => { await writeFile(file, 'OLD'); await assert.rejects(writeGraphAtomically(file, 'OLD', 'NEW', { beforeCommit: async () => { throw Error('TEST_IO') } })); assert.equal(await readFile(file, 'utf8'), 'OLD'); assert.deepEqual(await readdir(dir), ['GRAPH.json']) }))
test('concurrent create is never overwritten', async () => disk(async (file) => { await assert.rejects(writeGraphAtomically(file, null, 'NEW', { beforeCommit: async () => writeFile(file, 'OTHER') })); assert.equal(await readFile(file, 'utf8'), 'OTHER') }))
test('concurrent existing edit is retained', async () => disk(async (file) => { await writeFile(file, 'OLD'); await assert.rejects(writeGraphAtomically(file, 'OLD', 'NEW', { beforeCommit: async () => writeFile(file, 'OTHER') })); assert.equal(await readFile(file, 'utf8'), 'OTHER') }))
test('symlinked graph file is rejected', async () => disk(async (file, dir) => { const target = join(dir, 'TARGET'); await writeFile(target, 'ORIGINAL'); await symlink(target, file); await assert.rejects(writeGraphAtomically(file, null, 'NEW')); assert.equal(await readFile(target, 'utf8'), 'ORIGINAL') }))
test('symlinked output parent is rejected', async () => disk(async (file, dir) => { const linkPath = join(dir, 'link'); await symlink(dir, linkPath); await assert.rejects(writeGraphAtomically(join(linkPath, 'OTHER.json'), null, 'NEW')) }))
test('RAW and another Chronicle are untouched', async () => disk(async (file, dir) => { await writeFile(join(dir, 'RAW.md'), 'RAW'); await writeFile(join(dir, 'C02.json'), 'C02'); await writeGraphAtomically(file, null, 'GRAPH'); assert.equal(await readFile(join(dir, 'RAW.md'), 'utf8'), 'RAW'); assert.equal(await readFile(join(dir, 'C02.json'), 'utf8'), 'C02') }))
test('node-only output without links is valid', () => { const f = fixture(); f.book.chapters = []; f.facts.relations = []; const r = reconcilePublicGraph(f); assert.equal(r.graph.story_links.length, 0); assert.equal(r.graph.articles.length, 3) })
test('canonical serialization is independent of object insertion order', () => assert.equal(graphBytes({ z: 1, a: 2 }), graphBytes({ a: 2, z: 1 })))
