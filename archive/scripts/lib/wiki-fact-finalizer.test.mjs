import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { byteHash, graphHash, reconcileReaderOnlyGraph } from './publication-graph.mjs'
import {
  discoverWikiSource, expectedWikiFactPath, expectedWikiReceiptPath,
} from './wiki-semantic-jobs.mjs'
import {
  buildWikiFactJob, buildWikiFactReviewJob, compileWikiFactProposal,
  validateWikiFactReview, WIKI_RESULT_VERSION, WIKI_REVIEW_VERSION,
} from './wiki-fact-extractor.mjs'
import { finalizeWikiFactProposal } from './wiki-fact-finalizer.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const transcriptRoot = 'archive/content/transcripts/C03-AFTERFALL/S03'
const factsRoot = 'archive/content/public-facts/C03-AFTERFALL/S03'
const graphRef = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const bookRef = 'archive/content/stories/C03-AFTERFALL/BOOK.json'

function aWikiSessionFromEvidence(evidence) {
  const match = evidence?.source_ref?.match(/\/AWIKI_(?:AMENDMENT_)?SESSION_(\d{3})_[A-Za-z0-9_-]+\.json$/)
  return match ? Number(match[1]) : null
}

function rollbackRecordBeforeSession(record, cutoffSession = 6) {
  let current = structuredClone(record)
  while ((aWikiSessionFromEvidence(current.evidence) ?? -1) >= cutoffSession) {
    if (!current.history.length) return null
    const previous = current.history.at(-1)
    current = {
      id: current.id,
      data: structuredClone(previous.data),
      anchor: structuredClone(previous.anchor),
      evidence: structuredClone(previous.evidence),
      history: current.history.slice(0, -1),
    }
  }
  return current
}

async function writePreSessionGraph(root, cutoffSession = 6) {
  const graph = JSON.parse(await readFile(resolve(repoRoot, graphRef), 'utf8'))
  const keptNodes = graph.nodes
    .map((record) => rollbackRecordBeforeSession(record, cutoffSession))
    .filter(Boolean)
  const keptNodeIds = new Set(keptNodes.map((record) => record.id))
  const keptRelations = graph.relations
    .map((record) => rollbackRecordBeforeSession(record, cutoffSession))
    .filter((record) => record && keptNodeIds.has(record.data.from) && keptNodeIds.has(record.data.to))

  const { content_sha256: _ignored, ...body } = structuredClone(graph)
  body.nodes = keptNodes
  body.relations = keptRelations
  body.story_links = []
  body.articles = []
  const rolled = { ...body, content_sha256: graphHash(body) }

  const bookBytes = await readFile(resolve(repoRoot, bookRef))
  const book = JSON.parse(bookBytes.toString('utf8'))
  const rebuilt = reconcileReaderOnlyGraph({
    previous: rolled,
    book,
    bookSource: { source_ref: bookRef, source_sha256: byteHash(bookBytes) },
    boundary: rolled.anchor,
  }).graph

  await writeFile(resolve(root, graphRef), JSON.stringify(rebuilt, null, 2) + '\n')
  await writeFile(resolve(root, bookRef), bookBytes)
}

async function makeRoot(sessionIds = ['SESSION_005', 'SESSION_006', 'SESSION_007']) {
  const root = await mkdtemp(resolve(tmpdir(), 'a-wiki-finalizer-'))
  await mkdir(resolve(root, transcriptRoot), { recursive: true })
  const manifest = JSON.parse(await readFile(resolve(repoRoot, transcriptRoot, 'MANIFEST.json'), 'utf8'))
  manifest.sessions = manifest.sessions.filter((session) => sessionIds.includes(session.session_id))
  await writeFile(resolve(root, transcriptRoot, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n')
  for (const sessionId of sessionIds) {
    await cp(resolve(repoRoot, transcriptRoot, sessionId), resolve(root, transcriptRoot, sessionId), { recursive: true })
  }

  await mkdir(resolve(root, factsRoot), { recursive: true })
  const legacy = (await readdir(resolve(repoRoot, factsRoot))).find((name) =>
    /^AWIKI_SESSION_005_[a-f0-9]{64}\.json$/.test(name))
  assert.ok(legacy)
  await cp(resolve(repoRoot, factsRoot, legacy), resolve(root, factsRoot, legacy))

  await mkdir(dirname(resolve(root, graphRef)), { recursive: true })
  await mkdir(dirname(resolve(root, bookRef)), { recursive: true })
  await writePreSessionGraph(root, 6)
  return root
}

async function completePackage(root) {
  const source = await discoverWikiSource(root)
  assert.equal(source.sourceSession.session_id, 'SESSION_006')
  const graph = JSON.parse(await readFile(resolve(root, graphRef), 'utf8'))
  const job = buildWikiFactJob(source, graph)
  const samples = JSON.parse(await readFile(resolve(repoRoot, 'archive/scripts/lib/fixtures/wiki-fact-results-v1.json'), 'utf8'))
  const result = {
    version: WIKI_RESULT_VERSION,
    job_id: job.job_id,
    ...samples.SESSION_006_COMPLETE,
  }
  const proposal = compileWikiFactProposal(job, result)
  const reviewJob = buildWikiFactReviewJob(job, proposal)
  assert.equal(reviewJob.prepared_job.source.gm_blocks.length, 7)
  const review = {
    version: WIKI_REVIEW_VERSION,
    proposal_sha256: proposal.proposal_sha256,
    decision: 'APPROVE',
    note: 'TEST_ONLY independent approval after examining the complete prepared source.',
  }
  validateWikiFactReview(reviewJob, review)
  return { source, job, proposal, review }
}

async function noFactsPackage(root) {
  const source = await discoverWikiSource(root)
  const graph = JSON.parse(await readFile(resolve(root, graphRef), 'utf8'))
  const job = buildWikiFactJob(source, graph)
  const proposal = compileWikiFactProposal(job, {
    version: WIKI_RESULT_VERSION,
    job_id: job.job_id,
    decision: 'NO_FACTS',
    coverage: { status: 'COMPLETE', reviewed_blocks: job.source.gm_blocks.map((block) => block.block_id) },
    nodes: [], relations: [], citations: [], deferred: [],
    note: 'TEST_ONLY complete no-facts disposition.',
  })
  const review = {
    version: WIKI_REVIEW_VERSION,
    proposal_sha256: proposal.proposal_sha256,
    decision: 'APPROVE',
    note: 'TEST_ONLY no-facts approval.',
  }
  validateWikiFactReview(buildWikiFactReviewJob(job, proposal), review)
  return { source, job, proposal, review }
}

async function withRoot(fn) {
  const root = await makeRoot()
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}

test('SESSION_006 reviewed backfill keeps the published global anchor, writes receipt last, then advances to SESSION_007', async () => {
  await withRoot(async (root) => {
    const pack = await completePackage(root)
    const before = JSON.parse(await readFile(resolve(root, graphRef), 'utf8'))
    const published = JSON.parse(await readFile(resolve(repoRoot, graphRef), 'utf8'))
    assert.deepEqual(before.anchor, published.anchor)

    const check = await finalizeWikiFactProposal({ root, ...pack, apply: false })
    assert.equal(check.status, 'READY_TO_APPLY')
    assert.equal(check.source_marked_processed, false)

    const result = await finalizeWikiFactProposal({ root, ...pack, apply: true })
    assert.equal(result.status, 'FINALIZED')
    assert.equal(result.source_marked_processed, true)
    assert.equal(result.receipt_written, true)

    const after = JSON.parse(await readFile(resolve(root, graphRef), 'utf8'))
    assert.deepEqual(after.anchor, before.anchor)
    assert.equal(after.nodes.find((record) => record.data.label === '최은채').anchor.save_version, 280)
    assert.ok(after.nodes.some((record) => record.data.label === '임관수'))

    const receiptPath = expectedWikiReceiptPath(pack.source)
    const receipt = JSON.parse(await readFile(resolve(root, receiptPath), 'utf8'))
    assert.equal(receipt.outcome, 'APPLIED')
    assert.equal(receipt.coverage, 'COMPLETE')
    assert.equal(receipt.graph_before_sha256, pack.proposal.expected_graph_sha256)
    assert.equal(receipt.graph_after_sha256, after.content_sha256)

    assert.equal((await discoverWikiSource(root)).sourceSession.session_id, 'SESSION_007')
    const replay = await finalizeWikiFactProposal({ root, ...pack, apply: true })
    assert.equal(replay.status, 'NOOP_ALREADY_FINALIZED')
  })
})

test('PARTIAL proposal cannot be approved or finalized', async () => {
  await withRoot(async (root) => {
    const source = await discoverWikiSource(root)
    const graph = JSON.parse(await readFile(resolve(root, graphRef), 'utf8'))
    const job = buildWikiFactJob(source, graph)
    const samples = JSON.parse(await readFile(resolve(repoRoot, 'archive/scripts/lib/fixtures/wiki-fact-results-v1.json'), 'utf8'))
    const proposal = compileWikiFactProposal(job, { version: WIKI_RESULT_VERSION, job_id: job.job_id, ...samples.SESSION_006 })
    assert.throws(() => validateWikiFactReview(buildWikiFactReviewJob(job, proposal), {
      version: WIKI_REVIEW_VERSION,
      proposal_sha256: proposal.proposal_sha256,
      decision: 'APPROVE',
      note: 'must fail',
    }), /WIKI_REVIEW_PARTIAL_APPROVAL_FORBIDDEN/)
    await assert.rejects(readFile(resolve(root, expectedWikiReceiptPath(source))), /ENOENT/)
  })
})

test('a record newer than SESSION_006 fails closed and writes no receipt', async () => {
  await withRoot(async (root) => {
    const graphPath = resolve(root, graphRef)
    const graph = JSON.parse(await readFile(graphPath, 'utf8'))
    const record = graph.nodes.find((item) => item.data.label === '최은채')
    record.anchor = { save_version: 281, game_time: '2027-09-23 12:00' }
    const { content_sha256, ...body } = graph
    graph.content_sha256 = graphHash(body)
    await writeFile(graphPath, JSON.stringify(graph, null, 2) + '\n')

    const pack = await completePackage(root)
    await assert.rejects(
      finalizeWikiFactProposal({ root, ...pack, apply: true }),
      /BACKFILL_RECORD_NEWER_THAN_SOURCE/,
    )
    await assert.rejects(readFile(resolve(root, expectedWikiReceiptPath(pack.source))), /ENOENT/)
  })
})

test('same-anchor conflicting record fails closed', async () => {
  await withRoot(async (root) => {
    const graphPath = resolve(root, graphRef)
    const graph = JSON.parse(await readFile(graphPath, 'utf8'))
    const record = graph.nodes.find((item) => item.data.label === '최은채')
    record.anchor = { save_version: 280, game_time: '2027-09-22 16:10' }
    const { content_sha256, ...body } = graph
    graph.content_sha256 = graphHash(body)
    await writeFile(graphPath, JSON.stringify(graph, null, 2) + '\n')

    const pack = await completePackage(root)
    await assert.rejects(
      finalizeWikiFactProposal({ root, ...pack, apply: true }),
      /SAME_REVISION_FACT_CONFLICT/,
    )
  })
})

test('NO_FACTS writes only a completion receipt and advances once', async () => {
  await withRoot(async (root) => {
    const pack = await noFactsPackage(root)
    const before = await readFile(resolve(root, graphRef))
    const result = await finalizeWikiFactProposal({ root, ...pack, apply: true })
    assert.equal(result.outcome, 'NO_FACTS')
    assert.equal(result.graph_changed, false)
    assert.deepEqual(await readFile(resolve(root, graphRef)), before)
    await assert.rejects(readFile(resolve(root, expectedWikiFactPath(pack.source))), /ENOENT/)
    assert.equal((await discoverWikiSource(root)).sourceSession.session_id, 'SESSION_007')
  })
})

test('fact-file success plus Graph failure never writes a receipt and is retryable', async () => {
  await withRoot(async (root) => {
    const pack = await completePackage(root)
    const graphLock = resolve(root, graphRef) + '.publication-lock'
    await writeFile(graphLock, 'TEST_LOCK')
    await assert.rejects(finalizeWikiFactProposal({ root, ...pack, apply: true }))
    await readFile(resolve(root, expectedWikiFactPath(pack.source)))
    await assert.rejects(readFile(resolve(root, expectedWikiReceiptPath(pack.source))), /ENOENT/)
    await unlink(graphLock)

    const retried = await finalizeWikiFactProposal({ root, ...pack, apply: true })
    assert.equal(retried.status, 'FINALIZED')
    assert.equal((await discoverWikiSource(root)).sourceSession.session_id, 'SESSION_007')
  })
})

test('Graph success plus receipt failure recovers the receipt on retry', async () => {
  await withRoot(async (root) => {
    const pack = await completePackage(root)
    const receiptPath = resolve(root, expectedWikiReceiptPath(pack.source))
    await mkdir(dirname(receiptPath), { recursive: true })
    const receiptLock = receiptPath + '.publication-lock'
    await writeFile(receiptLock, 'TEST_LOCK')

    await assert.rejects(finalizeWikiFactProposal({ root, ...pack, apply: true }))
    const changed = JSON.parse(await readFile(resolve(root, graphRef), 'utf8'))
    assert.ok(changed.nodes.some((record) => record.data.label === '임관수'))
    await assert.rejects(readFile(receiptPath), /ENOENT/)
    await unlink(receiptLock)

    const recovered = await finalizeWikiFactProposal({ root, ...pack, apply: true })
    assert.equal(recovered.status, 'RECOVERED_AND_FINALIZED')
    assert.equal(recovered.receipt_written, true)
    await readFile(receiptPath)
  })
})

async function syntheticS04Package(root) {
  // A temporary synthetic public capture, never real S04 gameplay or Canon.
  // SESSION_005 deliberately repeats the completed legacy S03 session number.
  const seasonRoot = 'archive/content/transcripts/C03-AFTERFALL/S04'
  const prefix = `${seasonRoot}/SESSION_005`
  await mkdir(resolve(root, prefix), { recursive: true })
  const range = { start: '2099-01-01 10:00', end: '2099-01-01 10:00' }
  const session = { session_id: 'SESSION_005', visibility: 'PUBLIC_ARCHIVE', capture_quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic_pairing_complete: true,
    source_manifest: 'SESSION_005/SOURCE_MANIFEST.json', coverage_basis: 'captured_message_range', captured_message_range: range,
    user_messages: 2, gm_public_blocks: 2 }
  const manifest = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S04',
    archive_class: 'COLD_RAW', visibility: 'PUBLIC_ARCHIVE', sessions: [session] }
  const parts = {}, content = []
  for (const [index, gm] of ['TEST_FIRST_PUBLIC_BLOCK', 'S04 합성 검증만 수행했다.'].entries()) {
    const user = `TEST_INPUT_${index}`
    const name = `PART_${String(index + 1).padStart(3, '0')}.md`
    const raw = Buffer.from(`## USER ${String(index * 2).padStart(3, '0')}\n\n${user}\n\n## GM ${String(index * 2 + 1).padStart(3, '0')}\n\n${gm}\n`)
    parts[name] = byteHash(raw)
    content.push({ message_order: index * 2, role: 'USER', sha256: byteHash(user) },
      { message_order: index * 2 + 1, role: 'GM', sha256: byteHash(gm), state_link: { outcome: 'APPLIED', linked_save_version: 9999 } })
    await writeFile(resolve(root, prefix, name), raw)
  }
  const sourceManifest = { ...manifest, sessions: undefined, ...session, public_safe_only: true, closed_at: '2099-01-01T10:00:00Z',
    counts: { user: 2, gm: 2, total: 4 }, message_order: { min: 0, max: 3, contiguous: true },
    content_sha256: content, parts: Object.keys(parts), parts_sha256: parts }
  await writeFile(resolve(root, prefix, 'SOURCE_MANIFEST.json'), JSON.stringify(sourceManifest))
  await writeFile(resolve(root, seasonRoot, 'MANIFEST.json'), JSON.stringify(manifest))
  const source = await discoverWikiSource(root)
  assert.equal(source.seasonId, 'S04')
  const graph = JSON.parse(await readFile(resolve(root, graphRef), 'utf8'))
  const job = buildWikiFactJob(source, graph)
  const result = { version: WIKI_RESULT_VERSION, job_id: job.job_id, decision: 'FACTS_READY',
    coverage: { status: 'COMPLETE', reviewed_blocks: ['001', '003'] },
    nodes: [{ key: 'new:s04-test', existing_id: null, type: 'event', label: '합성 검증 사건',
      changes: { subtitle: 'TEST_ONLY', summary: 'S04 합성 검증만 수행했다.' },
      evidence: Object.fromEntries(['type', 'label', 'subtitle', 'summary'].map((field) => [field, ['q1']])) }],
    relations: [], citations: [{ id: 'q1', block_id: '003', quote: 'S04 합성 검증만 수행했다.' }], deferred: [], note: 'TEST_ONLY_SYNTHETIC_S04' }
  const proposal = compileWikiFactProposal(job, result)
  const review = { version: WIKI_REVIEW_VERSION, proposal_sha256: proposal.proposal_sha256,
    decision: 'APPROVE', note: 'TEST_ONLY independent fixture approval, not a real S04 review.' }
  return { source, job, proposal, review, result }
}

test('S04 repeated session number finalizes into its own season and a second apply is byte-identical NOOP', async () => {
  const root = await makeRoot(['SESSION_005'])
  try {
    const pack = await syntheticS04Package(root)
    const legacyNames = await readdir(resolve(root, factsRoot))
    const beforeBook = await readFile(resolve(root, bookRef))
    const beforeRaw = await Promise.all(pack.job.source.raw_parts.map((part) => readFile(resolve(root, part.ref))))
    const check = await finalizeWikiFactProposal({ root, ...pack })
    assert.equal(check.status, 'READY_TO_APPLY')
    const applied = await finalizeWikiFactProposal({ root, ...pack, apply: true })
    assert.equal(applied.status, 'FINALIZED')
    assert.match(applied.fact_ref, /\/S04\/AWIKI_SESSION_005_/)
    assert.match(applied.receipt_ref, /\/S04\/receipts\/AWIKI_SESSION_005_/)
    const persistedGraph = await readFile(resolve(root, graphRef))
    const persistedFact = await readFile(resolve(root, applied.fact_ref))
    const persistedReceipt = await readFile(resolve(root, applied.receipt_ref))
    const receipt = JSON.parse(persistedReceipt)
    assert.equal(receipt.season_id, 'S04')
    assert.equal(receipt.source_ref, pack.source.sourceManifestRef)
    assert.equal(receipt.fact_sha256, byteHash(persistedFact))
    assert.equal(receipt.graph_after_sha256, JSON.parse(persistedGraph).content_sha256)
    assert.equal((await finalizeWikiFactProposal({ root, ...pack, apply: true })).status, 'NOOP_ALREADY_FINALIZED')
    assert.deepEqual(await readFile(resolve(root, graphRef)), persistedGraph)
    assert.deepEqual(await readFile(resolve(root, applied.fact_ref)), persistedFact)
    assert.deepEqual(await readFile(resolve(root, applied.receipt_ref)), persistedReceipt)
    assert.deepEqual(await readFile(resolve(root, bookRef)), beforeBook)
    assert.deepEqual(await Promise.all(pack.job.source.raw_parts.map((part) => readFile(resolve(root, part.ref)))), beforeRaw)
    assert.deepEqual(await readdir(resolve(root, factsRoot)), legacyNames)
    await assert.rejects(discoverWikiSource(root), /WIKI_NO_PENDING_SOURCE/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('finalizer rejects a rehashed multipart job with a changed later-part binding before any writes', async () => {
  const root = await makeRoot(['SESSION_005'])
  try {
    const pack = await syntheticS04Package(root)
    const beforeGraph = await readFile(resolve(root, graphRef))
    for (const mutate of [
      (parts) => { parts[1].sha256 = 'e'.repeat(64) },
      (parts) => { parts.pop() },
      (parts) => { parts.reverse() },
    ]) {
      const job = structuredClone(pack.job)
      mutate(job.source.raw_parts)
      const { job_id: _old, ...body } = job
      job.job_id = `wiki-job-${graphHash(body)}`
      const proposal = compileWikiFactProposal(job, { ...pack.result, job_id: job.job_id })
      const review = { ...pack.review, proposal_sha256: proposal.proposal_sha256 }
      await assert.rejects(finalizeWikiFactProposal({ root, job, proposal, review, apply: true }), /WIKI_FINALIZER_SOURCE_CHANGED/)
      assert.deepEqual(await readFile(resolve(root, graphRef)), beforeGraph)
      await assert.rejects(readFile(resolve(root, expectedWikiFactPath(pack.source))), /ENOENT/)
      await assert.rejects(readFile(resolve(root, expectedWikiReceiptPath(pack.source))), /ENOENT/)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('receipt season metadata is checked when present and older receipts remain compatible', async () => {
  const root = await makeRoot(['SESSION_005'])
  try {
    const pack = await syntheticS04Package(root)
    const applied = await finalizeWikiFactProposal({ root, ...pack, apply: true })
    const receiptPath = resolve(root, applied.receipt_ref)
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
    await writeFile(receiptPath, JSON.stringify({ ...receipt, season_id: 'S03' }))
    await assert.rejects(finalizeWikiFactProposal({ root, ...pack, apply: true }), /WIKI_FINALIZER_RECEIPT_COLLISION/)
    await writeFile(receiptPath, JSON.stringify({ ...receipt, source_ref: receipt.source_ref.replace('/S04/', '/S03/') }))
    await assert.rejects(finalizeWikiFactProposal({ root, ...pack, apply: true }), /WIKI_FINALIZER_RECEIPT_COLLISION/)
    delete receipt.season_id
    delete receipt.source_ref
    await writeFile(receiptPath, JSON.stringify(receipt))
    assert.equal((await finalizeWikiFactProposal({ root, ...pack, apply: true })).status, 'NOOP_ALREADY_FINALIZED')
  } finally { await rm(root, { recursive: true, force: true }) }
})
