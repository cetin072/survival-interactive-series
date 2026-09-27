/** Inspect an existing local public Git ref and identify its next proposal stage.
 * This does not authorize a commit, image request execution, or publication.
 */
import { createHash } from 'node:crypto'
import { inspectPublicRef, prepareReaderFromPublicRef,
  verifyReaderBookAtPublicRef } from './reader-public-ref.mjs'
import { prepareGraphRelinkFromPublicRef,
  verifyGraphAtPublicRef } from './graph-public-ref.mjs'
import { prepareVisualFromPublicRef,
  verifyVisualAtPublicRef } from './visual-public-ref.mjs'
import { prepareImageRequestsFromPublicRef } from './image-request-public-ref.mjs'

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const demand = (ok, code) => { if (!ok) throw new Error(code) }

async function inspectStage(options, base, prepare, verify, currentCode) {
  try {
    const proposal = await prepare(options)
    demand(proposal.baseCommit === base, 'PUBLIC_REF_MOVED_DURING_PROGRESS_CHECK')
    return { current: false, proposal }
  } catch (error) {
    if (error.message !== currentCode) throw error
  }
  const proof = await verify(options)
  demand(proof.baseCommit === base, 'PUBLIC_REF_MOVED_DURING_PROGRESS_CHECK')
  return { current: true, proof }
}

export async function inspectPublicRefProgress(options = {}) {
  const inspected = await inspectPublicRef(options)
  const { ref, base, seasonId } = inspected
  const common = { version: 'public-ref-progress-v1', ref, source_revision: base,
    season_id: seasonId, mode: 'READ_ONLY_CHECK', execution_enabled: false,
    file_writes: 0, provider_calls: 0, database_writes: 0,
    storage_uploads: 0, site_publications: 0 }
  const reader = await inspectStage(options, base, prepareReaderFromPublicRef,
    verifyReaderBookAtPublicRef, 'READER_REF_HAS_NO_NEW_CHAPTER')
  if (!reader.current) return { ...common, status: 'READER_LOCAL_COMMIT_REQUIRED',
    next_stage: 'READER', candidate_sha256: hash(reader.proposal.candidateBytes),
    added_chapters: reader.proposal.report.added_chapters }
  const graph = await inspectStage(options, base, prepareGraphRelinkFromPublicRef,
    verifyGraphAtPublicRef, 'GRAPH_REF_ALREADY_CURRENT')
  if (!graph.current) return { ...common, status: 'GRAPH_LOCAL_COMMIT_REQUIRED',
    next_stage: 'GRAPH', candidate_sha256: hash(graph.proposal.candidateBytes),
    story_links: graph.proposal.report.story_links }
  const visual = await inspectStage(options, base, prepareVisualFromPublicRef,
    verifyVisualAtPublicRef, 'VISUAL_REF_ALREADY_CURRENT')
  if (!visual.current) return { ...common, status: 'VISUAL_LOCAL_COMMIT_REQUIRED',
    next_stage: 'VISUAL', candidate_sha256: hash(visual.proposal.candidateBytes),
    point_count: visual.proposal.report.point_count }
  const requests = await prepareImageRequestsFromPublicRef(options)
  demand(requests.source_revision === base, 'PUBLIC_REF_MOVED_DURING_PROGRESS_CHECK')
  return { ...common, status: 'IMAGE_REQUESTS_PREPARED_NO_EXECUTION',
    next_stage: 'IMAGE_REVIEW', catalog_sha256: requests.catalog_sha256,
    selected_point_ids: requests.selected_point_ids,
    requests: requests.requests, deferred: requests.deferred,
    zero_added_cost_proven: false }
}
