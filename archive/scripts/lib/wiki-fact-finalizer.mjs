import { readFile, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  byteHash, graphBytes, graphHash, reconcilePublicGraphBackfill, relationId,
} from './publication-graph.mjs'
import { writeGraphAtomically } from './atomic-graph.mjs'
import {
  discoverWikiSource, discoverWikiSources, expectedWikiFactPath, expectedWikiReceiptPath,
} from './wiki-semantic-jobs.mjs'
import { buildWikiFactReviewJob, validateWikiFactReview } from './wiki-fact-extractor.mjs'

const graphRef = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const bookRef = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
const insist = (ok, code) => { if (!ok) throw new Error(code) }
const sameAnchor = (a, b) => a?.save_version === b?.save_version && a?.game_time === b?.game_time

async function fileOrNull(path) {
  try {
    insist((await lstat(path)).isFile(), 'WIKI_FINALIZER_FILE_NOT_REGULAR')
    return await readFile(path)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function validateGraphHash(graph) {
  const { content_sha256, ...body } = graph
  insist(/^[a-f0-9]{64}$/.test(content_sha256 ?? '') && graphHash(body) === content_sha256, 'WIKI_FINALIZER_GRAPH_HASH_INVALID')
}

function sourceStub(job) {
  return {
    seasonId: job.season_id,
    sourceManifestRef: job.source.manifest_ref,
    sourceSession: { session_id: job.source.session_id },
    sourceDigest: job.source.manifest_sha256,
  }
}

function assertSourceBinding(job, source) {
  const expectedParts = job.source.raw_parts ?? [{ ref: job.source.raw_ref, sha256: job.source.raw_sha256 }]
  const actualParts = source.rawParts ?? [{ ref: source.rawRef, sha256: source.rawSha256 }]
  insist(source.sourceSession.session_id === job.source.session_id
    && source.seasonId === job.season_id
    && source.sourceManifestRef === job.source.manifest_ref
    && source.sourceDigest === job.source.manifest_sha256
    && source.rawRef === job.source.raw_ref
    && source.rawSha256 === job.source.raw_sha256
    && Array.isArray(expectedParts) && expectedParts.length === actualParts.length
    && expectedParts.every((part, index) => part.ref === actualParts[index].ref && part.sha256 === actualParts[index].sha256)
    && sameAnchor(source.anchor, job.source.anchor),
  'WIKI_FINALIZER_SOURCE_CHANGED')
}

function proposalAlreadyApplied(graph, facts, factRef, factSha) {
  const nodes = new Map(graph.nodes.map((record) => [record.id, record]))
  for (const [index, data] of facts.nodes.entries()) {
    const record = nodes.get(data.id)
    if (!record || graphHash(record.data) !== graphHash(data) || !sameAnchor(record.anchor, facts.anchor)
      || record.evidence?.source_ref !== factRef || record.evidence?.source_sha256 !== factSha
      || record.evidence?.pointer !== `/nodes/${index}`) return false
  }
  const relations = new Map(graph.relations.map((record) => [record.id, record]))
  for (const [index, data] of facts.relations.entries()) {
    const record = relations.get(relationId(data))
    if (!record || graphHash(record.data) !== graphHash(data) || !sameAnchor(record.anchor, facts.anchor)
      || record.evidence?.source_ref !== factRef || record.evidence?.source_sha256 !== factSha
      || record.evidence?.pointer !== `/relations/${index}`) return false
  }
  return true
}

function receiptBody({ job, proposal, review, outcome, factSha, graphBefore, graphAfter }) {
  return {
    version: 'a-wiki-receipt-v1',
    season_id: job.season_id,
    session_id: job.source.session_id,
    source_ref: job.source.manifest_ref,
    source_sha256: job.source.manifest_sha256,
    job_id: job.job_id,
    proposal_sha256: proposal.proposal_sha256,
    review_sha256: review.review_sha256,
    outcome,
    fact_sha256: factSha,
    graph_before_sha256: graphBefore,
    graph_after_sha256: graphAfter,
    coverage: proposal.coverage.status,
  }
}

function validateExistingReceipt(receipt, { job, proposal, review }) {
  insist(receipt?.version === 'a-wiki-receipt-v1'
    && (receipt.season_id === undefined || receipt.season_id === job.season_id)
    && receipt.session_id === job.source.session_id
    && (receipt.source_ref === undefined || receipt.source_ref === job.source.manifest_ref)
    && receipt.source_sha256 === job.source.manifest_sha256
    && receipt.job_id === job.job_id
    && receipt.proposal_sha256 === proposal.proposal_sha256
    && receipt.review_sha256 === review.review_sha256
    && ['APPLIED', 'NO_FACTS'].includes(receipt.outcome)
    && receipt.coverage === 'COMPLETE',
  'WIKI_FINALIZER_RECEIPT_COLLISION')
  return receipt
}

/**
 * Finalize one independently reviewed A-Wiki proposal. Receipt is always the
 * last durable write. A missing receipt therefore keeps the same source pending.
 */
export async function finalizeWikiFactProposal({
  root, job, proposal, review: rawReview, apply = false,
}) {
  const reviewJob = buildWikiFactReviewJob(job, proposal)
  const review = validateWikiFactReview(reviewJob, rawReview)
  if (review.decision !== 'APPROVE') {
    return {
      status: review.decision,
      graph_changed: false,
      source_marked_processed: false,
      receipt_written: false,
    }
  }
  insist(proposal.coverage.status === 'COMPLETE', 'WIKI_FINALIZER_COMPLETE_REQUIRED')

  const stub = sourceStub(job)
  const factRef = expectedWikiFactPath(stub)
  const receiptRef = expectedWikiReceiptPath(stub)
  const receiptPath = resolve(root, receiptRef)
  const existingReceiptBytes = await fileOrNull(receiptPath)
  if (existingReceiptBytes) {
    const receipt = validateExistingReceipt(JSON.parse(existingReceiptBytes.toString('utf8')), { job, proposal, review })
    return {
      status: 'NOOP_ALREADY_FINALIZED',
      outcome: receipt.outcome,
      graph_changed: false,
      source_marked_processed: true,
      receipt_written: false,
      receipt_ref: receiptRef,
    }
  }

  const sources = await discoverWikiSources(root)
  const source = sources.find((item) => item.sourceSession.session_id === job.source.session_id
    && item.sourceManifestRef === job.source.manifest_ref
    && item.sourceDigest === job.source.manifest_sha256)
  insist(source, 'WIKI_FINALIZER_SOURCE_MISSING')
  assertSourceBinding(job, source)
  const pending = await discoverWikiSource(root)
  insist(pending.sourceSession.session_id === source.sourceSession.session_id
    && pending.sourceManifestRef === source.sourceManifestRef
    && pending.sourceDigest === source.sourceDigest, 'WIKI_FINALIZER_OUT_OF_ORDER_SOURCE')

  const graphPath = resolve(root, graphRef)
  const graphBeforeBytes = await readFile(graphPath)
  const currentGraph = JSON.parse(graphBeforeBytes.toString('utf8'))
  validateGraphHash(currentGraph)

  if (proposal.status === 'NO_FACTS') {
    insist(currentGraph.content_sha256 === proposal.expected_graph_sha256, 'WIKI_FINALIZER_GRAPH_CHANGED')
    const body = receiptBody({
      job, proposal, review, outcome: 'NO_FACTS', factSha: null,
      graphBefore: currentGraph.content_sha256, graphAfter: currentGraph.content_sha256,
    })
    const receiptBytes = Buffer.from(JSON.stringify(body, null, 2) + '\n')
    if (!apply) {
      return {
        status: 'READY_NO_FACTS', outcome: 'NO_FACTS', graph_changed: false,
        source_marked_processed: false, receipt_written: false, receipt_ref: receiptRef,
        receipt: body,
      }
    }
    await writeGraphAtomically(receiptPath, null, receiptBytes)
    return {
      status: 'FINALIZED', outcome: 'NO_FACTS', graph_changed: false,
      source_marked_processed: true, receipt_written: true, receipt_ref: receiptRef,
      receipt: body,
    }
  }

  insist(proposal.status === 'FACTS_PROPOSED', 'WIKI_FINALIZER_PROPOSAL_STATUS_INVALID')
  const factBytes = Buffer.from(graphBytes(proposal.facts))
  const factSha = byteHash(factBytes)
  const factPath = resolve(root, factRef)
  const existingFactBytes = await fileOrNull(factPath)
  if (existingFactBytes) insist(existingFactBytes.equals(factBytes), 'WIKI_FINALIZER_FACT_COLLISION')

  const bookBytes = await readFile(resolve(root, bookRef))
  const book = JSON.parse(bookBytes.toString('utf8'))
  const sourceEvidence = { source_ref: factRef, source_sha256: factSha }

  let candidateGraph
  let recovery = false
  if (currentGraph.content_sha256 === proposal.expected_graph_sha256) {
    candidateGraph = reconcilePublicGraphBackfill({
      previous: currentGraph,
      facts: proposal.facts,
      source: sourceEvidence,
      book,
      bookSource: { source_ref: bookRef, source_sha256: byteHash(bookBytes) },
    }).graph
  } else {
    insist(existingFactBytes && proposalAlreadyApplied(currentGraph, proposal.facts, factRef, factSha),
      'WIKI_FINALIZER_GRAPH_CHANGED')
    candidateGraph = currentGraph
    recovery = true
  }

  const candidateBytes = Buffer.from(graphBytes(candidateGraph))
  const body = receiptBody({
    job, proposal, review, outcome: 'APPLIED', factSha,
    graphBefore: proposal.expected_graph_sha256, graphAfter: candidateGraph.content_sha256,
  })
  const receiptBytes = Buffer.from(JSON.stringify(body, null, 2) + '\n')

  if (!apply) {
    return {
      status: recovery ? 'READY_RECEIPT_RECOVERY' : 'READY_TO_APPLY',
      outcome: 'APPLIED',
      graph_changed: currentGraph.content_sha256 !== candidateGraph.content_sha256,
      source_marked_processed: false,
      receipt_written: false,
      fact_ref: factRef,
      receipt_ref: receiptRef,
      receipt: body,
    }
  }

  if (!existingFactBytes) await writeGraphAtomically(factPath, null, factBytes)
  if (!recovery && !graphBeforeBytes.equals(candidateBytes)) {
    await writeGraphAtomically(graphPath, graphBeforeBytes, candidateBytes)
  }
  const finalGraphBytes = await readFile(graphPath)
  insist(finalGraphBytes.equals(candidateBytes), 'WIKI_FINALIZER_GRAPH_PERSISTENCE_FAILED')
  await writeGraphAtomically(receiptPath, null, receiptBytes)

  return {
    status: recovery ? 'RECOVERED_AND_FINALIZED' : 'FINALIZED',
    outcome: 'APPLIED',
    graph_changed: currentGraph.content_sha256 !== candidateGraph.content_sha256,
    source_marked_processed: true,
    receipt_written: true,
    fact_ref: factRef,
    receipt_ref: receiptRef,
    graph_sha256: candidateGraph.content_sha256,
    receipt: body,
  }
}
