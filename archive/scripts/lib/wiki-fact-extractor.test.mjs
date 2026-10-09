import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { byteHash, graphHash, reconcilePublicGraph, reconcilePublicGraphBackfill } from './publication-graph.mjs'
import { discoverWikiSources, discoverWikiSource } from './wiki-semantic-jobs.mjs'
import { createAppliedWikiTestSnapshot } from './test-applied-wiki-snapshot.mjs'
import { buildWikiFactJob, buildWikiFactReviewJob, compileWikiFactProposal, extractWikiFacts, reviewWikiFactProposal, validateWikiFactReview, WIKI_RESULT_VERSION, WIKI_REVIEW_VERSION } from './wiki-fact-extractor.mjs'
import { runWikiFactCli } from '../run-wiki-fact-extractor.mjs'

const root = resolve(import.meta.dirname, '../../..')
const appliedSnapshot = await createAppliedWikiTestSnapshot(root)
after(async () => appliedSnapshot.cleanup())
const appliedBase = appliedSnapshot.base
const NS = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
const ANCHOR = { save_version: 10, game_time: '2027-01-01 12:00' }
const book = { chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', chapters: [] }
const bookSource = { source_ref: 'archive/content/stories/C03-AFTERFALL/BOOK.json', source_sha256: 'b'.repeat(64) }
const seed = { id: 'char-existing', label: '기존인물', type: 'character', subtitle: '기존 역할', summary: '기존 공개 설명', tags: ['기존태그'], source: 'SYNTHETIC_TEST_ONLY', meta: { 별칭: '옛이름', 보존항목: '그대로' } }
function batch(anchor, digest = 'a'.repeat(64)) {
  return { batch_id: `batch-${digest}`, snapshot: { ...NS, season_id: 'S03', source_save_version: anchor.save_version, source_game_time: anchor.game_time } }
}
function fixture(session = 'SESSION_008', person = '시험인물') {
  const facts = { version: 'public-graph-facts-v1', ...NS, season_id: 'S03', anchor: ANCHOR, nodes: [seed], relations: [] }
  const graph = reconcilePublicGraph({ batch: batch(ANCHOR), facts, source: { source_ref: 'archive/content/public-facts/C03-AFTERFALL/S03/TEST.json', source_sha256: 'a'.repeat(64) }, book, bookSource }).graph
  const body = `${person}은 시험작업장에서 일한다.\n기존인물은 새 기록을 맡았다.\n\n## 다음 큰 판단\n1. 미등장인물을 고용한다.`
  const source = { sourceSession: { session_id: session }, sourceManifestRef: `archive/content/transcripts/C03-AFTERFALL/S03/${session}/SOURCE_MANIFEST.json`, sourceDigest: 'c'.repeat(64), rawRef: `archive/content/transcripts/C03-AFTERFALL/S03/${session}/PART_001.md`, rawSha256: byteHash(body), anchor: { save_version: 11, game_time: '2027-01-02 12:00' }, gmBlocks: [{ messageLabel: '001', body }] }
  const job = buildWikiFactJob(source, graph)
  const proof = (fields, quote = 'q1') => Object.fromEntries(fields.map((field) => [field, [quote]]))
  const result = { version: WIKI_RESULT_VERSION, job_id: job.job_id, decision: 'FACTS_READY', coverage: { status: 'COMPLETE', reviewed_blocks: ['001'] },
    nodes: [
      { key: 'new:person', existing_id: null, type: 'character', label: person, changes: { subtitle: '작업자', summary: '시험작업장에서 일한다.' }, evidence: proof(['type', 'label', 'subtitle', 'summary']) },
      { key: 'new:place', existing_id: null, type: 'location', label: '시험작업장', changes: { subtitle: '일하는 장소', summary: '시험인물의 작업 장소다.' }, evidence: proof(['type', 'label', 'subtitle', 'summary']) },
      { key: 'char-existing', existing_id: 'char-existing', type: 'character', label: '기존인물', changes: { meta: { 새역할: '새 기록 담당' } }, evidence: proof(['type', 'label', 'meta.새역할'], 'q2') },
    ], relations: [{ from: 'new:person', to: 'new:place', kind: 'works_at', label: '근무', evidence: ['q1'] }],
    citations: [{ id: 'q1', block_id: '001', quote: `${person}은 시험작업장에서 일한다.` }, { id: 'q2', block_id: '001', quote: '기존인물은 새 기록을 맡았다.' }], deferred: [], note: 'SYNTHETIC_TEST_ONLY' }
  return { source, graph, job, result }
}
function rejection(name, edit, pattern = /WIKI_/) {
  test(name, () => { const f = fixture(); edit(f); assert.throws(() => compileWikiFactProposal(f.job, f.result), pattern) })
}

test('generic adapter accepts a previously unknown session and stable entity identities', async () => {
  for (const session of ['SESSION_008', 'SESSION_032', 'SESSION_999']) {
    const f = fixture(session, '다른시험인물')
    let calls = 0
    const p = await extractWikiFacts(f.job, async (job) => { calls++; assert.equal(job.source.session_id, session); return f.result })
    assert.equal(calls, 1); assert.equal(p.facts.nodes[0].label, '다른시험인물')
    assert.equal(p.status, 'FACTS_PROPOSED'); assert.equal(p.review_required, true)
    assert.equal(p.source_marked_processed, false); assert.equal(p.graph_changed, false)
  }
  assert.equal(compileWikiFactProposal(fixture().job, fixture().result).facts.nodes[0].id,
    compileWikiFactProposal(fixture('SESSION_032').job, fixture('SESSION_032').result).facts.nodes[0].id)
})
test('there is no fake default semantic model', async () => { const f = fixture(); await assert.rejects(extractWikiFacts(f.job), /WIKI_MODEL_ADAPTER_REQUIRED/) })
test('repeat compilation is byte-identical and caller-owned objects are not mutated', () => {
  const f = fixture(), original = structuredClone(f)
  assert.deepEqual(compileWikiFactProposal(f.job, f.result), compileWikiFactProposal(f.job, f.result))
  assert.deepEqual(f, original)
})
test('updates preserve unrelated existing metadata and identity', () => {
  const f = fixture(), p = compileWikiFactProposal(f.job, f.result), node = p.facts.nodes.find((n) => n.id === 'char-existing')
  assert.equal(node.meta.보존항목, '그대로'); assert.equal(node.meta.새역할, '새 기록 담당')
  assert.equal(node.summary, seed.summary); assert.deepEqual(node.tags, seed.tags)
})
test('compiled facts use the existing reconciler, including history and replay NOOP', () => {
  const f = fixture(), proposal = compileWikiFactProposal(f.job, f.result)
  const args = { batch: batch(f.source.anchor), facts: proposal.facts, source: { source_ref: 'archive/content/public-facts/C03-AFTERFALL/S03/TEST_NEXT.json', source_sha256: graphHash(proposal.facts) }, book, bookSource }
  const first = reconcilePublicGraph({ ...args, previous: f.graph })
  assert.equal(first.report.nodes_added, 2); assert.equal(first.report.nodes_updated, 1)
  assert.equal(first.graph.nodes.find((n) => n.id === 'char-existing').history.length, 1)
  assert.equal(reconcilePublicGraph({ ...args, previous: first.graph }).report.status, 'NOOP')
})

test('S04 jobs separate source identity while keeping existing and new entity IDs stable', () => {
  const f = fixture('SESSION_005')
  const s03 = compileWikiFactProposal(f.job, f.result)
  f.source.seasonId = 'S04'
  f.source.sourceManifestRef = f.source.sourceManifestRef.replace('/S03/', '/S04/')
  f.source.rawRef = f.source.rawRef.replace('/S03/', '/S04/')
  const job = buildWikiFactJob(f.source, f.graph)
  const s04 = compileWikiFactProposal(job, { ...f.result, job_id: job.job_id })
  assert.notEqual(job.job_id, f.job.job_id)
  assert.equal(job.season_id, 'S04')
  assert.equal(s04.facts.season_id, 'S04')
  assert.deepEqual(s04.facts.nodes.map((node) => node.id), s03.facts.nodes.map((node) => node.id))
  assert.ok(s04.facts.nodes.every((node) => node.source.startsWith('S04 SESSION_005 ')))
  assert.equal(job.existing_nodes[0].anchor.save_version, ANCHOR.save_version)
  const args = { previous: f.graph, facts: s04.facts,
    source: { source_ref: 'archive/content/public-facts/C03-AFTERFALL/S04/TEST.json', source_sha256: graphHash(s04.facts) }, book, bookSource }
  const applied = reconcilePublicGraphBackfill(args)
  const existing = applied.graph.nodes.find((node) => node.id === 'char-existing')
  assert.equal(existing.history.length, 1)
  assert.equal(existing.history[0].data.summary, seed.summary)
  assert.equal(existing.data.meta.보존항목, '그대로')
  assert.equal(reconcilePublicGraphBackfill({ ...args, previous: applied.graph }).report.status, 'NOOP')
  assert.throws(() => reconcilePublicGraphBackfill({ ...args,
    source: { ...args.source, source_ref: args.source.source_ref.replace('/S04/', '/S03/') } }), /GRAPH_SOURCE_SEASON_MISMATCH/)
})

test('existing relation inventory permits an evidenced update without a second edge', () => {
  const f = fixture()
  const first = compileWikiFactProposal(f.job, f.result)
  const graph = reconcilePublicGraphBackfill({ previous: f.graph, facts: first.facts,
    source: { source_ref: 'archive/content/public-facts/C03-AFTERFALL/S03/TEST_FIRST.json', source_sha256: graphHash(first.facts) }, book, bookSource }).graph
  const source = { ...f.source, seasonId: 'S04',
    sourceManifestRef: f.source.sourceManifestRef.replace('/S03/', '/S04/'), rawRef: f.source.rawRef.replace('/S03/', '/S04/'),
    anchor: { save_version: 12, game_time: '2027-01-03 12:00' } }
  const job = buildWikiFactJob(source, graph)
  assert.equal(job.existing_relations.length, 1)
  assert.equal(job.existing_relations[0].anchor.save_version, 11)
  const proposal = compileWikiFactProposal(job, { ...f.result, job_id: job.job_id, nodes: [],
    relations: [{ ...first.facts.relations[0], label: '작업장 근무', evidence: ['q1'] }] })
  const applied = reconcilePublicGraphBackfill({ previous: graph, facts: proposal.facts,
    source: { source_ref: 'archive/content/public-facts/C03-AFTERFALL/S04/TEST_RELATION.json', source_sha256: graphHash(proposal.facts) }, book, bookSource })
  assert.equal(applied.graph.relations.length, 1)
  assert.equal(applied.graph.relations[0].id, graph.relations[0].id)
  assert.equal(applied.graph.relations[0].history.length, 1)
  assert.equal(applied.report.relations_updated, 1)
})

test('a rehashed job cannot mix a source from another season', () => {
  const f = fixture()
  f.job.season_id = 'S04'
  const { job_id: _old, ...body } = f.job
  f.job.job_id = `wiki-job-${graphHash(body)}`
  assert.throws(() => compileWikiFactProposal(f.job, { ...f.result, job_id: f.job.job_id }), /WIKI_JOB_SEASON_MISMATCH/)
})

test('already prepared S03 jobs remain valid without the new relation inventory', () => {
  const f = fixture()
  delete f.job.existing_relations
  f.job.existing_nodes = f.job.existing_nodes.map(({ id, data }) => ({ id, data }))
  const { job_id: _old, ...body } = f.job
  f.job.job_id = `wiki-job-${graphHash(body)}`
  assert.equal(compileWikiFactProposal(f.job, { ...f.result, job_id: f.job.job_id }).status, 'FACTS_PROPOSED')
})
test('a proven quote is not automatically treated as semantic approval', () => {
  const f = fixture(); f.result.nodes[0].changes.summary = '근거가 실제로 함의하는지 별도 검토가 필요한 주장'
  assert.equal(compileWikiFactProposal(f.job, f.result).review_required, true)
})
test('NO_FACTS and HUMAN_REVIEW are visible and never mark a source processed', () => {
  for (const decision of ['NO_FACTS', 'HUMAN_REVIEW']) {
    const f = fixture(); Object.assign(f.result, { decision, nodes: [], relations: [], citations: [] })
    const p = compileWikiFactProposal(f.job, f.result)
    assert.equal(p.status, decision); assert.equal(p.source_marked_processed, false)
  }
})
test('later GM blocks are not truncated to the old 4500-character Knowledge excerpt', () => {
  const f = fixture(); f.source.gmBlocks[0].body = '긴 공개 기록 '.repeat(1000)
  f.source.gmBlocks.push({ messageLabel: '003', body: '마지막 블록도 보존한다.' })
  const job = buildWikiFactJob(f.source, f.graph)
  assert.equal(job.source.gm_blocks[1].text, '마지막 블록도 보존한다.')
  f.source.gmBlocks[0].body = '가'.repeat(200001)
  assert.throws(() => buildWikiFactJob(f.source, f.graph), /WIKI_TEXT_INVALID|WIKI_SOURCE_SPLIT_REQUIRED/)
})
rejection('stale job binding rejected', (f) => { f.result.job_id = 'wiki-job-' + 'd'.repeat(64) }, /WIKI_RESULT_JOB_MISMATCH/)
rejection('model cannot modify the source job', (f) => { f.job.source.gm_blocks[0].text = 'changed' }, /WIKI_JOB_BINDING_INVALID/)
rejection('unknown result fields rejected', (f) => { f.result.gm_state = 'private' })
rejection('USER block cannot be cited as GM evidence', (f) => { f.result.citations[0].block_id = '000' }, /WIKI_EVIDENCE_NOT_GM/)
rejection('invented quotation rejected', (f) => { f.result.citations[0].quote = '존재하지 않는 근거 문장' }, /WIKI_QUOTE_NOT_FOUND/)
rejection('future choice cannot become an observed fact', (f) => { f.result.citations[0].quote = '1. 미등장인물을 고용한다.' }, /WIKI_QUOTE_IN_CHOICE_MENU/)
rejection('every changed field needs evidence', (f) => { delete f.result.nodes[0].evidence.summary })
rejection('invented new character name rejected', (f) => { f.result.nodes[0].label = '원문에없는사람' }, /WIKI_NEW_NAME_NOT_IN_EVIDENCE/)
rejection('existing name must reuse existing ID', (f) => { f.result.nodes[0].label = '기존인물' }, /WIKI_EXISTING_NAME_REUSE_REQUIRED/)
rejection('approved alias must not create a second identity', (f) => { f.result.nodes[0].label = '옛이름' }, /WIKI_EXISTING_NAME_REUSE_REQUIRED/)
rejection('existing identity cannot be renamed', (f) => { f.result.nodes[2].label = '딴사람' }, /WIKI_IDENTITY_CHANGE_REVIEW_REQUIRED/)
rejection('duplicate candidate node rejected', (f) => { f.result.nodes.push(structuredClone(f.result.nodes[0])) })
rejection('metadata deletion rejected', (f) => { f.result.nodes[2].changes.meta.새역할 = null }, /WIKI_TEXT_INVALID/)
rejection('hidden fields rejected', (f) => { f.result.nodes[2].changes.meta.hidden_state = 'private' }, /WIKI_PRIVATE_FIELD_REJECTED/)
rejection('dangling relation rejected', (f) => { f.result.relations[0].to = 'loc-missing' }, /WIKI_RELATION_INVALID/)
rejection('wrong relation endpoint types rejected', (f) => { f.result.relations[0].kind = 'occurred_at' }, /WIKI_RELATION_TYPE_INVALID/)
rejection('unsupported social inference rejected', (f) => { f.result.relations[0].kind = 'secret_loyalty' }, /WIKI_RELATION_INVALID/)
rejection('duplicate relation rejected', (f) => { f.result.relations.push(structuredClone(f.result.relations[0])) }, /WIKI_RELATION_DUPLICATE/)
rejection('no-facts result cannot smuggle nodes', (f) => { f.result.decision = 'NO_FACTS' }, /WIKI_NONREADY_FACTS_FORBIDDEN/)
rejection('completion cannot skip unreviewed GM blocks', (f) => { f.result.coverage.reviewed_blocks = [] }, /WIKI_COVERAGE_INCOMPLETE/)

function isolateSampleGraph(graph, sample) {
  const labels = new Set((sample.nodes ?? [])
    .filter((node) => node.existing_id === null)
    .map((node) => node.label))
  const removedIds = new Set(graph.nodes
    .filter((record) => labels.has(record.data.label))
    .map((record) => record.id))

  const { content_sha256: _contentSha, ...body } = structuredClone(graph)
  body.nodes = body.nodes.filter((record) => !removedIds.has(record.id))
  body.relations = body.relations.filter((record) =>
    !removedIds.has(record.data.from) && !removedIds.has(record.data.to))
  body.story_links = body.story_links.filter((link) => !removedIds.has(link.node_id))
  body.articles = body.articles.filter((article) => !removedIds.has(article.id))
  return { ...body, content_sha256: graphHash(body) }
}

test('real S04 public sources require same-save applied evidence before entering the native queue', async () => {
  const manifest = JSON.parse(await readFile(resolve(root,
    'archive/content/transcripts/C03-AFTERFALL/S04/MANIFEST.json'), 'utf8'))
  const sources = await discoverWikiSources(root)
  const s04 = sources.filter((source) => source.seasonId === 'S04')
  assert.equal(s04.length, manifest.sessions.length)

  for (const session of manifest.sessions) {
    const snapshot = JSON.parse(await readFile(resolve(root,
      'archive/content/transcripts/C03-AFTERFALL/S04', session.source_manifest), 'utf8'))
    const messages = snapshot.content_sha256
    const source = s04.find((entry) => entry.sourceSession.session_id === session.session_id)
    assert.ok(source, `missing approved S04 source: ${session.session_id}`)
    assert.equal(source.anchor.game_time, snapshot.captured_message_range.end)
    const appliedIndex = messages.findLastIndex((entry) =>
      entry.role === 'GM' && entry.state_link?.outcome === 'APPLIED'
        && entry.state_link.linked_save_version === entry.save_version)
    assert.ok(appliedIndex >= 0, 'S04 must contain a verified applied save')
    const appliedSave = messages[appliedIndex].state_link.linked_save_version
    assert.equal(source.anchor.save_version, appliedSave)
    assert.ok(messages.slice(appliedIndex + 1).every((entry) =>
      entry.state_link === undefined && entry.save_version === appliedSave),
    'unlinked public narrative must not advance the save number')
    assert.equal(source.gmBlocks.length, session.gm_public_blocks)
  }
  assert.ok(appliedSnapshot.excluded.every((item) => item.reason === 'NO_APPLIED_PUBLIC_ANCHOR'))
})

test('real SESSION_006 and SESSION_007 samples compile with unchanged protected files', async () => {
  const samples = JSON.parse(await readFile(new URL('./fixtures/wiki-fact-results-v1.json', import.meta.url)))
  const protectedRefs = ['archive/content/graphs/C03-AFTERFALL/GRAPH.json', 'archive/content/stories/C03-AFTERFALL/BOOK.json',
    'archive/content/transcripts/C03-AFTERFALL/S03/MANIFEST.json', ...['SESSION_006', 'SESSION_007'].map((id) => `archive/content/transcripts/C03-AFTERFALL/S03/${id}/PART_001.md`)]
  const before = await Promise.all(protectedRefs.map(async (ref) => byteHash(await readFile(resolve(root, ref)))))
  const graph = JSON.parse(await readFile(resolve(root, protectedRefs[0])))
  const sources = await discoverWikiSources(appliedBase)
  for (const session of ['SESSION_006', 'SESSION_007']) {
    const source = sources.find((item) => item.sourceSession.session_id === session)
    assert.ok(source)
    const sampleGraph = isolateSampleGraph(graph, samples[session])
    const job = buildWikiFactJob(source, sampleGraph)
    // Replay an assistant-authored extraction against an isolated pre-sample identity context.
    const result = { version: WIKI_RESULT_VERSION, job_id: job.job_id, ...samples[session] }
    const proposal = compileWikiFactProposal(job, result)
    assert.equal(proposal.status, 'FACTS_PROPOSED'); assert.equal(proposal.coverage.status, 'PARTIAL')
    assert.equal(proposal.review_required, true); assert.equal(proposal.source_marked_processed, false)
    assert.equal(proposal.facts.nodes.length, session === 'SESSION_006' ? 7 : 4)
    assert.equal(proposal.facts.relations.length, session === 'SESSION_006' ? 5 : 3)
    assert.deepEqual(proposal, compileWikiFactProposal(job, result))
    if (session === 'SESSION_006') assert.equal(proposal.application_status, 'BACKFILL_REVIEW_REQUIRED')
  }
  const after = await Promise.all(protectedRefs.map(async (ref) => byteHash(await readFile(resolve(root, ref)))))
  assert.deepEqual(after, before)
})
test('real CLI prepares the current pending source and validates a state-agnostic result', async () => {
  let source
  try {
    source = await discoverWikiSource(appliedBase)
  } catch (error) {
    assert.equal(error.message, 'WIKI_NO_PENDING_SOURCE')
    const terminal = JSON.parse(await runWikiFactCli(['--prepare'], { root: appliedBase }))
    assert.deepEqual(terminal, {
      status: 'NOOP',
      reason: 'WIKI_NO_PENDING_SOURCE',
      source_marked_processed: false,
      graph_changed: false,
    })
    return
  }

  const job = JSON.parse(await runWikiFactCli(['--prepare'], { root: appliedBase }))
  assert.equal(job.source.session_id, source.sourceSession.session_id)
  const dir = await mkdtemp(join(tmpdir(), 'wiki-native-'))
  try {
    const path = join(dir, 'result.json')
    const result = {
      version: WIKI_RESULT_VERSION,
      job_id: job.job_id,
      decision: 'NO_FACTS',
      coverage: {
        status: 'COMPLETE',
        reviewed_blocks: job.source.gm_blocks.map((block) => block.block_id),
      },
      nodes: [],
      relations: [],
      citations: [],
      deferred: [],
      note: 'STATE_AGNOSTIC_CLI_TEST_ONLY',
    }
    await writeFile(path, JSON.stringify(result))
    const proposal = JSON.parse(await runWikiFactCli(['--result', path, '--check'], { root: appliedBase }))
    assert.equal(proposal.status, 'NO_FACTS')
    assert.equal(proposal.coverage.status, 'COMPLETE')
    assert.equal(proposal.graph_changed, false)
    await assert.rejects(runWikiFactCli(['--result', path, '--apply'], { root: appliedBase }), /WIKI_FACT_CLI_ARGUMENTS_INVALID/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})


test('review job contains the complete prepared GM source and fixed proposal', () => {
  const f = fixture()
  f.source.gmBlocks.push({ messageLabel: '003', body: '두 번째 공개 블록이다.' })
  const job = buildWikiFactJob(f.source, f.graph)
  f.result.job_id = job.job_id
  f.result.coverage = { status: 'PARTIAL', reviewed_blocks: ['001'] }
  const proposal = compileWikiFactProposal(job, f.result)
  const reviewJob = buildWikiFactReviewJob(job, proposal)
  assert.equal(reviewJob.prepared_job.source.gm_blocks.length, 2)
  assert.equal(reviewJob.prepared_job.source.gm_blocks[1].text, '두 번째 공개 블록이다.')
  assert.equal(reviewJob.proposal.proposal_sha256, proposal.proposal_sha256)
})

test('reviewer cannot APPROVE a partial extraction', () => {
  const f = fixture()
  f.source.gmBlocks.push({ messageLabel: '003', body: '두 번째 공개 블록이다.' })
  const job = buildWikiFactJob(f.source, f.graph)
  f.result.job_id = job.job_id
  f.result.coverage = { status: 'PARTIAL', reviewed_blocks: ['001'] }
  const proposal = compileWikiFactProposal(job, f.result)
  const reviewJob = buildWikiFactReviewJob(job, proposal)
  assert.throws(() => validateWikiFactReview(reviewJob, {
    version: WIKI_REVIEW_VERSION,
    proposal_sha256: proposal.proposal_sha256,
    decision: 'APPROVE',
    note: 'TEST',
  }), /WIKI_REVIEW_PARTIAL_APPROVAL_FORBIDDEN/)
})

test('independent reviewer is a separate provider seam and binds exact proposal hash', async () => {
  const f = fixture()
  const proposal = compileWikiFactProposal(f.job, f.result)
  const reviewJob = buildWikiFactReviewJob(f.job, proposal)
  let calls = 0
  const review = await reviewWikiFactProposal(reviewJob, async (input) => {
    calls++
    assert.equal(input.prepared_job.job_id, f.job.job_id)
    assert.equal(input.proposal.proposal_sha256, proposal.proposal_sha256)
    return {
      version: WIKI_REVIEW_VERSION,
      proposal_sha256: proposal.proposal_sha256,
      decision: 'APPROVE',
      note: 'Independent test review.',
    }
  })
  assert.equal(calls, 1)
  assert.equal(review.decision, 'APPROVE')
  assert.match(review.review_sha256, /^[a-f0-9]{64}$/)
  await assert.rejects(reviewWikiFactProposal(reviewJob), /WIKI_REVIEW_MODEL_ADAPTER_REQUIRED/)
})

test('review result cannot be replayed onto another proposal', () => {
  const a = fixture('SESSION_008', '첫시험인물')
  const b = fixture('SESSION_009', '둘째시험인물')
  const proposalA = compileWikiFactProposal(a.job, a.result)
  const proposalB = compileWikiFactProposal(b.job, b.result)
  const reviewJobB = buildWikiFactReviewJob(b.job, proposalB)
  assert.throws(() => validateWikiFactReview(reviewJobB, {
    version: WIKI_REVIEW_VERSION,
    proposal_sha256: proposalA.proposal_sha256,
    decision: 'APPROVE',
    note: 'wrong proposal',
  }), /WIKI_REVIEW_PROPOSAL_MISMATCH/)
})
