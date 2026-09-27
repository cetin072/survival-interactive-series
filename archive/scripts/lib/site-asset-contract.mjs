/** Build-time contract for reviewed, optimized, same-origin archive images. */
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { inspectPng } from './image-poc-exchange.mjs'
import { validateVisualCatalog, visualDigest } from './visual-compiler.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const exact = (v, allowed) => demand(object(v) && Object.keys(v).length === allowed.length
  && Object.keys(v).every((key) => allowed.includes(key)), 'INVALID_SITE_ASSET_FIELDS')
const hex = (v, prefix = '') => typeof v === 'string' && new RegExp(`^${prefix}[a-f0-9]{64}$`).test(v)

export async function validateSiteAssets(manifest, catalog, publicRoot) {
  validateVisualCatalog(catalog)
  exact(manifest, ['version', 'chronicle_id', 'worldline_id', 'visibility', 'visual_catalog_sha256', 'assets', 'content_sha256'])
  const { content_sha256, ...body } = manifest
  demand(manifest.version === 'archive-site-assets-v1' && manifest.chronicle_id === catalog.chronicle_id
    && manifest.worldline_id === catalog.worldline_id && manifest.visibility === 'PUBLIC_ARCHIVE'
    && manifest.visual_catalog_sha256 === catalog.content_sha256
    && content_sha256 === visualDigest(body), 'SITE_ASSET_MANIFEST_MISMATCH')
  demand(Array.isArray(manifest.assets) && manifest.assets.length <= 500, 'INVALID_SITE_ASSET_COUNT')
  const points = new Map(catalog.points.map((point) => [point.point_id, point]))
  const seen = new Set()
  for (const asset of manifest.assets) {
    exact(asset, ['point_id', 'generation_key', 'subject_id', 'accepted_candidate_id', 'source_sha256',
      'storage_bucket', 'storage_object_path', 'registry_asset_id', 'derivative_version',
      'public_path', 'sha256', 'bytes', 'width', 'height', 'mime_type'])
    const point = points.get(asset.point_id)
    demand(point?.status === 'READY' && point.point_type !== 'MAP' && point.generation_key === asset.generation_key
      && point.subject_id === asset.subject_id && !seen.has(asset.point_id), 'SITE_ASSET_POINT_MISMATCH')
    seen.add(asset.point_id)
    demand(hex(asset.accepted_candidate_id, 'candidate-') && hex(asset.source_sha256)
      && asset.storage_bucket === 'survival-archive-originals'
      && asset.storage_object_path === `AFTERFALL/${asset.accepted_candidate_id}/${asset.source_sha256}.png`
      && typeof asset.registry_asset_id === 'string' && /^AF-[A-Z0-9-]{4,80}$/.test(asset.registry_asset_id)
      && asset.derivative_version === 'site-png-512-v1'
      && hex(asset.sha256) && asset.public_path === `/visual-assets/${asset.sha256}.png`
      && asset.mime_type === 'image/png' && Number.isSafeInteger(asset.bytes) && asset.bytes > 0
      && asset.bytes <= 200_000 && Number.isSafeInteger(asset.width) && asset.width > 0
      && Number.isSafeInteger(asset.height) && asset.height > 0, 'SITE_ASSET_METADATA_INVALID')
    demand((await lstat(resolve(publicRoot))).isDirectory()
      && (await lstat(join(resolve(publicRoot), 'visual-assets'))).isDirectory(), 'SITE_ASSET_PARENT_INVALID')
    const path = join(resolve(publicRoot), 'visual-assets', `${asset.sha256}.png`)
    demand((await lstat(path)).isFile(), 'SITE_ASSET_NOT_REGULAR_FILE')
    const bytes = await readFile(path)
    demand(bytes.length <= 200_000 && bytes.length === asset.bytes
      && createHash('sha256').update(bytes).digest('hex') === asset.sha256, 'SITE_ASSET_BYTES_MISMATCH')
    const png = inspectPng(bytes)
    demand(png.width === asset.width && png.height === asset.height, 'SITE_ASSET_DIMENSIONS_MISMATCH')
  }
  return { manifest_sha256: content_sha256, site_assets: manifest.assets.length, provider_calls: 0,
    storage_uploads: 0, site_publications: 0 }
}

/** Build gate: an omitted image must not remain reachable as an unlisted static file. */
export async function validateSiteAssetInventory(manifest, catalog, publicRoot) {
  const verified = await validateSiteAssets(manifest, catalog, publicRoot)
  const expected = new Set(manifest.assets.map((asset) => `${asset.sha256}.png`))
  const root = resolve(publicRoot), directory = join(root, 'visual-assets')
  let entries
  try {
    demand((await lstat(root)).isDirectory(), 'SITE_PUBLIC_ROOT_INVALID')
    demand((await lstat(directory)).isDirectory(), 'SITE_VISUAL_DIRECTORY_INVALID')
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT' && expected.size === 0) return { ...verified, unreferenced_files: 0 }
    throw error
  }
  demand(entries.length === expected.size && entries.every((entry) => entry.isFile() && expected.has(entry.name)),
    'UNREFERENCED_PUBLIC_VISUAL_ASSET')
  return { ...verified, unreferenced_files: 0 }
}

/** Prepare one already verified original-derived asset for an existing site manifest. */
export async function planSiteAssetAddition(manifest, catalog, publicRoot, prepared) {
  await validateSiteAssetInventory(manifest, catalog, publicRoot)
  demand(prepared?.status === 'SITE_ASSET_PREPARED_NOT_PUBLISHED'
    && prepared.asset && prepared.storage_readback_sha256 === prepared.asset.source_sha256
    && prepared.derivative_sha256 === prepared.asset.sha256,
  'SITE_ASSET_PREPARATION_REQUIRED')
  const prior = manifest.assets.find((asset) => asset.point_id === prepared.asset.point_id)
  if (prior) {
    demand(visualDigest(prior) === visualDigest(prepared.asset), 'SITE_ASSET_ALREADY_BOUND_DIFFERENTLY')
    return { status: 'EXISTING_SITE_ASSET_REUSED', manifest, files_written: 0,
      site_publications: 0 }
  }
  const body = { version: manifest.version, chronicle_id: manifest.chronicle_id,
    worldline_id: manifest.worldline_id, visibility: manifest.visibility,
    visual_catalog_sha256: manifest.visual_catalog_sha256,
    assets: [...manifest.assets, prepared.asset] }
  demand(body.assets.length <= 500, 'INVALID_SITE_ASSET_COUNT')
  return { status: 'SITE_ASSET_ADDITION_PREPARED', manifest: {
    ...body, content_sha256: visualDigest(body) }, files_written: 0,
    site_publications: 0 }
}

/** Rebind an already verified site manifest to a newer public catalog in memory only. */
export async function reconcileSiteAssets(previousManifest, previousCatalog, nextCatalog, publicRoot) {
  await validateSiteAssets(previousManifest, previousCatalog, publicRoot)
  validateVisualCatalog(nextCatalog)
  demand(nextCatalog.chronicle_id === previousCatalog.chronicle_id
    && nextCatalog.worldline_id === previousCatalog.worldline_id
    && nextCatalog.visibility === previousCatalog.visibility
    && nextCatalog.anchor.save_version >= previousCatalog.anchor.save_version
    && nextCatalog.anchor.game_time >= previousCatalog.anchor.game_time,
  'SITE_ASSET_CATALOG_REGRESSION')
  const current = new Map(nextCatalog.points.filter((point) => point.status === 'READY')
    .map((point) => [point.point_id, point]))
  const assets = previousManifest.assets.filter((asset) => {
    const point = current.get(asset.point_id)
    return point?.generation_key === asset.generation_key && point.subject_id === asset.subject_id
  })
  const retainedPaths = new Set(assets.map((asset) => asset.public_path))
  const omittedPublicPaths = previousManifest.assets.filter((asset) => !retainedPaths.has(asset.public_path))
    .map((asset) => asset.public_path)
  const body = { version: 'archive-site-assets-v1', chronicle_id: nextCatalog.chronicle_id,
    worldline_id: nextCatalog.worldline_id, visibility: 'PUBLIC_ARCHIVE',
    visual_catalog_sha256: nextCatalog.content_sha256, assets }
  const manifest = { ...body, content_sha256: visualDigest(body) }
  await validateSiteAssets(manifest, nextCatalog, publicRoot)
  return { status: 'LOCAL_SITE_ASSET_RECONCILIATION_ONLY', manifest,
    retained: assets.length, omitted_stale: previousManifest.assets.length - assets.length,
    omitted_public_paths: omittedPublicPaths,
    release_blocked_until_stale_files_removed: omittedPublicPaths.length > 0,
    files_written: 0, storage_uploads: 0, site_publications: 0 }
}
