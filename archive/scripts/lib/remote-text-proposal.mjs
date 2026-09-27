/** Push one approved RAW segment proposal to an allowlisted GitHub branch.
 * A replay verifies the same three blobs and reuses the existing commit.
 * This does not create a PR, merge, deploy or mark content PUBLISHED.
 */
import { resolve } from 'node:path'
import { commitPublicSegmentBundle, git } from './atomic-public-segment-git.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const refPattern = /^refs\/heads\/codex\/archive-publication-[a-z0-9-]{1,50}$/

export function textProposalRef(taskId) {
  demand(typeof taskId === 'string' && /^task-[a-f0-9]{64}$/.test(taskId),
    'INVALID_TEXT_TASK_ID')
  return `refs/heads/codex/archive-publication-${taskId.slice(5, 37)}`
}

async function remoteSha(gitBinary, root, ref) {
  const output = (await git(gitBinary, root, ['ls-remote', '--heads', 'origin', ref]))
    .toString('utf8').trim()
  if (!output) return null
  const lines = output.split('\n')
  demand(lines.length === 1, 'PUBLIC_REMOTE_REF_AMBIGUOUS')
  const [commit, name] = lines[0].split('\t')
  demand(sha(commit) && name === ref, 'PUBLIC_REMOTE_REF_INVALID')
  return commit
}

async function matchesBundle(gitBinary, root, commit, baseCommit, bundle,
  fetchRef = null) {
  if (fetchRef) await git(gitBinary, root,
    ['fetch', '--no-tags', 'origin', fetchRef])
  const parentLine = (await git(gitBinary, root,
    ['rev-list', '--parents', '-n', '1', commit])).toString('utf8').trim()
  const parts = parentLine.split(' ')
  if (parts.length !== 2 || parts[0] !== commit || parts[1] !== baseCommit)
    return false
  const changed = (await git(gitBinary, root,
    ['diff-tree', '--no-commit-id', '--name-only', '-r', commit]))
    .toString('utf8').trim().split('\n').filter(Boolean).sort()
  if (JSON.stringify(changed) !== JSON.stringify([...bundle.files.keys()].sort()))
    return false
  for (const [path, bytes] of bundle.files) {
    const actual = await git(gitBinary, root, ['show', `${commit}:${path}`])
    if (!actual.equals(bytes)) return false
  }
  return true
}

/** Checkout credentials must be scoped by the trusted GitHub Actions job. */
export async function commitOrReuseRemoteTextProposal(bundle, {
  repoRoot, taskId, authorizeCommit,
  gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git',
} = {}) {
  demand(repoRoot && sha(bundle?.baseCommit)
    && bundle?.files instanceof Map && bundle.files.size === 3
    && typeof authorizeCommit === 'function',
  'PUBLIC_TEXT_PROPOSAL_DISABLED')
  const root = resolve(repoRoot)
  const ref = textProposalRef(taskId)
  demand(refPattern.test(ref), 'INVALID_TEXT_PROPOSAL_REF')
  const checkout = (await git(gitBinary, root, ['rev-parse', 'HEAD']))
    .toString('utf8').trim()
  demand(checkout === bundle.baseCommit, 'PUBLIC_PROPOSAL_CHECKOUT_MISMATCH')
  const main = await remoteSha(gitBinary, root, 'refs/heads/main')
  demand(main === bundle.baseCommit, 'PUBLIC_MAIN_BASE_MOVED')

  const existing = await remoteSha(gitBinary, root, ref)
  if (existing) {
    demand(await matchesBundle(gitBinary, root, existing, bundle.baseCommit,
      bundle, ref),
      'PUBLIC_REMOTE_REF_CONFLICT')
    demand(await remoteSha(gitBinary, root, ref) === existing,
      'PUBLIC_REMOTE_REF_MOVED')
    return { commit: existing, remoteRef: ref, remoteVerified: true,
      reused: true, sitePublications: 0 }
  }

  let local
  try {
    local = (await git(gitBinary, root, ['rev-parse', '--verify', ref]))
      .toString('utf8').trim()
  } catch {
    await git(gitBinary, root,
      ['update-ref', ref, bundle.baseCommit, '0'.repeat(40)])
    local = bundle.baseCommit
  }
  let proposalCommit
  if (local === bundle.baseCommit) {
    const proposal = await commitPublicSegmentBundle(bundle, {
      repoRoot: root, ref, gitBinary, authorizeCommit,
    })
    proposalCommit = proposal.commit
  } else {
    demand(sha(local) && await matchesBundle(gitBinary, root,
      local, bundle.baseCommit, bundle), 'PUBLIC_LOCAL_REF_CONFLICT')
    proposalCommit = local
  }
  try {
    await git(gitBinary, root, ['push', 'origin', `${proposalCommit}:${ref}`])
  } catch {
    const raced = await remoteSha(gitBinary, root, ref)
    demand(raced && await matchesBundle(gitBinary, root,
      raced, bundle.baseCommit, bundle, ref), 'PUBLIC_REMOTE_REF_CONFLICT')
    proposalCommit = raced
  }
  demand(await remoteSha(gitBinary, root, ref) === proposalCommit,
    'PUBLIC_REMOTE_PUSH_NOT_VERIFIED')
  return { commit: proposalCommit, remoteRef: ref, remoteVerified: true,
    reused: local !== bundle.baseCommit, sitePublications: 0 }
}
