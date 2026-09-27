/** Relink a verified public Reader book against existing approved graph entities. */
import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { snapshotFromPublishedS02 } from '../dry-run-publication.mjs'
import { createBatch } from './publication-plan.mjs'
import { byteHash, graphBytes, legacyPublicFacts, reconcilePublicGraph,
  relinkPublicGraph } from './publication-graph.mjs'
import { commitLocalProposalFiles, git } from './atomic-public-segment-git.mjs'
import { inspectPublicRef, verifyReaderBookAtPublicRef } from './reader-public-ref.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const seedPath = 'archive/web/src/archive/archiveData.ts'
const bookPath = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
const graphPath = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const s02Path = 'archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json'

export async function prepareGraphRelinkFromPublicRef(options = {}) {
  const inspected = await inspectPublicRef(options)
  const verifiedBook = await verifyReaderBookAtPublicRef(options)
  demand(verifiedBook.baseCommit === inspected.base, 'READER_REF_MOVED_DURING_GRAPH_READ')
  const { root, base, ref, seasonId, read, snapshot, gitBinary } = inspected
  const bookBytes = await read(bookPath)
  demand(bookBytes.equals(verifiedBook.candidateBytes), 'READER_BOOK_CHANGED_DURING_GRAPH_READ')
  const book = JSON.parse(bookBytes.toString('utf8'))
  const bookSource = { source_ref: bookPath, source_sha256: byteHash(bookBytes) }
  const existing = (await git(gitBinary, root, ['ls-tree', '-r', '--name-only', base,
    '--', graphPath])).toString('utf8').trim() === graphPath
  let previous, bootstrapped = false
  if (existing) previous = JSON.parse((await read(graphPath)).toString('utf8'))
  else {
    const seedBytes = await read(seedPath)
    const localSeed = resolve(root, seedPath)
    demand((await lstat(localSeed)).isFile()
      && seedBytes.equals(await readFile(localSeed)), 'PUBLIC_GRAPH_SEED_CHECKOUT_CHANGED')
    const seedModule = await import(pathToFileURL(localSeed).href)
    const seedFacts = legacyPublicFacts(seedModule)
    const s02 = snapshotFromPublishedS02(
      JSON.parse((await read(s02Path)).toString('utf8')), base)
    previous = reconcilePublicGraph({ batch: createBatch(s02), facts: seedFacts,
      source: { source_ref: seedPath, source_sha256: byteHash(seedBytes) },
      book, bookSource }).graph
    bootstrapped = true
  }
  const result = relinkPublicGraph({ batch: createBatch(snapshot), previous,
    book, bookSource })
  demand(result.report.status !== 'NOOP', 'GRAPH_REF_ALREADY_CURRENT')
  const candidateBytes = Buffer.from(graphBytes(result.graph))
  demand(candidateBytes.length <= 2_500_000, 'PUBLIC_GRAPH_TOO_LARGE')
  return { ref, baseCommit: base, seasonId, candidateBytes,
    report: { ...result.report, status: 'GRAPH_RELINK_READY_IN_MEMORY',
      graph_sha256: result.graph.content_sha256, bootstrapped,
      files_written: 0, remote_pushes: 0, site_publications: 0 } }
}

export async function commitGraphRelinkFromPublicRef(options = {}) {
  demand(typeof options.authorizeCommit === 'function', 'GRAPH_GIT_COMMIT_DISABLED')
  const prepared = await prepareGraphRelinkFromPublicRef(options)
  demand(await options.authorizeCommit({ ref: prepared.ref,
    baseCommit: prepared.baseCommit, seasonId: prepared.seasonId,
    graphSha256: prepared.report.graph_sha256,
    storyLinks: prepared.report.story_links }) === true,
  'GRAPH_GIT_COMMIT_NOT_AUTHORIZED')
  const commit = await commitLocalProposalFiles({ repoRoot: options.repoRoot,
    ref: prepared.ref, baseCommit: prepared.baseCommit,
    files: new Map([[graphPath, prepared.candidateBytes]]),
    subject: `Propose public graph relink ${prepared.seasonId}`,
    gitBinary: options.gitBinary })
  return { status: 'LOCAL_GRAPH_PROPOSAL_COMMITTED', ref: prepared.ref,
    base_commit: prepared.baseCommit, commit,
    graph_sha256: prepared.report.graph_sha256,
    story_links: prepared.report.story_links,
    nodes_added: 0, relations_added: 0, checkout_files_written: 0,
    remote_pushes: 0, site_publications: 0 }
}
