import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byteHash, graphBytes, graphHash, reconcilePublicGraphBackfill } from './publication-graph.mjs'
import { verifyCompletedWikiPublication } from './a-wiki-publication-evidence.mjs'

const ns = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
const sourceRef = 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_999/SOURCE_MANIFEST.json'
const factRef = `archive/content/public-facts/C03-AFTERFALL/S03/AWIKI_SESSION_999_${'a'.repeat(64)}.json`
const anchor = { save_version: 10, game_time: '2027-01-01 12:00' }
const json = (value) => Buffer.from(JSON.stringify(value))

function evidenceFixture() {
  const data = { id: 'char-test', type: 'character', label: '합성 인물', subtitle: '합성 역할',
    summary: '합성 시험 기록', tags: ['시험'], source: 'SYNTHETIC_TEST_ONLY' }
  const facts = { version: 'public-graph-facts-v1', ...ns, season_id: 'S03', anchor,
    nodes: [data], relations: [] }
  const factBytes = Buffer.from(graphBytes(facts))
  const body = { version: 'archive-graph-v1', ...ns, anchor,
    nodes: [{ id: data.id, data, anchor, evidence: { source_ref: factRef,
      source_sha256: byteHash(factBytes), pointer: '/nodes/0' }, history: [] }],
    relations: [], story_links: [], articles: [] }
  const graph = { ...body, content_sha256: graphHash(body) }
  const receipt = { version: 'a-wiki-receipt-v1', session_id: 'SESSION_999',
    source_sha256: 'a'.repeat(64), job_id: `wiki-job-${'b'.repeat(64)}`,
    proposal_sha256: 'c'.repeat(64), review_sha256: 'd'.repeat(64),
    outcome: 'APPLIED', fact_sha256: byteHash(factBytes),
    graph_before_sha256: 'e'.repeat(64), graph_after_sha256: graph.content_sha256,
    coverage: 'COMPLETE' }
  const source = { seasonId: 'S03', sourceManifestRef: sourceRef, sourceDigest: 'a'.repeat(64),
    sourceSession: { session_id: 'SESSION_999' }, anchor }
  const row = { job_id: 'db-job', status: 'EXTRACTOR_READY', session_id: 'SESSION_999',
    source_ref: sourceRef, source_sha256: source.sourceDigest, prepared_job_sha256: 'f'.repeat(64),
    prepared_job: { season_id: 'S03', job_id: `wiki-job-${'f'.repeat(64)}`,
      source: { manifest_ref: sourceRef, manifest_sha256: source.sourceDigest } } }
  const repo = { full_name: 'cetin072/survival-interactive-series' }
  return { row, source, receiptBytes: json(receipt), factBytes, graphAtMerge: graph,
    currentGraph: structuredClone(graph), pr: { number: 1, merged: true,
      base: { ref: 'main', repo }, head: { ref: 'review/independent', sha: '1'.repeat(40), repo },
      merge_commit_sha: '2'.repeat(40), merged_at: '2026-10-01T00:00:00Z' },
    mainSha: '3'.repeat(40), mergeIsAncestor: true, exactFilesAtHeadAndMerge: true }
}

test('external completion preserves original job binding and records actual merged provenance', () => {
  const fixture = evidenceFixture()
  const before = structuredClone(fixture.row)
  const evidence = verifyCompletedWikiPublication(fixture)
  assert.equal(evidence.origin, 'EXTERNAL_REVIEWED_MERGE')
  assert.equal(evidence.prepared_job_sha256, fixture.row.prepared_job_sha256)
  assert.notEqual(evidence.receipt_job_id, fixture.row.prepared_job.job_id)
  assert.equal(evidence.fact_sha256, byteHash(fixture.factBytes))
  assert.equal(evidence.merge_sha, fixture.pr.merge_commit_sha)
  assert.equal(evidence.merged_at, fixture.pr.merged_at)
  assert.equal('extractor_result' in evidence, false)
  assert.equal('review_result' in evidence, false)
  assert.deepEqual(fixture.row, before)
})

test('completed facts remain valid after a newer reviewed revision only when history is preserved', () => {
  const fixture = evidenceFixture()
  const previous = fixture.currentGraph
  const old = previous.nodes[0]
  const nextAnchor = { save_version: 11, game_time: '2027-01-02 12:00' }
  const nextFacts = { version: 'public-graph-facts-v1', ...ns, season_id: 'S03', anchor: nextAnchor,
    nodes: [{ ...old.data, summary: '다음 합성 시험 기록' }], relations: [] }
  fixture.currentGraph = reconcilePublicGraphBackfill({ previous, facts: nextFacts,
    source: { source_ref: 'archive/content/public-facts/C03-AFTERFALL/S03/AWIKI_TEST_NEXT.json',
      source_sha256: '4'.repeat(64) }, book: { chronicleId: ns.chronicle_id,
      worldlineId: ns.worldline_id, chapters: [] }, bookSource: {
      source_ref: 'archive/content/stories/C03-AFTERFALL/BOOK.json', source_sha256: '5'.repeat(64) } }).graph
  assert.doesNotThrow(() => verifyCompletedWikiPublication(fixture))
  fixture.currentGraph.nodes[0].history = []
  const { content_sha256, ...body } = fixture.currentGraph
  fixture.currentGraph.content_sha256 = graphHash(body)
  assert.throws(() => verifyCompletedWikiPublication(fixture), /FACT_NOT_IN_GRAPH/)
})

for (const [name, mutate, expected] of [
  ['wrong source', (f) => { f.source.sourceDigest = '6'.repeat(64) }, /SOURCE_BINDING/],
  ['changed fact bytes', (f) => { f.factBytes = Buffer.concat([f.factBytes, Buffer.from(' ')]) }, /FACT_HASH/],
  ['incomplete review', (f) => { const r = JSON.parse(f.receiptBytes); r.coverage = 'PARTIAL'; f.receiptBytes = json(r) }, /RECEIPT_INVALID/],
  ['missing review binding', (f) => { const r = JSON.parse(f.receiptBytes); delete r.review_sha256; f.receiptBytes = json(r) }, /RECEIPT_INVALID/],
  ['unmerged PR', (f) => { f.pr.merged = false }, /PR_BINDING/],
  ['wrong base', (f) => { f.pr.base.ref = 'preview' }, /PR_BINDING/],
  ['merge not in main', (f) => { f.mergeIsAncestor = false }, /VERIFIED_MAIN/],
  ['head bytes differ', (f) => { f.exactFilesAtHeadAndMerge = false }, /VERIFIED_MAIN/],
]) {
  test(`completed receipt cannot hide ${name}`, () => {
    const fixture = evidenceFixture()
    mutate(fixture)
    assert.throws(() => verifyCompletedWikiPublication(fixture), expected)
  })
}

test('NO_FACTS completion must retain graph identity and have no fact file', () => {
  const fixture = evidenceFixture()
  const receipt = JSON.parse(fixture.receiptBytes)
  receipt.outcome = 'NO_FACTS'
  receipt.fact_sha256 = null
  receipt.graph_before_sha256 = receipt.graph_after_sha256
  fixture.receiptBytes = json(receipt)
  fixture.factBytes = null
  assert.equal(verifyCompletedWikiPublication(fixture).fact_ref, null)
  fixture.factBytes = Buffer.from('{}')
  assert.throws(() => verifyCompletedWikiPublication(fixture), /NO_FACTS_INVALID/)
})

test('unchanged facts retain older evidence only when the exact pre-publication graph proves it', () => {
  const fixture = evidenceFixture()
  const old = fixture.graphAtMerge.nodes[0]
  old.anchor = { save_version: 9, game_time: '2026-12-31 12:00' }
  old.evidence.source_ref = 'archive/content/public-facts/C03-AFTERFALL/S03/AWIKI_PRIOR.json'
  old.evidence.source_sha256 = '9'.repeat(64)
  const { content_sha256, ...body } = fixture.graphAtMerge
  fixture.graphAtMerge.content_sha256 = graphHash(body)
  fixture.currentGraph = structuredClone(fixture.graphAtMerge)
  const receipt = JSON.parse(fixture.receiptBytes)
  receipt.graph_before_sha256 = receipt.graph_after_sha256 = fixture.graphAtMerge.content_sha256
  fixture.receiptBytes = json(receipt)
  assert.throws(() => verifyCompletedWikiPublication(fixture), /FACT_NOT_IN_GRAPH/)
  fixture.graphBefore = structuredClone(fixture.graphAtMerge)
  assert.doesNotThrow(() => verifyCompletedWikiPublication(fixture))
  fixture.currentGraph.nodes[0].evidence.source_sha256 = '8'.repeat(64)
  const { content_sha256: currentSha, ...currentBody } = fixture.currentGraph
  fixture.currentGraph.content_sha256 = graphHash(currentBody)
  assert.throws(() => verifyCompletedWikiPublication(fixture), /FACT_NOT_IN_GRAPH/)
})
