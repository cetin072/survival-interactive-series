import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { VISUAL_STYLE, artDirection, selectVisualMood } from './visual-style.mjs'
import { compileVisualCatalog, validateVisualCatalog, planVisualSelection, legacyPublicAppearance, visualDigest, visualBytes } from './visual-compiler.mjs'

// Entirely synthetic unit data, not recovered dialogue or actual Canon.
const ns = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
const anchor = { save_version: 253, game_time: '2027-03-23 17:50' }
const proof = (i = 0) => ({ source_ref: 'archive/web/src/archive/archiveData.ts', source_sha256: 'a'.repeat(64), pointer: `/nodes/${i}` })
function seal(graph) { const { content_sha256, ...body } = graph; graph.content_sha256 = visualDigest(body); return graph }
function fixture() {
  const values = [
    ['char-player', 'character', ['PLAYER']], ['char-core', 'character', ['CORE']], ['char-missing', 'character', ['MAJOR']],
    ['loc-open', 'location', ['공개']], ['loc-restricted', 'location', ['공개']],
    ['event-winter', 'event', ['겨울']], ['event-unresolved', 'event', ['미결']], ['event-flood', 'event', ['침수']],
    ['ref-test', 'reference', ['REFERENCE']],
  ]
  const nodes = values.map(([id, type, tags], index) => ({ id,
    data: { id, label: `TEST ${id}`, type, tags, subtitle: '공개 시험 역할', summary: '공개된 시험용 시각 설명이다.', source: 'SYNTHETIC TEST ONLY' },
    anchor: { ...anchor }, evidence: proof(index), history: [],
  }))
  nodes[4].data.summary = '제한 공개 지원 거점으로 내부 정보는 비공개다.'
  const graph = seal({ version: 'archive-graph-v1', ...ns, anchor: { ...anchor }, nodes, relations: [], articles: [], story_links: [] })
  const appearances = { version: 'public-appearance-v1', ...ns, anchor: { ...anchor }, records: nodes.slice(0, 3).map((n, index) => ({
    node_id: n.id, status: index < 2 ? 'confirmed' : 'visual-backfill-needed',
    visual: index < 2 ? { apparentAge: '30대', build: '보통', face: '시험 외형', hair: '검은 머리', voice: '시험 목소리' } : {},
    evidence: { source_ref: 'archive/web/src/archive/characterAppearance.ts', source_sha256: 'b'.repeat(64), pointer: `/characters/${n.id}` },
  })) }
  return { batch: { batch_id: `batch-${'a'.repeat(64)}`, snapshot: { ...ns, season_id: 'S02', source_save_version: 253, source_game_time: anchor.game_time } }, graph, appearances }
}
function compile(f = fixture()) { return compileVisualCatalog(f) }
function reject(change) { const f = fixture(); change(f); assert.throws(() => { seal(f.graph); compile(f) }) }
function mapFixture() { return { asset_id: 'AF-MAP-001', visibility: 'PUBLIC_ARCHIVE', anchor: { ...anchor }, public_projection_sha256: 'c'.repeat(64), evidence: { source_ref: 'archive/content/public-maps/C03-AFTERFALL/S02/MAP.json', source_sha256: 'd'.repeat(64), pointer: '/map' } } }
function point(catalog, id) { return catalog.points.find((p) => p.subject_id === id) }
function advance(f) { f.batch.snapshot.source_save_version++; f.batch.snapshot.source_game_time = '2027-03-24 10:00'; f.graph.anchor = { save_version: 254, game_time: '2027-03-24 10:00' }; seal(f.graph) }

test('compiles real brief data but makes no image or execution claim', () => { const c = compile(); validateVisualCatalog(c); assert.equal(c.points.length, 8); assert.equal(c.skipped.length, 1); assert.equal(c.points.filter((p) => p.status === 'READY').length, 5); assert.equal(c.execution.enabled, false); assert.equal(c.execution.provider, null) })
test('same inputs give byte-identical catalog', () => assert.equal(visualBytes(compile()), visualBytes(compile())))
test('source iteration order does not change point or generation identity', () => { const f = fixture(); const a = compile(f); f.graph.nodes.reverse(); f.appearances.records.reverse(); seal(f.graph); const b = compile(f); assert.deepEqual(a.points, b.points) })
test('input object is not mutated', () => { const f = fixture(), before = structuredClone(f); compile(f); assert.deepEqual(f, before) })
test('references and factions are not automatically illustrations', () => { const f = fixture(); f.graph.nodes[8].data.type = 'faction'; seal(f.graph); assert.equal(compile(f).skipped.length, 1) })
test('one source with an environment tag creates one point, not an event duplicate', () => { const p = point(compile(), 'event-flood'); assert.equal(p.point_type, 'ENVIRONMENT'); assert.equal(p.asset_type, 'EVENT'); assert.equal(compile().points.filter((x) => x.subject_id === p.subject_id).length, 1) })
test('non-recurring character is skipped, not assigned a new portrait', () => { const f = fixture(); f.graph.nodes[0].data.tags = ['MINOR']; seal(f.graph); assert.equal(point(compile(f), 'char-player'), undefined) })
test('PLAYER and CORE portraits take priority over routine locations', () => { const c = compile(); assert.equal(c.points[0].subject_id, 'char-player'); assert.equal(c.points[1].subject_id, 'char-core') })
test('missing appearance leaves a waiting point with no invented brief', () => { const p = point(compile(), 'char-missing'); assert.equal(p.status, 'WAITING_CANON'); assert.equal(p.brief, null); assert.equal(p.generation_key, null) })
test('confirmed label alone without four physical anchors cannot pass', () => { const f = fixture(); f.appearances.records[0].visual = { hair: '검정', voice: '낮음' }; const p = point(compile(f), 'char-player'); assert.equal(p.status, 'WAITING_CANON') })
test('four real appearance fields are sufficient', () => assert.equal(point(compile(), 'char-player').status, 'READY'))
test('appearance source strings remain exact', () => { const f = fixture(); const p = point(compile(f), 'char-player'); assert.equal(p.brief.canon_facts.appearance.hair, f.appearances.records[0].visual.hair) })
test('voice and audit notes do not enter image instructions', () => { const p = point(compile(), 'char-player'); assert.ok(!JSON.stringify(p.brief).includes('시험 목소리')); assert.equal(p.brief.canon_facts.appearance.voice, undefined) })
test('a voice-only change does not schedule a new portrait identity', () => { const f = fixture(), before = point(compile(f), 'char-player').generation_key; f.appearances.records[0].visual.voice = '바뀐 목소리'; assert.equal(point(compile(f), 'char-player').generation_key, before) })
test('a confirmed physical appearance change creates a new generation key, not a new subject', () => { const f = fixture(), before = point(compile(f), 'char-player'); f.appearances.records[0].visual.hair = '짧아진 머리'; const after = point(compile(f), 'char-player'); assert.equal(after.point_id, before.point_id); assert.notEqual(after.generation_key, before.generation_key) })
test('book linkage and nonvisual character role do not regenerate a portrait', () => { const f = fixture(), before = point(compile(f), 'char-player').generation_key; f.graph.nodes[0].data.summary = '다른 공개된 역할 설명'; f.graph.story_links = [{ irrelevant: 'not sent to the brief' }]; seal(f.graph); assert.equal(point(compile(f), 'char-player').generation_key, before) })
test('unrelated checkout/anchor progression does not change generation key', () => { const f = fixture(), before = compile(f).points; advance(f); const after = compile(f).points; assert.deepEqual(after.map((p) => p.generation_key), before.map((p) => p.generation_key)) })
test('source provenance remains attached outside the provider-neutral brief', () => { const p = point(compile(), 'char-player'); assert.equal(p.source_refs.length, 2); assert.ok(!JSON.stringify(p.brief).includes('archive/')); assert.equal(p.registry_asset_id, null) })
test('location brief is illustrative, not a claimed floor plan', () => { const p = point(compile(), 'loc-open'); assert.equal(p.brief.canon_facts.public_description, '공개된 시험용 시각 설명이다.'); assert.match(p.brief.scope, /not surveyed architecture/); assert.ok(p.brief.safeguards.some((s) => s.includes('floor counts'))) })
test('restricted location description is withheld', () => { const p = point(compile(), 'loc-restricted'); assert.equal(p.status, 'WAITING_CANON'); assert.equal(p.brief, null) })
test('unresolved visual scope is not completed by invention', () => { const p = point(compile(), 'event-unresolved'); assert.equal(p.reason, 'WAITING_RESOLVED_VISUAL_SCOPE'); assert.equal(p.brief, null) })
test('event descriptions do not add names from graph co-mentions', () => { const f = fixture(); f.graph.relations = [{ from: 'char-player', to: 'event-winter', guessed: true }]; seal(f.graph); assert.ok(!JSON.stringify(point(compile(f), 'event-winter').brief).includes('char-player')) })
test('no map is fabricated from public graph node names', () => { const c = compile(); assert.equal(c.map_gate, 'WAITING_PUBLIC_MAP_PROJECTION'); assert.equal(c.points.filter((p) => p.point_type === 'MAP').length, 0) })
test('approved map creates atmosphere-only brief using existing singleton', () => { const f = fixture(); f.publicMap = mapFixture(); const c = compile(f), p = point(c, 'public-map'); validateVisualCatalog(c); assert.equal(p.registry_asset_id, 'AF-MAP-001'); assert.equal(p.asset_type, 'WORLD_MAP'); assert.equal(p.reason, 'ATMOSPHERE_ONLY_NOT_FINAL_MAP'); assert.deepEqual(p.brief.canon_facts, {}) })
for (const visibility of ['PLAYER_ARCHIVE', 'CORE_PRIVATE', undefined]) {
  test(`rejects ${visibility} map projection`, () => reject((f) => { f.publicMap = mapFixture(); f.publicMap.visibility = visibility }))
  test(`rejects ${visibility} graph`, () => reject((f) => { f.graph.visibility = visibility }))
  test(`rejects ${visibility} appearances`, () => reject((f) => { f.appearances.visibility = visibility }))
}
test('map topology, routes and coordinates cannot be accepted by image contract', () => { for (const key of ['nodes', 'edges', 'coordinates', 'distance', 'routes']) reject((f) => { f.publicMap = { ...mapFixture(), [key]: ['PRIVATE_TEST'] } }) })
test('map projection hash is not sent to the image renderer', () => { const f = fixture(); f.publicMap = mapFixture(); assert.ok(!JSON.stringify(point(compile(f), 'public-map').brief).includes('c'.repeat(64))) })
test('cannot silently create another map singleton', () => reject((f) => { f.publicMap = { ...mapFixture(), asset_id: 'AF-MAP-002' } }))
test('map requires the vetted public-map source path', () => reject((f) => { f.publicMap = mapFixture(); f.publicMap.evidence.source_ref = 'archive/web/src/archive/archiveData.ts' }))
test('future graph cannot leak into older batch', () => reject((f) => { f.graph.anchor = { save_version: 254, game_time: '2027-03-24 00:00' } }))
test('future appearances cannot leak into older batch', () => reject((f) => { f.appearances.anchor = { save_version: 254, game_time: '2027-03-24 00:00' } }))
test('future node record is rejected', () => reject((f) => { f.graph.nodes[0].anchor.save_version = 254 }))
test('wrong Chronicle in graph is rejected', () => reject((f) => { f.graph.chronicle_id = 'C02-STRONGHOLD' }))
test('wrong worldline in batch is rejected', () => reject((f) => { f.batch.snapshot.worldline_id = 'STRONGHOLD' }))
test('corrupted graph checksum is rejected', () => { const f = fixture(); f.graph.nodes[0].data.summary = 'CORRUPTED'; assert.throws(() => compile(f), /HASH_MISMATCH/) })
test('duplicate graph nodes rejected', () => reject((f) => f.graph.nodes.push(f.graph.nodes[0])))
test('duplicate appearance records rejected', () => reject((f) => f.appearances.records.push(f.appearances.records[0])))
test('appearance attached to a non-character rejected', () => reject((f) => { f.appearances.records[0].node_id = 'loc-open' }))
test('unsupported hidden fields fail closed', () => { reject((f) => { f.graph.gm_state = 'PRIVATE_TEST' }); reject((f) => { f.graph.nodes[0].data.hidden_state = 'PRIVATE_TEST' }); reject((f) => { f.appearances.records[0].visual.secret = 'PRIVATE_TEST' }) })
test('raw coordinate metadata is rejected rather than filtered into an image', () => reject((f) => { f.graph.nodes[3].data.meta = { coordinates: '1,2' } }))
test('invalid evidence and path traversal rejected', () => { reject((f) => { f.graph.nodes[0].evidence.source_sha256 = 'bad' }); reject((f) => { f.appearances.records[0].evidence.source_ref = 'archive/content/public-facts/C03-AFTERFALL/S02/../SECRET.json' }) })
test('array or object instead of appearance text rejected', () => reject((f) => { f.appearances.records[0].visual.hair = { secret: 'PRIVATE_TEST' } }))
test('invalid calendar date rejected', () => reject((f) => { f.appearances.anchor.game_time = '2027-02-30 00:00' }))
test('legacy public appearance projection does not carry audit note, voice prose or runtime refs', () => { const result = legacyPublicAppearance({ 'char-player': { status: 'confirmed', publicDescription: 'NOT_COPIED', sourceRefs: ['runtime/private/reference'], visual: { hair: '검정' }, auditNote: 'NOT_COPIED' } }, 'b'.repeat(64)); assert.ok(!JSON.stringify(result).includes('NOT_COPIED')); assert.ok(!JSON.stringify(result).includes('runtime/')) })
test('legacy adapter rejects unknown data fields', () => assert.throws(() => legacyPublicAppearance({ 'char-player': { status: 'confirmed', visual: {}, hidden_state: 'x' } }, 'a'.repeat(64))))
test('default style is shared and frozen', () => { assert.equal(VISUAL_STYLE.id, 'AFTERFALL_ARCHIVE_V1'); assert.throws(() => VISUAL_STYLE.rendering.push('photorealism')); assert.throws(() => { VISUAL_STYLE.moods.QUIET_DECAY[0] = 'neon' }) })
test('red horizon only when explicitly tagged', () => { assert.equal(selectVisualMood('EVENT', ['겨울']), 'QUIET_DECAY'); assert.equal(selectVisualMood('EVENT', ['RED_HORIZON']), 'RED_HORIZON') })
test('quiet fantasy uses source-tagged spring, not a current date guess', () => { assert.equal(selectVisualMood('ENVIRONMENT', ['봄전환']), 'QUIET_FANTASY'); assert.equal(selectVisualMood('LOCATION', []), 'QUIET_DECAY'); assert.ok(artDirection('ENVIRONMENT', ['봄전환']).avoid.some((s) => s.includes('magic'))) })
test('vast world and portrait composition remain different', () => { assert.equal(selectVisualMood('ENVIRONMENT', ['VAST_WORLD']), 'VAST_WORLD'); assert.match(artDirection('CHARACTER', []).composition, /master portrait/) })
test('all moods pass exact serialized preset validation', () => { for (const tag of ['QUIET_DECAY', 'VAST_WORLD', 'RED_HORIZON', 'QUIET_FANTASY']) { const f = fixture(); f.graph.nodes[7].data.tags.push(tag); seal(f.graph); validateVisualCatalog(compile(f)) } })
test('unknown style mutation rejected even with recomputed catalog hash', () => { const c = compile(); c.points[0].brief.art_direction.avoid = []; c.points[0].generation_key = `generation-${visualDigest(c.points[0].brief)}`; seal(c); assert.throws(() => validateVisualCatalog(c), /MODIFIED_VISUAL_STYLE/) })
test('default selection is at most three briefs, no image calls', () => { const s = planVisualSelection(compile()); assert.equal(s.selected_point_ids.length, 3); assert.equal(s.provider_calls, 0); assert.equal(s.execution_enabled, false) })
test('daily remaining attempts constrain selection', () => assert.equal(planVisualSelection(compile(), { daily_attempts: 5 }).selected_point_ids.length, 1))
test('daily or batch ceiling selects nothing', () => { assert.equal(planVisualSelection(compile(), { daily_attempts: 6 }).selected_point_ids.length, 0); assert.equal(planVisualSelection(compile(), { batch_attempts: 3 }).selected_point_ids.length, 0) })
test('one initial attempt plus two retries is the asset ceiling', () => { const c = compile(), id = c.points[0].point_id; assert.ok(planVisualSelection(c, { asset_attempts: { [id]: 2 } }).selected_point_ids.includes(id)); assert.ok(!planVisualSelection(c, { asset_attempts: { [id]: 3 } }).selected_point_ids.includes(id)) })
test('exact successful receipt prevents duplicate creation', () => { const c = compile(), p = c.points[0]; const s = planVisualSelection(c, { receipts: [{ point_id: p.point_id, generation_key: p.generation_key, visibility: 'PUBLIC_ARCHIVE', status: 'GENERATED' }] }); assert.equal(s.already_rendered, 1); assert.ok(!s.selected_point_ids.includes(p.point_id)) })
test('receipt for a different visual revision does not suppress a new brief', () => { const c = compile(), p = c.points[0]; const s = planVisualSelection(c, { receipts: [{ point_id: p.point_id, generation_key: `generation-${'f'.repeat(64)}`, visibility: 'PUBLIC_ARCHIVE', status: 'PUBLISHED' }] }); assert.equal(s.already_rendered, 0) })
test('private or malformed receipts rejected', () => { const c = compile(), p = c.points[0]; assert.throws(() => planVisualSelection(c, { receipts: [{ point_id: p.point_id, generation_key: p.generation_key, visibility: 'CORE_PRIVATE', status: 'PUBLISHED' }] })); assert.throws(() => planVisualSelection(c, { receipts: [{ point_id: p.point_id, generation_key: p.generation_key, visibility: 'PUBLIC_ARCHIVE', status: 'READY' }] })) })
test('duplicate receipts are rejected', () => { const c = compile(), p = c.points[0], r = { point_id: p.point_id, generation_key: p.generation_key, visibility: 'PUBLIC_ARCHIVE', status: 'GENERATED' }; assert.throws(() => planVisualSelection(c, { receipts: [r, r] })) })
test('negative and string attempt counters rejected', () => { assert.throws(() => planVisualSelection(compile(), { batch_attempts: -1 })); assert.throws(() => planVisualSelection(compile(), { daily_attempts: '0' })) })
test('paid execution flags are not accepted by planner', () => assert.throws(() => planVisualSelection(compile(), { allow_paid: true })))
test('environment variables cannot enable a provider', () => { const prior = process.env.ALLOW_PAID_GENERATION; try { process.env.ALLOW_PAID_GENERATION = 'true'; assert.equal(planVisualSelection(compile()).execution_enabled, false) } finally { if (prior === undefined) delete process.env.ALLOW_PAID_GENERATION; else process.env.ALLOW_PAID_GENERATION = prior } })
test('waiting points cannot be promoted by inserting a brief into a stored catalog', () => { const c = compile(), p = point(c, 'char-missing'); p.brief = { malicious: true }; seal(c); assert.throws(() => validateVisualCatalog(c)) })
test('serialized catalog integrity corruption rejected', () => { const c = compile(); c.points[0].title = 'CORRUPTED'; assert.throws(() => planVisualSelection(c), /HASH_MISMATCH/) })
test('all output remains derived data, not Canon/registry updates', () => { const s = planVisualSelection(compile()); assert.equal(s.database_writes, 0); assert.equal(s.site_publications, 0); assert.equal(s.images_generated, 0) })
test('pure compiler imports no network, storage, game runtime or provider', async () => { const text = await readFile(new URL('./visual-compiler.mjs', import.meta.url), 'utf8'); assert.doesNotMatch(text, /fetch\s*\(|node:fs|node:child_process|writeFile\s*\(|process\.env|provider\.generate/); })
