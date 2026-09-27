/** Atomic local Git-ref publication proposal. No checkout edit, remote push or site publish.
 * A trusted authorization callback is mandatory; this code does not supply one.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { approvedSeasonCatalog } from './approved-reader-sources.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const refPattern = /^refs\/heads\/codex\/archive-publication-[a-z0-9-]{1,50}$/
const MAX_OUTPUT = 3_000_000

export async function git(binary, root, args, { input, indexFile } = {}) {
  const child = spawn(binary, args, { cwd: root, windowsHide: true,
    env: { ...process.env, ...(indexFile ? { GIT_INDEX_FILE: indexFile } : {}) },
    stdio: ['pipe', 'pipe', 'pipe'] })
  const stdout = [], stderr = []
  let outSize = 0, errSize = 0
  child.stdout.on('data', (chunk) => { outSize += chunk.length; if (outSize <= MAX_OUTPUT) stdout.push(chunk); else child.kill() })
  child.stderr.on('data', (chunk) => { errSize += chunk.length; if (errSize <= 100_000) stderr.push(chunk); else child.kill() })
  child.stdin.on('error', () => {})
  child.stdin.end(input)
  const code = await new Promise((done, fail) => {
    child.on('error', fail); child.on('close', done)
  })
  if (code !== 0 || outSize > MAX_OUTPUT || errSize > 100_000) {
    throw new Error('PUBLIC_GIT_COMMAND_FAILED')
  }
  return Buffer.concat(stdout)
}

/** Commit already validated files to an existing, detached local proposal ref. */
export async function commitLocalProposalFiles({ repoRoot, ref, baseCommit, files, subject,
  allowVisualDeletes = false,
  gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git' }) {
  demand(repoRoot && sha(baseCommit) && refPattern.test(ref)
    && files instanceof Map && files.size > 0
    && files.size <= (allowVisualDeletes ? 504 : 3)
    && [...files].every(([path, bytes]) => /^[A-Za-z0-9_./-]+$/.test(path)
      && !path.split('/').includes('..')
      && (Buffer.isBuffer(bytes)
        ? bytes.length > 0 && bytes.length <= 2_500_000
        : allowVisualDeletes && bytes === null
          && /^archive\/web\/public\/visual-assets\/[a-f0-9]{64}\.png$/.test(path)))
    && typeof subject === 'string' && /^[A-Za-z0-9 _.-]{1,100}$/.test(subject),
  'INVALID_LOCAL_PROPOSAL')
  const root = resolve(repoRoot)
  const actualRoot = (await git(gitBinary, root, ['rev-parse', '--show-toplevel'])).toString().trim()
  demand(resolve(actualRoot) === root, 'PUBLIC_GIT_ROOT_MISMATCH')
  const currentBranch = (await git(gitBinary, root, ['rev-parse', '--symbolic-full-name', 'HEAD'])).toString().trim()
  demand(currentBranch !== ref, 'CHECKED_OUT_PUBLICATION_REF_FORBIDDEN')
  const current = (await git(gitBinary, root, ['rev-parse', '--verify', ref])).toString().trim()
  demand(current === baseCommit, 'PUBLIC_BASE_MOVED')
  demand((await git(gitBinary, root, ['cat-file', '-t', current])).toString().trim() === 'commit',
    'PUBLIC_BASE_NOT_COMMIT')
  const directory = await mkdtemp(join(tmpdir(), 'archive-public-index-'))
  try {
    const indexFile = join(directory, 'index')
    await git(gitBinary, root, ['read-tree', current], { indexFile })
    for (const [path, bytes] of files) {
      if (bytes === null) {
        await git(gitBinary, root, ['update-index', '--force-remove', '--', path], { indexFile })
        continue
      }
      const blob = (await git(gitBinary, root, ['hash-object', '-w', '--stdin'],
        { input: bytes })).toString().trim()
      demand(sha(blob), 'PUBLIC_BLOB_HASH_FAILED')
      await git(gitBinary, root, ['update-index', '--add', '--cacheinfo',
        `100644,${blob},${path}`], { indexFile })
    }
    const tree = (await git(gitBinary, root, ['write-tree'], { indexFile })).toString().trim()
    demand(sha(tree), 'PUBLIC_TREE_HASH_FAILED')
    const newCommit = (await git(gitBinary, root, ['-c', 'user.name=Archive Proposal',
      '-c', 'user.email=archive-proposal@users.noreply.github.com',
      'commit-tree', tree, '-p', current, '-m', subject])).toString().trim()
    demand(sha(newCommit), 'PUBLIC_COMMIT_HASH_FAILED')
    await git(gitBinary, root, ['update-ref', ref, newCommit, current])
    return newCommit
  } finally {
    const target = resolve(directory), temp = resolve(tmpdir()) + sep
    demand(target.startsWith(temp), 'UNSAFE_TEMP_INDEX_PATH')
    await rm(target, { recursive: true, force: true })
  }
}

/** All files are rechecked against the pinned base before any Git object is written. */
export async function commitPublicSegmentBundle(bundle, {
  repoRoot, ref, gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git',
  authorizeCommit,
} = {}) {
  demand(repoRoot && sha(bundle?.baseCommit) && bundle.files instanceof Map
    && bundle.files.size === 3 && refPattern.test(ref)
    && typeof authorizeCommit === 'function', 'PUBLIC_GIT_COMMIT_DISABLED')
  const root = resolve(repoRoot)
  const actualRoot = (await git(gitBinary, root, ['rev-parse', '--show-toplevel'])).toString().trim()
  demand(resolve(actualRoot) === root, 'PUBLIC_GIT_ROOT_MISMATCH')
  const currentBranch = (await git(gitBinary, root, ['rev-parse', '--symbolic-full-name', 'HEAD'])).toString().trim()
  demand(currentBranch !== ref, 'CHECKED_OUT_PUBLICATION_REF_FORBIDDEN')
  const current = (await git(gitBinary, root, ['rev-parse', '--verify', ref])).toString().trim()
  demand(current === bundle.baseCommit, 'PUBLIC_BASE_MOVED')
  demand((await git(gitBinary, root, ['cat-file', '-t', current])).toString().trim() === 'commit',
    'PUBLIC_BASE_NOT_COMMIT')
  const seasonPaths = [...bundle.files.keys()].filter((path) =>
    /^archive\/content\/transcripts\/C03-AFTERFALL\/S\d{2,3}\/MANIFEST\.json$/.test(path))
  demand(seasonPaths.length === 1, 'INVALID_PUBLIC_FILE_SET')
  const seasonPath = seasonPaths[0], prefix = seasonPath.slice(0, -'/MANIFEST.json'.length)
  const season = JSON.parse(bundle.files.get(seasonPath).toString('utf8'))
  const last = season.sessions?.at(-1)
  demand(season.season_id === prefix.split('/').at(-1)
    && Array.isArray(season.sessions) && season.sessions.length <= 999
    && last && /^SESSION_\d{3}$/.test(last.session_id), 'INVALID_PUBLIC_FILE_SET')
  const sessionPrefix = `${prefix}/${last.session_id}`
  const sourcePath = `${sessionPrefix}/SOURCE_MANIFEST.json`
  const partPath = `${sessionPrefix}/PART_001.md`
  demand(bundle.files.has(sourcePath) && bundle.files.has(partPath)
    && [...bundle.files.values()].every((bytes) => Buffer.isBuffer(bytes)
      && bytes.length > 0 && bytes.length <= 2_500_000), 'INVALID_PUBLIC_FILE_SET')
  const baseTree = async (path) => (await git(gitBinary, root,
    ['ls-tree', '-r', '--name-only', current, '--', path])).toString('utf8').trim()
  demand(!(await baseTree(sessionPrefix)), 'PUBLIC_SESSION_PATH_COLLISION')
  const hadManifest = Boolean(await baseTree(seasonPath))
  if (hadManifest) {
    const previous = JSON.parse((await git(gitBinary, root,
      ['show', `${current}:${seasonPath}`])).toString('utf8'))
    demand(isDeepStrictEqual({ ...season, sessions: season.sessions.slice(0, -1) }, previous),
      'PUBLIC_SEASON_CHANGED')
  } else {
    demand(season.sessions.length === 1, 'PUBLIC_SEASON_INITIALIZATION_INVALID')
  }
  const read = async (path) => bundle.files.get(path)
    ?? git(gitBinary, root, ['show', `${current}:${path}`])
  const listParts = async (path) => path === sessionPrefix ? ['PART_001.md']
    : (await baseTree(path)).split('\n').filter(Boolean).map((p) => p.slice(path.length + 1))
      .filter((name) => /^PART_\d{3}\.md$/.test(name))
  const selected = await approvedSeasonCatalog(season, season.season_id, { read, listParts })
  demand(selected.some((item) => item.archivePath === partPath
    && item.autoPublication.sessionId === last.session_id
    && item.autoPublication.segmentId === last.segment_id),
    'PUBLIC_READER_PREFLIGHT_FAILED')
  demand(await authorizeCommit({ baseCommit: current, ref, seasonId: season.season_id,
    sessionId: last.session_id, segmentId: last.segment_id }) === true,
  'PUBLIC_GIT_COMMIT_NOT_AUTHORIZED')
  const newCommit = await commitLocalProposalFiles({ repoRoot: root, ref,
    baseCommit: current, files: bundle.files,
    subject: `Propose public archive ${season.season_id} ${last.session_id}`, gitBinary })
  return { status: 'LOCAL_PROPOSAL_COMMITTED', ref, base_commit: current,
    commit: newCommit, session_id: last.session_id,
    files_in_commit: 3, checkout_files_written: 0,
    remote_pushes: 0, site_publications: 0 }
}
