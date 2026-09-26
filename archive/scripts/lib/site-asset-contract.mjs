/** Build-time contract for reviewed, optimized, same-origin archive images. */
import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
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
      'public_path', 'sha256', 'bytes', 'width', 'height', 'mime_type'])
    const point = points.get(asset.point_id)
    demand(point?.status === 'READY' && point.point_type !== 'MAP' && point.generation_key === asset.generation_key
      && point.subject_id === asset.subject_id && !seen.has(asset.point_id), 'SITE_ASSET_POINT_MISMATCH')
    seen.add(asset.point_id)
    demand(hex(asset.accepted_candidate_id, 'candidate-') && hex(asset.source_sha256)
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
