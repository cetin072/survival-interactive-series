import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { byteHash, graphHash, relationId } from './publication-graph.mjs'
import { discoverWikiSources, expectedWikiFactPath, expectedWikiReceiptPath } from './wiki-semantic-jobs.mjs'

const repository = 'cetin072/survival-interactive-series'
const graphRef = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const insist = (ok, code) => { if (!ok) throw new Error(code) }
const hash = (value) => /^[a-f0-9]{64}$/.test(value ?? '')
const commit = (value) => /^[a-f0-9]{40}$/.test(value ?? '')
const same = (a, b) => graphHash(a) === graphHash(b)

function verifyGraph(graph) {
  const { content_sha256, ...body } = graph
  insist(hash(content_sha256) && graphHash(body) === content_sha256
    && graph.chronicle_id === 'C03-AFTERFALL' && graph.worldline_id === 'AFTERFALL'
    && graph.visibility === 'PUBLIC_ARCHIVE', 'A_WIKI_COMPLETION_GRAPH_INVALID')
}

function includesFacts(graphAtMerge, currentGraph, graphBefore, facts, factRef, factSha) {
  for (const kind of ['nodes', 'relations']) {
    const records = new Map(graphAtMerge[kind].map((record) => [record.id, record]))
    const current = new Map(currentGraph[kind].map((record) => [record.id, record]))
    const before = new Map((graphBefore?.[kind] ?? []).map((record) => [record.id, record]))
    for (const [index, data] of facts[kind].entries()) {
      const id = kind === 'nodes' ? data.id : relationId(data)
      const record = records.get(id), prior = before.get(id), latest = current.get(id)
      const applied = record?.evidence?.source_ref === factRef
        && record.evidence.source_sha256 === factSha
        && record.evidence.pointer === `/${kind}/${index}` && same(record.anchor, facts.anchor)
      // The existing reconciler intentionally leaves an identical record's
      // older evidence intact. Accept that only against the receipt-bound
      // exact graph BEFORE publication, never merely by matching labels/data.
      const unchanged = record && prior && same(record.data, prior.data)
        && same(record.anchor, prior.anchor) && same(record.evidence, prior.evidence)
      insist(record && same(record.data, data) && (applied || unchanged),
        'A_WIKI_COMPLETION_FACT_NOT_IN_GRAPH')
      // Later independently reviewed revisions are valid only if the original
      // source-bound revision remains in history. Never accept name similarity.
      const revisions = latest ? [latest, ...(latest.history ?? [])] : []
      insist(revisions.some((revision) => same(revision.evidence, record.evidence)
        && same(revision.anchor, record.anchor) && same(revision.data, record.data)),
      'A_WIKI_COMPLETION_FACT_NOT_IN_GRAPH')
    }
  }
}

/** Validate an externally merged, receipt-backed completion without inventing
 * Native Extractor/Reviewer submissions. The service-side caller proves Git
 * ancestry and exact bytes at the merged PR head and merge commit. */
export function verifyCompletedWikiPublication({
  row, source, receiptBytes, factBytes, graphAtMerge, currentGraph, graphBefore, pr, mainSha,
  mergeIsAncestor, exactFilesAtHeadAndMerge,
}) {
  insist(row?.prepared_job && source.sourceManifestRef === row.source_ref
    && source.sourceDigest === row.source_sha256
    && source.sourceSession.session_id === row.session_id
    && row.prepared_job.source.manifest_ref === row.source_ref
    && row.prepared_job.source.manifest_sha256 === row.source_sha256,
  'A_WIKI_COMPLETION_SOURCE_BINDING_INVALID')
  const receipt = JSON.parse(receiptBytes.toString('utf8'))
  insist(receipt.version === 'a-wiki-receipt-v1'
    && receipt.session_id === source.sourceSession.session_id
    && receipt.source_sha256 === source.sourceDigest
    && (receipt.season_id === undefined || receipt.season_id === row.prepared_job.season_id)
    && (receipt.source_ref === undefined || receipt.source_ref === source.sourceManifestRef)
    && /^wiki-job-[a-f0-9]{64}$/.test(receipt.job_id ?? '')
    && hash(receipt.proposal_sha256) && hash(receipt.review_sha256)
    && hash(receipt.graph_before_sha256) && hash(receipt.graph_after_sha256)
    && receipt.coverage === 'COMPLETE'
    && ['APPLIED', 'NO_FACTS'].includes(receipt.outcome),
  'A_WIKI_COMPLETION_RECEIPT_INVALID')
  const factRef = expectedWikiFactPath(source)
  const receiptRef = expectedWikiReceiptPath(source)
  verifyGraph(graphAtMerge)
  verifyGraph(currentGraph)
  insist(graphAtMerge.content_sha256 === receipt.graph_after_sha256,
    'A_WIKI_COMPLETION_MERGED_GRAPH_MISMATCH')
  if (graphBefore) {
    verifyGraph(graphBefore)
    insist(graphBefore.content_sha256 === receipt.graph_before_sha256,
      'A_WIKI_COMPLETION_PRIOR_GRAPH_MISMATCH')
  }
  if (receipt.outcome === 'APPLIED') {
    insist(factBytes && byteHash(factBytes) === receipt.fact_sha256,
      'A_WIKI_COMPLETION_FACT_HASH_MISMATCH')
    const facts = JSON.parse(factBytes.toString('utf8'))
    insist(facts.version === 'public-graph-facts-v1'
      && facts.chronicle_id === 'C03-AFTERFALL' && facts.worldline_id === 'AFTERFALL'
      && facts.visibility === 'PUBLIC_ARCHIVE' && facts.season_id === row.prepared_job.season_id
      && same(facts.anchor, source.anchor) && Array.isArray(facts.nodes)
      && Array.isArray(facts.relations), 'A_WIKI_COMPLETION_FACT_SCOPE_INVALID')
    includesFacts(graphAtMerge, currentGraph, graphBefore, facts, factRef, receipt.fact_sha256)
  } else {
    insist(receipt.fact_sha256 === null && !factBytes
      && receipt.graph_before_sha256 === receipt.graph_after_sha256,
    'A_WIKI_COMPLETION_NO_FACTS_INVALID')
  }
  insist(pr?.merged === true && pr.base?.ref === 'main'
    && pr.base?.repo?.full_name === repository && pr.head?.repo?.full_name === repository
    && Number.isSafeInteger(pr.number) && pr.number > 0 && commit(pr.head.sha)
    && typeof pr.head.ref === 'string' && pr.head.ref.length > 0
    && commit(pr.merge_commit_sha) && commit(mainSha)
    && Number.isFinite(Date.parse(pr.merged_at)), 'A_WIKI_COMPLETION_PR_BINDING_INVALID')
  insist(mergeIsAncestor === true && exactFilesAtHeadAndMerge === true,
    'A_WIKI_COMPLETION_NOT_ON_VERIFIED_MAIN')
  return {
    version: 'a-wiki-publication-evidence-v1', origin: 'EXTERNAL_REVIEWED_MERGE',
    source_ref: source.sourceManifestRef, source_sha256: source.sourceDigest,
    prepared_job_sha256: row.prepared_job_sha256,
    fact_ref: receipt.outcome === 'APPLIED' ? factRef : null,
    fact_sha256: receipt.fact_sha256, receipt_ref: receiptRef,
    receipt_sha256: byteHash(receiptBytes), receipt_job_id: receipt.job_id,
    proposal_sha256: receipt.proposal_sha256, review_sha256: receipt.review_sha256,
    graph_before_sha256: receipt.graph_before_sha256, graph_after_sha256: receipt.graph_after_sha256,
    outcome: receipt.outcome, pr_number: pr.number, head_ref: pr.head.ref,
    head_sha: pr.head.sha, merge_sha: pr.merge_commit_sha, merged_at: pr.merged_at,
    verified_main_sha: mainSha,
  }
}

const git = (base, args) => execFileSync('git', args, {
  cwd: base, maxBuffer: 8_000_000, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
})

async function github(path) {
  const token = process.env.GH_TOKEN
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(20_000),
  })
  insist(response.ok, `A_WIKI_COMPLETION_GITHUB_HTTP_${response.status}`)
  return response.json()
}

/** Read-only collector. A missing receipt is pending; a malformed or unbound
 * completion is a hard failure, never silently converted into NO_JOB. */
export async function collectCompletedWikiPublication({
  row, base, mainSha, sources, requestGithub = github,
}) {
  const available = sources ?? await discoverWikiSources(base)
  const source = available.find((candidate) => candidate.sourceManifestRef === row.source_ref
    && candidate.sourceDigest === row.source_sha256)
  insist(source, 'A_WIKI_COMPLETION_SOURCE_UNAVAILABLE')
  const receiptRef = expectedWikiReceiptPath(source)
  const receiptBytes = await readFile(resolve(base, receiptRef)).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!receiptBytes) return null
  insist(commit(mainSha), 'A_WIKI_COMPLETION_MAIN_SHA_INVALID')
  const factRef = expectedWikiFactPath(source)
  const factBytes = await readFile(resolve(base, factRef)).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  const introducingCommits = git(base, ['log', mainSha, '--diff-filter=A', '--format=%H', '--', receiptRef])
    .toString('utf8').trim().split(/\s+/).filter(Boolean)
  insist(introducingCommits.length === 1, 'A_WIKI_COMPLETION_RECEIPT_HISTORY_AMBIGUOUS')
  const candidates = await requestGithub(`commits/${introducingCommits[0]}/pulls`)
  const matching = candidates.filter((pr) => pr.merged_at && pr.base?.ref === 'main')
  insist(matching.length === 1, 'A_WIKI_COMPLETION_MERGED_PR_NOT_UNIQUE')
  const pr = await requestGithub(`pulls/${matching[0].number}`)
  insist(Number.isSafeInteger(pr.number) && pr.number > 0
    && commit(pr.merge_commit_sha) && commit(pr.head?.sha), 'A_WIKI_COMPLETION_PR_SHA_INVALID')
  try { git(base, ['cat-file', '-e', `${pr.head.sha}^{commit}`]) } catch {
    git(base, ['fetch', '--no-tags', 'origin', `pull/${pr.number}/head`])
    insist(git(base, ['rev-parse', 'FETCH_HEAD']).toString('utf8').trim() === pr.head.sha,
      'A_WIKI_COMPLETION_PR_HEAD_MOVED')
  }
  let mergeIsAncestor = false
  try { git(base, ['merge-base', '--is-ancestor', pr.merge_commit_sha, mainSha]); mergeIsAncestor = true } catch {}
  const sourceFiles = [
    [source.sourceManifestRef, source.sourceDigest],
    ...(source.rawParts ?? [{ ref: source.rawRef, sha256: source.rawSha256 }]).map((part) => [part.ref, part.sha256]),
    [receiptRef, byteHash(receiptBytes)],
    ...(factBytes ? [[factRef, byteHash(factBytes)]] : []),
  ]
  const readAt = (ref, path) => git(base, ['show', `${ref}:${path}`])
  const exactFilesAtHeadAndMerge = [pr.head.sha, pr.merge_commit_sha, mainSha].every((ref) =>
    sourceFiles.every(([path, expected]) => byteHash(readAt(ref, path)) === expected))
  const graphAtMerge = JSON.parse(readAt(pr.merge_commit_sha, graphRef).toString('utf8'))
  const graphAtHead = JSON.parse(readAt(pr.head.sha, graphRef).toString('utf8'))
  insist(same(graphAtHead, graphAtMerge), 'A_WIKI_COMPLETION_PR_GRAPH_CHANGED')
  const currentGraph = JSON.parse(readAt(mainSha, graphRef).toString('utf8'))
  const baseGraph = commit(pr.base?.sha)
    ? JSON.parse(readAt(pr.base.sha, graphRef).toString('utf8')) : null
  const graphBefore = baseGraph?.content_sha256 === JSON.parse(receiptBytes).graph_before_sha256
    ? baseGraph : null
  return verifyCompletedWikiPublication({ row, source, receiptBytes, factBytes,
    graphAtMerge, currentGraph, graphBefore, pr, mainSha, mergeIsAncestor, exactFilesAtHeadAndMerge })
}
