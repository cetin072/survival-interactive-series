/** Commit a compiled Reader edition to a local proposal ref after explicit approval.
 * This path never edits the checkout, pushes a remote, or publishes a site.
 */
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { prepareTextPublication } from '../run-reader-publication.mjs'
import { commitLocalProposalFiles, git } from './atomic-public-segment-git.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const bookPath = 'archive/content/stories/C03-AFTERFALL/BOOK.json'

/** The snapshot must point at committed, public sources; the Reader compiler rechecks them. */
export async function commitReaderBookProposal(snapshot, {
  repoRoot, ref, gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git',
  authorizeCommit,
} = {}) {
  demand(repoRoot && typeof authorizeCommit === 'function', 'READER_GIT_COMMIT_DISABLED')
  const root = resolve(repoRoot)
  const head = (await git(gitBinary, root, ['rev-parse', 'HEAD'])).toString().trim()
  demand(head === snapshot?.source_revision, 'READER_SNAPSHOT_NOT_AT_HEAD')
  const prepared = await prepareTextPublication(snapshot)
  demand(prepared.bookPath === bookPath && prepared.report.source_revision === head
    && prepared.report.mode === 'LOCAL_READER_BATCH'
    && prepared.report.added_chapters > 0
    && Buffer.isBuffer(prepared.candidateBytes)
    && prepared.candidateBytes.length <= 2_500_000
    && hash(prepared.candidateBytes) === prepared.report.book_sha256,
  'READER_PROPOSAL_HAS_NO_APPROVED_ADDITION')
  const approved = await authorizeCommit({ baseCommit: head, ref,
    seasonId: snapshot.season_id, bookSha256: prepared.report.book_sha256,
    addedChapters: prepared.report.added_chapters })
  demand(approved === true, 'READER_GIT_COMMIT_NOT_AUTHORIZED')
  const commit = await commitLocalProposalFiles({ repoRoot: root, ref,
    baseCommit: head, files: new Map([[bookPath, prepared.candidateBytes]]),
    subject: `Propose Reader book ${snapshot.season_id}`, gitBinary })
  return { status: 'LOCAL_READER_PROPOSAL_COMMITTED', ref, base_commit: head,
    commit, book_sha256: prepared.report.book_sha256,
    added_chapters: prepared.report.added_chapters,
    checkout_files_written: 0, remote_pushes: 0, site_publications: 0 }
}
