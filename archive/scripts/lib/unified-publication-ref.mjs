/** One atomic local proposal for a Reader, Graph and Visual edition.
 * This never pushes a branch or deploys a site.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { prepareUnifiedPublication } from '../prepare-unified-publication.mjs'
import { commitLocalProposalFiles, git } from './atomic-public-segment-git.mjs'
import { reconcileSiteAssets, validateSiteAssetInventory } from './site-asset-contract.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const rootOfModule = resolve(import.meta.dirname, '../../..')
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const refPattern = /^refs\/heads\/codex\/archive-publication-[a-z0-9-]{1,50}$/
const bookPath = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
const graphPath = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const visualPath = 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'
const sitePath = 'archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json'
const sitePrefix = 'archive/web/public'

async function reconcilePinnedSite(root, baseCommit, nextCatalog, gitBinary) {
  const read = (path) => git(gitBinary, root, ['show', `${baseCommit}:${path}`])
  const [priorVisualBytes, manifestBytes] = await Promise.all([
    read(visualPath), read(sitePath),
  ])
  const priorVisual = JSON.parse(priorVisualBytes.toString('utf8'))
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  const tree = (await git(gitBinary, root, ['ls-tree', '-r', baseCommit,
    '--', `${sitePrefix}/visual-assets`])).toString('utf8').trim()
  const actualPaths = tree ? tree.split('\n').map((line) => {
    const match = /^100644 blob [a-f0-9]{40}\t(.+)$/.exec(line)
    demand(match, 'UNIFIED_SITE_FILE_MODE_INVALID')
    return match[1]
  }).sort() : []
  const listedPaths = manifest.assets.map((asset) => {
    demand(/^\/visual-assets\/[a-f0-9]{64}\.png$/.test(asset.public_path),
      'UNIFIED_SITE_PRIOR_PATH_INVALID')
    return `${sitePrefix}${asset.public_path}`
  }).sort()
  demand(JSON.stringify(actualPaths) === JSON.stringify(listedPaths),
    'UNIFIED_SITE_UNLISTED_IMAGE')
  const temp = await mkdtemp(join(tmpdir(), 'archive-unified-site-'))
  try {
    const publicRoot = join(temp, 'public')
    await mkdir(join(publicRoot, 'visual-assets'), { recursive: true })
    for (const asset of manifest.assets) {
      const bytes = await read(`${sitePrefix}${asset.public_path}`)
      await writeFile(join(publicRoot, asset.public_path.slice(1)), bytes,
        { flag: 'wx' })
    }
    await validateSiteAssetInventory(manifest, priorVisual, publicRoot)
    return reconcileSiteAssets(manifest, priorVisual, nextCatalog, publicRoot)
  } finally {
    const target = resolve(temp)
    demand(target.startsWith(resolve(tmpdir()) + sep), 'UNSAFE_UNIFIED_SITE_TEMP_PATH')
    await rm(target, { recursive: true, force: true })
  }
}

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
  const site = await reconcilePinnedSite(root, baseCommit,
    prepared.visual.catalog, gitBinary)
  const files = new Map([
    [bookPath, prepared.reader.candidateBytes],
    [graphPath, prepared.graph.candidateBytes],
    [visualPath, prepared.visual.candidateBytes],
  ])
  demand(site.manifest.visual_catalog_sha256 === prepared.visual.catalog.content_sha256,
    'UNIFIED_SITE_CATALOG_MISMATCH')
  const priorSite = JSON.parse((await git(gitBinary, root,
    ['show', `${baseCommit}:${sitePath}`])).toString('utf8'))
  if (site.manifest.content_sha256 !== priorSite.content_sha256) {
    files.set(sitePath, Buffer.from(JSON.stringify(site.manifest, null, 2) + '\n'))
  }
  for (const publicPath of site.omitted_public_paths) {
    files.set(`${sitePrefix}${publicPath}`, null)
  }
  const current = (await git(gitBinary, root, ['rev-parse', '--verify', ref])).toString().trim()
  const matches = async (commit) => {
    for (const [path, bytes] of files) {
      const entry = (await git(gitBinary, root,
        ['ls-tree', commit, '--', path])).toString('utf8').trim()
      if (bytes === null) {
        if (entry) return false
        continue
      }
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
      site_manifest_sha256: site.manifest.content_sha256,
      stale_site_assets_removed: site.omitted_public_paths.length,
      checkout_files_written: 0, remote_pushes: 0, site_publications: 0 }
  }
  if (await matches(baseCommit)) return {
    status: 'UNIFIED_EDITION_ALREADY_CURRENT', ref, base_commit: baseCommit,
    commit: baseCommit, ...prepared.report,
    site_manifest_sha256: site.manifest.content_sha256,
    stale_site_assets_removed: 0,
    checkout_files_written: 0, remote_pushes: 0, site_publications: 0 }
  demand(await authorizeCommit({ ref, baseCommit,
    batchId: prepared.report.batch_id,
    readerSha256: prepared.report.reader_sha256,
    graphSha256: prepared.report.graph_sha256,
    visualSha256: prepared.report.visual_sha256,
    siteManifestSha256: site.manifest.content_sha256,
    staleSiteAssetsRemoved: site.omitted_public_paths.length }) === true,
  'UNIFIED_REF_COMMIT_NOT_AUTHORIZED')
  const commit = await commitLocalProposalFiles({ repoRoot: root, ref,
    baseCommit, files, subject: 'Propose unified public archive edition',
    allowVisualDeletes: true, gitBinary })
  return { status: 'LOCAL_UNIFIED_PROPOSAL_COMMITTED', ref,
    base_commit: baseCommit, commit, ...prepared.report,
    site_manifest_sha256: site.manifest.content_sha256,
    stale_site_assets_removed: site.omitted_public_paths.length,
    files_in_commit: files.size, checkout_files_written: 0,
    remote_pushes: 0, site_publications: 0 }
}
