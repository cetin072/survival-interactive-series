/** Commit a verified site image and its manifest in one local proposal-ref update.
 * The caller authenticates image review and registry evidence before invoking this.
 */
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { validateVisualCatalog } from './visual-compiler.mjs'
import { inspectPng } from './image-poc-exchange.mjs'
import { planSiteAssetAddition, validateSiteAssetInventory } from './site-asset-contract.mjs'
import { commitLocalProposalFiles, git } from './atomic-public-segment-git.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const catalogPath = 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'
const manifestPath = 'archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json'
const publicPrefix = 'archive/web/public'
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const refName = /^refs\/heads\/codex\/archive-publication-[a-z0-9-]{1,50}$/
const pathName = /^\/visual-assets\/[a-f0-9]{64}\.png$/
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

export async function commitSiteAssetFromPublicRef({ repoRoot, ref, baseCommit, prepared,
  derivativeBytes, authorizeCommit,
  gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git' } = {}) {
  demand(repoRoot && refName.test(ref) && sha(baseCommit)
    && prepared?.status === 'SITE_ASSET_PREPARED_NOT_PUBLISHED'
    && Buffer.isBuffer(derivativeBytes) && typeof authorizeCommit === 'function',
  'SITE_REF_COMMIT_DISABLED')
  const root = resolve(repoRoot)
  const current = (await git(gitBinary, root, ['rev-parse', '--verify', ref])).toString().trim()
  demand(current === baseCommit, 'SITE_REF_BASE_MOVED')
  const read = (path) => git(gitBinary, root, ['show', `${baseCommit}:${path}`])
  const [catalogBytes, manifestBytes] = await Promise.all([
    read(catalogPath), read(manifestPath),
  ])
  const catalog = JSON.parse(catalogBytes.toString('utf8'))
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  validateVisualCatalog(catalog)
  const file = inspectPng(derivativeBytes)
  demand(pathName.test(prepared.asset.public_path)
    && prepared.asset.public_path === `/visual-assets/${file.sha256}.png`
    && prepared.asset.sha256 === hash(derivativeBytes)
    && prepared.asset.bytes === derivativeBytes.length
    && prepared.asset.width === file.width && prepared.asset.height === file.height,
  'SITE_REF_DERIVATIVE_MISMATCH')
  const temp = await mkdtemp(join(tmpdir(), 'archive-site-ref-'))
  try {
    const publicRoot = join(temp, 'public')
    await mkdir(join(publicRoot, 'visual-assets'), { recursive: true })
    for (const asset of manifest.assets ?? []) {
      demand(pathName.test(asset.public_path), 'SITE_REF_PRIOR_PATH_INVALID')
      const bytes = await read(`${publicPrefix}${asset.public_path}`)
      await writeFile(join(publicRoot, asset.public_path.slice(1)), bytes, { flag: 'wx' })
    }
    const plan = await planSiteAssetAddition(manifest, catalog, publicRoot, prepared)
    if (plan.status === 'EXISTING_SITE_ASSET_REUSED') return {
      status: 'EXISTING_SITE_ASSET_REUSED', ref, base_commit: baseCommit,
      commit: baseCommit, manifest_sha256: plan.manifest.content_sha256,
      checkout_files_written: 0, remote_pushes: 0, site_publications: 0 }
    demand(plan.status === 'SITE_ASSET_ADDITION_PREPARED', 'SITE_REF_PLAN_INVALID')
    await writeFile(join(publicRoot, prepared.asset.public_path.slice(1)),
      derivativeBytes, { flag: 'wx' })
    await validateSiteAssetInventory(plan.manifest, catalog, publicRoot)
    demand(await authorizeCommit({ ref, baseCommit, pointId: prepared.asset.point_id,
      generationKey: prepared.asset.generation_key,
      originalSha256: prepared.asset.source_sha256,
      derivativeSha256: prepared.asset.sha256,
      manifestSha256: plan.manifest.content_sha256 }) === true,
    'SITE_REF_COMMIT_NOT_AUTHORIZED')
    const files = new Map([
      [manifestPath, Buffer.from(JSON.stringify(plan.manifest, null, 2) + '\n')],
      [`${publicPrefix}${prepared.asset.public_path}`, derivativeBytes],
    ])
    const commit = await commitLocalProposalFiles({ repoRoot: root, ref, baseCommit,
      files, subject: 'Propose reviewed archive site image', gitBinary })
    return { status: 'LOCAL_SITE_ASSET_PROPOSAL_COMMITTED', ref,
      base_commit: baseCommit, commit,
      point_id: prepared.asset.point_id,
      manifest_sha256: plan.manifest.content_sha256,
      files_in_commit: 2, checkout_files_written: 0,
      remote_pushes: 0, site_publications: 0 }
  } finally {
    const target = resolve(temp)
    demand(target.startsWith(resolve(tmpdir()) + sep), 'UNSAFE_SITE_TEMP_PATH')
    await rm(target, { recursive: true, force: true })
  }
}
