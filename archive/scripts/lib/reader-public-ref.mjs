/** Compile an approved public season from a local Git proposal ref, without checking it out. */
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { approvedSeasonCatalog } from './approved-reader-sources.mjs'
import { c03BaselineCatalog } from './reader-c03-baseline-catalog.mjs'
import { snapshotFromPublicSeason } from './public-season-snapshot.mjs'
import { checkAppendOnlyEdition, selectTextBatchCatalog } from './reader-auto.mjs'
import { commitLocalProposalFiles, git } from './atomic-public-segment-git.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const hash = (value) => createHash('sha256').update(value).digest('hex')
const refPattern = /^refs\/heads\/codex\/archive-publication-[a-z0-9-]{1,50}$/
const seasonPattern = /^S\d{2,3}$/
const transcriptRoot = 'archive/content/transcripts/C03-AFTERFALL'
const bookPath = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
const graphPath = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const visualPath = 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'
const attemptPathPattern = /^archive\/content\/visuals\/C03-AFTERFALL\/attempts\/[a-f0-9]{64}\.json$/
const seedPath = 'archive/web/src/archive/archiveData.ts'

/** Shared pinned public-ref reader for downstream local proposal stages. */
export async function inspectPublicRef({ repoRoot, ref, seasonId, checkpointRef,
  gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git' } = {}) {
  demand(repoRoot && refPattern.test(ref) && seasonPattern.test(seasonId)
    && !['S01', 'S02'].includes(seasonId), 'INVALID_READER_PUBLIC_REF_REQUEST')
  const root = resolve(repoRoot)
  const actualRoot = (await git(gitBinary, root, ['rev-parse', '--show-toplevel'])).toString().trim()
  demand(resolve(actualRoot) === root, 'READER_GIT_ROOT_MISMATCH')
  const head = (await git(gitBinary, root, ['rev-parse', 'HEAD'])).toString().trim()
  const base = (await git(gitBinary, root, ['rev-parse', '--verify', ref])).toString().trim()
  demand(sha(head) && sha(base), 'UNPINNED_READER_REF')
  const ancestor = (await git(gitBinary, root, ['merge-base', head, base])).toString().trim()
  demand(ancestor === head, 'READER_REF_NOT_DESCENDANT_OF_CHECKOUT')
  const changed = (await git(gitBinary, root, ['diff', '--name-only', head, base])).toString('utf8')
    .split('\n').filter(Boolean)
  demand(changed.every((path) => path === bookPath || path === graphPath
    || path === visualPath
    || attemptPathPattern.test(path)
    || /^archive\/content\/transcripts\/C03-AFTERFALL\/S\d{2,3}\/[A-Za-z0-9_./-]+$/.test(path)),
  'READER_REF_CHANGED_CODE_OR_OTHER_CONTENT')
  const read = async (path) => {
    demand((path === bookPath || path === graphPath || path === visualPath
      || attemptPathPattern.test(path)
      || path === seedPath
      || /^archive\/content\/public-facts\/C03-AFTERFALL\/S02\/[A-Za-z0-9_-]+\.json$/.test(path)
      || /^archive\/content\/transcripts\/C03-AFTERFALL\/S\d{2,3}\/[A-Za-z0-9_./-]+$/.test(path)
      || /^worldlines\/AFTERFALL\/seasons\/S\d{2,3}\/[A-Za-z0-9_/-]+\.md$/.test(path))
      && !path.split('/').includes('..'), 'INVALID_READER_GIT_PATH')
    return git(gitBinary, root, ['show', `${base}:${path}`])
  }
  const paths = (await git(gitBinary, root, ['ls-tree', '-r', '--name-only', base,
    '--', transcriptRoot])).toString('utf8').split('\n').filter(Boolean)
  const listParts = async (prefix) => {
    demand(new RegExp(`^${transcriptRoot}/S\\d{2,3}/SESSION_\\d{3}$`).test(prefix),
      'INVALID_READER_PART_DIRECTORY')
    return paths.filter((path) => path.startsWith(`${prefix}/`))
      .map((path) => path.slice(prefix.length + 1))
      .filter((name) => /^PART_\d{3}\.md$/.test(name))
  }
  const manifestPaths = paths.filter((path) =>
    /^archive\/content\/transcripts\/C03-AFTERFALL\/S\d{2,3}\/MANIFEST\.json$/.test(path))
    .filter((path) => !/\/S0[12]\//.test(path)).sort()
  const targetPath = `${transcriptRoot}/${seasonId}/MANIFEST.json`
  demand(manifestPaths.includes(targetPath), 'MISSING_PUBLIC_SEASON_AT_REF')
  const target = JSON.parse((await read(targetPath)).toString('utf8'))
  const snapshot = await snapshotFromPublicSeason(target, base, checkpointRef, { read, listParts })
  return { root, ref, head, base, seasonId, read, paths, listParts,
    manifestPaths, snapshot, gitBinary }
}

async function compileReaderFromPublicRef(options, acceptCurrentBook) {
  const { ref, base, seasonId, read, paths, listParts, manifestPaths, snapshot } =
    await inspectPublicRef(options)
  const { makeBooks } = await import('../build-reader-edition.mjs')
  const s02Manifest = JSON.parse((await read(`${transcriptRoot}/S02/MANIFEST.json`)).toString('utf8'))
  const catalog = c03BaselineCatalog(s02Manifest, paths)
  for (const path of manifestPaths) {
    const manifest = JSON.parse((await read(path)).toString('utf8'))
    catalog.push(...await approvedSeasonCatalog(manifest, manifest.season_id, { read, listParts }))
  }
  const previous = JSON.parse((await read(bookPath)).toString('utf8'))
  const selected = selectTextBatchCatalog(catalog, previous, snapshot)
  const [candidate] = await makeBooks({ readSource: read,
    catalogs: { 'C03-AFTERFALL': selected } })
  const allowed = new Set(snapshot.sources.filter((source) => source.atomic_pairing_complete === true)
    .map((source) => source.source_ref))
  const additions = checkAppendOnlyEdition(previous, candidate, allowed)
  const candidateBytes = Buffer.from(JSON.stringify(candidate, null, 2) + '\n')
  demand(candidateBytes.length <= 2_500_000, 'READER_BOOK_TOO_LARGE')
  if (acceptCurrentBook) {
    demand(additions.length === 0 && candidateBytes.equals(await read(bookPath)),
      'READER_BOOK_AT_REF_NOT_VERIFIED')
  } else demand(additions.length > 0, 'READER_REF_HAS_NO_NEW_CHAPTER')
  return { ref, baseCommit: base, seasonId, bookPath, candidateBytes,
    report: { status: 'READER_PROPOSAL_READY_IN_MEMORY', source_revision: base,
      book_sha256: hash(candidateBytes), added_chapters: additions.length,
      files_written: 0, remote_pushes: 0, site_publications: 0 } }
}

export const prepareReaderFromPublicRef = (options = {}) =>
  compileReaderFromPublicRef(options, false)

/** Recompile and compare the already-proposed BOOK before downstream graph work. */
export const verifyReaderBookAtPublicRef = (options = {}) =>
  compileReaderFromPublicRef(options, true)

/** Caller supplies real authorization. This method can advance only the existing local ref. */
export async function commitReaderFromPublicRef(options = {}) {
  demand(typeof options.authorizeCommit === 'function', 'READER_GIT_COMMIT_DISABLED')
  const prepared = await prepareReaderFromPublicRef(options)
  demand(await options.authorizeCommit({ baseCommit: prepared.baseCommit, ref: prepared.ref,
    seasonId: prepared.seasonId, bookSha256: prepared.report.book_sha256,
    addedChapters: prepared.report.added_chapters }) === true,
  'READER_GIT_COMMIT_NOT_AUTHORIZED')
  const commit = await commitLocalProposalFiles({ repoRoot: options.repoRoot,
    ref: prepared.ref, baseCommit: prepared.baseCommit,
    files: new Map([[bookPath, prepared.candidateBytes]]),
    subject: `Propose Reader book ${prepared.seasonId}`,
    gitBinary: options.gitBinary })
  return { status: 'LOCAL_READER_PROPOSAL_COMMITTED', ref: prepared.ref,
    base_commit: prepared.baseCommit, commit,
    book_sha256: prepared.report.book_sha256,
    added_chapters: prepared.report.added_chapters,
    checkout_files_written: 0, remote_pushes: 0, site_publications: 0 }
}
