import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { graphHash } from './publication-graph.mjs'
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
  await cp(resolve(repoRoot, graphRef), resolve(root, graphRef))
  await cp(resolve(repoRoot, bookRef), resolve(root, bookRef))
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

test('SESSION_006 reviewed backfill keeps global 282, writes receipt last, then advances to SESSION_007', async () => {
  await withRoot(async (root) => {
    const pack = await completePackage(root)
    const before = JSON.parse(await readFile(resolve(root, graphRef), 'utf8'))
    assert.equal(before.anchor.save_version, 282)

    const check = await finalizeWikiFactProposal({ root, ...pack, apply: false })
    assert.equal(check.status, 'READY_TO_APPLY')
    assert.equal(check.source_marked_processed, false)

    const result = await finalizeWikiFactProposal({ root, ...pack, apply: true })
    assert.equal(result.status, 'FINALIZED')
    assert.equal(result.source_marked_processed, true)
    assert.equal(result.receipt_written, true)

    const after = JSON.parse(await readFile(resolve(root, graphRef), 'utf8'))
    assert.equal(after.anchor.save_version, 282)
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
