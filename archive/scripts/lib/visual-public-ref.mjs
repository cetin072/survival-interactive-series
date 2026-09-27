/** Compile visual briefs from a verified local public graph, without image execution. */
import { createBatch } from './publication-plan.mjs'
import { compileVisualCatalog, planVisualSelection, validateVisualCatalog,
  visualByteHash, visualBytes } from './visual-compiler.mjs'
import { commitLocalProposalFiles, git } from './atomic-public-segment-git.mjs'
import { verifyGraphAtPublicRef } from './graph-public-ref.mjs'
import { inspectPublicRef } from './reader-public-ref.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const graphPath = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const visualPath = 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'
const reviewedAppearancePath =
  'archive/content/public-facts/C03-AFTERFALL/S02/APPEARANCES_APPROVED_20260926.json'

export async function prepareVisualFromPublicRef(options = {}) {
  const inspected = await inspectPublicRef(options)
  const graphProof = await verifyGraphAtPublicRef(options)
  demand(graphProof.baseCommit === inspected.base, 'GRAPH_REF_MOVED_DURING_VISUAL_READ')
  const { root, base, ref, seasonId, read, snapshot, gitBinary } = inspected
  const graphBytes = await read(graphPath)
  demand(graphBytes.equals(graphProof.candidateBytes), 'GRAPH_CHANGED_DURING_VISUAL_READ')
  const approvedBytes = await read(reviewedAppearancePath)
  const reviewed = JSON.parse(approvedBytes.toString('utf8'))
  demand(Array.isArray(reviewed.records), 'MISSING_REVIEWED_APPEARANCES')
  const appearances = { ...reviewed, records: reviewed.records.map((item) => {
    demand(!Object.hasOwn(item, 'evidence'), 'CALLER_APPEARANCE_EVIDENCE_REJECTED')
    return { ...item, evidence: { source_ref: reviewedAppearancePath,
      source_sha256: visualByteHash(approvedBytes),
      pointer: `/characters/${item.node_id}` } }
  }) }
  const catalog = compileVisualCatalog({ batch: createBatch(snapshot),
    graph: JSON.parse(graphBytes.toString('utf8')), appearances })
  validateVisualCatalog(catalog)
  const candidateBytes = Buffer.from(visualBytes(catalog))
  demand(candidateBytes.length <= 2_500_000, 'VISUAL_CATALOG_TOO_LARGE')
  const present = (await git(gitBinary, root, ['ls-tree', '-r', '--name-only', base,
    '--', visualPath])).toString('utf8').trim() === visualPath
  if (present) {
    const previousBytes = await read(visualPath)
    const previous = JSON.parse(previousBytes.toString('utf8'))
    validateVisualCatalog(previous)
    demand(previous.anchor.save_version <= catalog.anchor.save_version
      && previous.anchor.game_time <= catalog.anchor.game_time,
    'STALE_VISUAL_CATALOG')
    demand(!previousBytes.equals(candidateBytes), 'VISUAL_REF_ALREADY_CURRENT')
  }
  const selection = planVisualSelection(catalog)
  return { ref, baseCommit: base, seasonId, candidateBytes,
    report: { status: 'VISUAL_CATALOG_READY_IN_MEMORY',
      catalog_sha256: catalog.content_sha256, point_count: catalog.points.length,
      selected_point_ids: selection.selected_point_ids,
      execution_enabled: false, provider_calls: 0, files_written: 0,
      remote_pushes: 0, site_publications: 0 } }
}

export async function commitVisualFromPublicRef(options = {}) {
  demand(typeof options.authorizeCommit === 'function', 'VISUAL_GIT_COMMIT_DISABLED')
  const prepared = await prepareVisualFromPublicRef(options)
  demand(await options.authorizeCommit({ ref: prepared.ref,
    baseCommit: prepared.baseCommit, seasonId: prepared.seasonId,
    catalogSha256: prepared.report.catalog_sha256,
    pointCount: prepared.report.point_count }) === true,
  'VISUAL_GIT_COMMIT_NOT_AUTHORIZED')
  const commit = await commitLocalProposalFiles({ repoRoot: options.repoRoot,
    ref: prepared.ref, baseCommit: prepared.baseCommit,
    files: new Map([[visualPath, prepared.candidateBytes]]),
    subject: `Propose visual catalog ${prepared.seasonId}`,
    gitBinary: options.gitBinary })
  return { status: 'LOCAL_VISUAL_PROPOSAL_COMMITTED', ref: prepared.ref,
    base_commit: prepared.baseCommit, commit,
    catalog_sha256: prepared.report.catalog_sha256,
    point_count: prepared.report.point_count,
    execution_enabled: false, provider_calls: 0, checkout_files_written: 0,
    remote_pushes: 0, site_publications: 0 }
}
