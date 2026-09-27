/** Plan a private registry entry only after the accepted original is read back. */
import { pocDigest } from './image-poc-exchange.mjs'
import { acceptForegroundLocalCandidate, planForegroundLocalIngest } from './foreground-image-handoff.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }

export function planArchiveVisualRegistry({ catalog, observation, approval, originalBytes,
  candidate, storageResult, existingRows = [] }) {
  const point = catalog?.points?.find((entry) => entry.point_id === observation?.point_id)
  const expected = acceptForegroundLocalCandidate(point, observation, originalBytes, approval)
  demand(pocDigest(candidate) === pocDigest(expected), 'REGISTRY_CANDIDATE_MISMATCH')
  planForegroundLocalIngest(candidate, catalog, observation, originalBytes)
  const objectPath = `AFTERFALL/${candidate.candidate_id}/${expected.file.sha256}.png`
  demand(storageResult?.storage_verified === true
    && ['UPLOADED', 'EXISTING_OBJECT_REUSED', 'UPLOAD_RESPONSE_LOST_OBJECT_VERIFIED'].includes(storageResult.status)
    && storageResult.bucket === 'survival-archive-originals'
    && storageResult.object_path === objectPath
    && storageResult.sha256 === expected.file.sha256, 'REGISTRY_STORAGE_NOT_VERIFIED')
  demand(Array.isArray(existingRows), 'REGISTRY_EXISTING_ROWS_REQUIRED')
  const row = { worldline_id: 'AFTERFALL',
    asset_id: `AF-CHAR-${candidate.candidate_id.slice(10, 34).toUpperCase()}`,
    asset_type: 'CHARACTER', status: 'GENERATED', visibility: 'CORE_PRIVATE',
    title: point.title, style_version: catalog.style_version,
    source: { kind: 'CODEX_FOREGROUND_LOCAL', point_id: point.point_id,
      generation_key: point.generation_key, subject_id: point.subject_id,
      candidate_id: candidate.candidate_id, source_sha256: expected.file.sha256 },
    brief: structuredClone(point.brief), prompt_snapshot: null,
    provider: 'image_gen.imagegen', provider_model: null, provider_asset_id: null,
    object_path: `${storageResult.bucket}/${objectPath}`, image_url: null,
    generation_meta: { source_sha256: expected.file.sha256,
      approval_source_ref: approval.source_ref, storage_verified: true,
      provider_result_id: null, unattended_generation_proven: false } }
  const conflict = existingRows.find((item) => item.worldline_id === row.worldline_id
    && (item.asset_id === row.asset_id || item.source?.candidate_id === candidate.candidate_id))
  if (conflict) {
    const existingBody = Object.fromEntries(Object.keys(row).map((key) => [key, conflict[key]]))
    demand(pocDigest(existingBody) === pocDigest(row), 'REGISTRY_EXISTING_ASSET_CONFLICT')
    return { status: 'EXISTING_PRIVATE_ASSET_REUSED', row, database_writes: 0,
      public_assets: 0, site_publications: 0 }
  }
  return { status: 'PRIVATE_REGISTRY_INSERT_REQUIRED', row, database_writes: 0,
    public_assets: 0, site_publications: 0 }
}

/** Insert only the private plan. A lost response is reconciled from DB before retrying. */
export async function insertPrivateVisualRegistry({ baseUrl, serviceKey, fetchImpl = fetch, ...input }) {
  demand(typeof baseUrl === 'string' && /^https:\/\/[a-z0-9.-]+$/.test(baseUrl)
    && typeof serviceKey === 'string' && serviceKey.length > 20, 'REGISTRY_CREDENTIALS_REQUIRED')
  const url = `${baseUrl}/rest/v1/visual_assets`
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
    'Accept-Profile': 'survival_rpg' }
  const readRows = async () => {
    const response = await fetchImpl(`${url}?select=*&worldline_id=eq.AFTERFALL&limit=1000`,
      { method: 'GET', headers, cache: 'no-store' })
    demand(response.ok, 'REGISTRY_READ_FAILED')
    const rows = await response.json()
    demand(Array.isArray(rows) && rows.length < 1000, 'REGISTRY_SCAN_INCOMPLETE')
    return rows
  }
  const before = planArchiveVisualRegistry({ ...input, existingRows: await readRows() })
  if (before.status === 'EXISTING_PRIVATE_ASSET_REUSED')
    return { status: before.status, asset_id: before.row.asset_id,
      database_writes: 0, site_publications: 0 }
  let response
  try {
    response = await fetchImpl(url, { method: 'POST', headers: { ...headers,
      'Content-Profile': 'survival_rpg', 'Content-Type': 'application/json',
      Prefer: 'return=minimal' }, body: JSON.stringify(before.row) })
  } catch {
    const after = planArchiveVisualRegistry({ ...input, existingRows: await readRows() })
    if (after.status === 'EXISTING_PRIVATE_ASSET_REUSED')
      return { status: 'INSERT_RESPONSE_LOST_ROW_VERIFIED', asset_id: after.row.asset_id,
        database_writes: 1, site_publications: 0 }
    return { status: 'INSERT_OUTCOME_UNKNOWN_RECONCILE_LATER', asset_id: before.row.asset_id,
      database_writes: 0, site_publications: 0 }
  }
  if (!response.ok) {
    if (response.status === 409 || response.status >= 500) {
      const after = planArchiveVisualRegistry({ ...input, existingRows: await readRows() })
      if (after.status === 'EXISTING_PRIVATE_ASSET_REUSED')
        return { status: 'EXISTING_PRIVATE_ASSET_REUSED', asset_id: after.row.asset_id,
          database_writes: 0, site_publications: 0 }
      if (response.status >= 500) return { status: 'INSERT_OUTCOME_UNKNOWN_RECONCILE_LATER',
        asset_id: before.row.asset_id, database_writes: 0, site_publications: 0 }
    }
    throw new Error('REGISTRY_INSERT_FAILED')
  }
  const after = planArchiveVisualRegistry({ ...input, existingRows: await readRows() })
  demand(after.status === 'EXISTING_PRIVATE_ASSET_REUSED', 'REGISTRY_INSERT_NOT_READABLE')
  return { status: 'PRIVATE_ASSET_INSERTED', asset_id: after.row.asset_id,
    database_writes: 1, site_publications: 0 }
}
