/** Advance only an existing local proposal ref through the verified text stages.
 * Each stage needs its own trusted authorizer; no image or site action occurs.
 */
import { commitReaderFromPublicRef } from './reader-public-ref.mjs'
import { commitGraphRelinkFromPublicRef } from './graph-public-ref.mjs'
import { commitVisualFromPublicRef } from './visual-public-ref.mjs'
import { inspectPublicRefProgress } from './public-ref-progress.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const commits = {
  READER: commitReaderFromPublicRef,
  GRAPH: commitGraphRelinkFromPublicRef,
  VISUAL: commitVisualFromPublicRef,
}

export async function advanceLocalPublicRef(options = {}) {
  const authorizers = options.authorizers
  demand(authorizers && ['READER', 'GRAPH', 'VISUAL']
    .every((stage) => typeof authorizers[stage] === 'function'),
  'LOCAL_PUBLIC_REF_DRIVER_DISABLED')
  const advanced = []
  for (let i = 0; i < 4; i++) {
    const progress = await inspectPublicRefProgress(options)
    if (progress.next_stage === 'IMAGE_REVIEW') return {
      status: 'LOCAL_PUBLIC_REF_READY_FOR_IMAGE_REVIEW',
      ref: progress.ref, source_revision: progress.source_revision,
      stages_advanced: advanced, requests: progress.requests,
      deferred: progress.deferred, execution_enabled: false,
      provider_calls: 0, checkout_files_written: 0, remote_pushes: 0,
      database_writes: 0, storage_uploads: 0, site_publications: 0,
      zero_added_cost_proven: false,
    }
    const stage = progress.next_stage
    demand(Object.hasOwn(commits, stage), 'UNKNOWN_LOCAL_PUBLIC_REF_STAGE')
    const result = await commits[stage]({ ...options,
      authorizeCommit: (context) => authorizers[stage]({ stage,
        candidate_sha256: progress.candidate_sha256, ...context }) })
    demand(result.ref === progress.ref && result.base_commit === progress.source_revision
      && /^[a-f0-9]{40}$/.test(result.commit),
    'LOCAL_PUBLIC_REF_STAGE_RESULT_MISMATCH')
    advanced.push({ stage, base_commit: result.base_commit,
      commit: result.commit, candidate_sha256: progress.candidate_sha256 })
  }
  throw new Error('LOCAL_PUBLIC_REF_STAGE_LIMIT_EXCEEDED')
}
