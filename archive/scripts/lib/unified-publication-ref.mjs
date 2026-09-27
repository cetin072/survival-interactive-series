/** One atomic local proposal for a Reader, Graph and Visual edition.
 * This never pushes a branch or deploys a site.
 */
import { resolve } from 'node:path'
import { prepareUnifiedPublication } from '../prepare-unified-publication.mjs'
import { commitLocalProposalFiles, git } from './atomic-public-segment-git.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const rootOfModule = resolve(import.meta.dirname, '../../..')
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const refPattern = /^refs\/heads\/codex\/archive-publication-[a-z0-9-]{1,50}$/
const bookPath = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
const graphPath = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const visualPath = 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'

export async function proposeUnifiedPublication({ snapshot, options = {}, repoRoot,
  ref, baseCommit, authorizeCommit,
  gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git' } = {}) {
  demand(repoRoot && resolve(repoRoot) === rootOfModule && refPattern.test(ref)
    && sha(baseCommit) && snapshot?.source_revision === baseCommit
    && typeof authorizeCommit === 'function', 'UNIFIED_REF_PROPOSAL_DISABLED')
  const root = resolve(repoRoot)
  const head = (await git(gitBinary, root, ['rev-parse', 'HEAD'])).toString().trim()
  demand(head === baseCommit, 'UNIFIED_REF_CHECKOUT_MISMATCH')
  const prepared = await prepareUnifiedPublication(snapshot, options)
  demand(prepared.report.source_revision === baseCommit, 'UNIFIED_REF_SNAPSHOT_MISMATCH')
  const files = new Map([
    [bookPath, prepared.reader.candidateBytes],
    [graphPath, prepared.graph.candidateBytes],
    [visualPath, prepared.visual.candidateBytes],
  ])
  const current = (await git(gitBinary, root, ['rev-parse', '--verify', ref])).toString().trim()
  const matches = async (commit) => {
    for (const [path, bytes] of files) {
      const entry = (await git(gitBinary, root,
        ['ls-tree', commit, '--', path])).toString('utf8').trim()
      if (!entry) return false
      if (!(await git(gitBinary, root, ['show', `${commit}:${path}`])).equals(bytes)) return false
    }
    return true
  }
  if (current !== baseCommit) {
    const lineage = (await git(gitBinary, root,
      ['rev-list', '--parents', '-n', '1', current])).toString().trim().split(' ')
    demand(lineage.length === 2 && lineage[1] === baseCommit && await matches(current),
      'UNIFIED_REF_BASE_MOVED')
    return { status: 'EXISTING_UNIFIED_PROPOSAL_REUSED', ref,
      base_commit: baseCommit, commit: current, ...prepared.report,
      checkout_files_written: 0, remote_pushes: 0, site_publications: 0 }
  }
  if (await matches(baseCommit)) return {
    status: 'UNIFIED_EDITION_ALREADY_CURRENT', ref, base_commit: baseCommit,
    commit: baseCommit, ...prepared.report,
    checkout_files_written: 0, remote_pushes: 0, site_publications: 0 }
  demand(await authorizeCommit({ ref, baseCommit,
    batchId: prepared.report.batch_id,
    readerSha256: prepared.report.reader_sha256,
    graphSha256: prepared.report.graph_sha256,
    visualSha256: prepared.report.visual_sha256 }) === true,
  'UNIFIED_REF_COMMIT_NOT_AUTHORIZED')
  const commit = await commitLocalProposalFiles({ repoRoot: root, ref,
    baseCommit, files, subject: 'Propose unified public archive edition', gitBinary })
  return { status: 'LOCAL_UNIFIED_PROPOSAL_COMMITTED', ref,
    base_commit: baseCommit, commit, ...prepared.report,
    files_in_commit: 3, checkout_files_written: 0,
    remote_pushes: 0, site_publications: 0 }
}
