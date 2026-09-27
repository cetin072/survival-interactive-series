/** Pure publication gate. Callers supply real Storage readback and a pinned image transformer. */
import { inspectPng, pocDigest } from './image-poc-exchange.mjs'
import { acceptForegroundLocalCandidate, planForegroundLocalIngest } from './foreground-image-handoff.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const BUCKET = 'survival-archive-originals'
const DERIVATIVE_VERSION = 'site-png-512-v1'

export async function prepareForegroundSiteAsset({ catalog, observation, approval, originalBytes,
  candidate, derivativeBytes, deriveFromOriginal, downloadOriginal, registry }) {
  const point = catalog?.points?.find((entry) => entry.point_id === observation?.point_id)
  const expected = acceptForegroundLocalCandidate(point, observation, originalBytes, approval)
  demand(pocDigest(candidate) === pocDigest(expected), 'SITE_CANDIDATE_MISMATCH')
  planForegroundLocalIngest(candidate, catalog, observation, originalBytes)
  demand(typeof deriveFromOriginal === 'function' && typeof downloadOriginal === 'function',
    'SITE_VERIFIERS_REQUIRED')
  const sourceHash = expected.file.sha256
  const objectPath = `AFTERFALL/${expected.candidate_id}/${sourceHash}.png`
  const readback = await downloadOriginal(BUCKET, objectPath)
  demand(Buffer.isBuffer(readback) && readback.equals(originalBytes), 'SITE_STORAGE_READBACK_MISMATCH')
  const recreatedDerivative = await deriveFromOriginal(readback, DERIVATIVE_VERSION)
  demand(Buffer.isBuffer(recreatedDerivative) && Buffer.isBuffer(derivativeBytes)
    && recreatedDerivative.equals(derivativeBytes), 'SITE_DERIVATIVE_NOT_FROM_ORIGINAL')
  const derivative = inspectPng(derivativeBytes)
  demand(derivative.bytes <= 200_000 && derivative.width <= 512 && derivative.height <= 512,
    'SITE_DERIVATIVE_LIMIT')
  demand(registry?.worldline_id === 'AFTERFALL' && registry.asset_type === point.asset_type
    && registry.status === 'READY' && registry.visibility === 'PLAYER_ARCHIVE'
    && /^AF-CHAR-[A-Z0-9-]{4,80}$/.test(registry.asset_id)
    && registry.object_path === `${BUCKET}/${objectPath}`
    && registry.source?.point_id === point.point_id
    && registry.source?.generation_key === point.generation_key
    && registry.source?.subject_id === point.subject_id
    && registry.source?.candidate_id === expected.candidate_id
    && registry.source?.source_sha256 === sourceHash
    && registry.generation_meta?.source_sha256 === sourceHash,
  'SITE_REGISTRY_BINDING_MISMATCH')
  const asset = { point_id: point.point_id, generation_key: point.generation_key,
    subject_id: point.subject_id, accepted_candidate_id: expected.candidate_id,
    source_sha256: sourceHash, storage_bucket: BUCKET, storage_object_path: objectPath,
    registry_asset_id: registry.asset_id, derivative_version: DERIVATIVE_VERSION,
    public_path: `/visual-assets/${derivative.sha256}.png`, sha256: derivative.sha256,
    bytes: derivative.bytes, width: derivative.width, height: derivative.height,
    mime_type: derivative.mime_type }
  return { status: 'SITE_ASSET_PREPARED_NOT_PUBLISHED', asset,
    storage_readback_sha256: sourceHash, derivative_sha256: derivative.sha256,
    storage_writes: 0, database_writes: 0, site_publications: 0 }
}
