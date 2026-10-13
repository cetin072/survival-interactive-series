import generatedManifest from '../../../content/visuals/C03-AFTERFALL/SITE_ASSETS.json'
import manualManifest from '../../../content/visuals/C03-AFTERFALL/MANUAL_SITE_ASSETS.json'
import legacyAspectManifest from '../../../content/visuals/C03-AFTERFALL/LEGACY_SITE_ASPECTS.json'

export type SiteAsset = {
  subject_id: string
  point_id: string
  generation_key: string
  public_path: string
  width: number
  height: number
  caption?: string
  source_kind?: string
  canon_status?: string
  source_sha256?: string
  derivative_version?: string
}


type LegacyAspectEntry = {
  subject_id: string
  site_source_sha256: string
  original_width: number
  original_height: number
}

export type SiteVisualDisplaySize = {
  width: number
  height: number
  corrected: boolean
}

const legacyAspectBySubject = new Map(
  (legacyAspectManifest.entries as LegacyAspectEntry[]).map((entry) => [entry.subject_id, entry]),
)

export function siteVisualDisplaySize(asset: SiteAsset): SiteVisualDisplaySize {
  const entry = legacyAspectBySubject.get(asset.subject_id)
  if (!entry
      || asset.derivative_version !== 'site-png-512-v1'
      || asset.source_sha256 !== entry.site_source_sha256
      || !Number.isInteger(entry.original_width)
      || !Number.isInteger(entry.original_height)
      || entry.original_width <= 0
      || entry.original_height <= 0) {
    return { width: asset.width, height: asset.height, corrected: false }
  }

  const maxEdge = Math.max(asset.width, asset.height)
  const sourceMaxEdge = Math.max(entry.original_width, entry.original_height)
  return {
    width: Math.max(1, Math.round(entry.original_width * maxEdge / sourceMaxEdge)),
    height: Math.max(1, Math.round(entry.original_height * maxEdge / sourceMaxEdge)),
    corrected: true,
  }
}

const generatedAssets = generatedManifest.assets as SiteAsset[]
const manualAssets = manualManifest.assets as SiteAsset[]

const isPublicAsset = (asset: SiteAsset) => /^\/visual-assets\/[a-f0-9]{64}\.png$/.test(asset.public_path)
  && /^point-[a-f0-9]{64}$/.test(asset.point_id)
  && /^generation-[a-f0-9]{64}$/.test(asset.generation_key)
  && Number.isInteger(asset.width) && asset.width > 0
  && Number.isInteger(asset.height) && asset.height > 0

export function siteVisualsFor(chronicleId: string): SiteAsset[] {
  if (chronicleId !== 'C03-AFTERFALL') return []
  const merged = [...manualAssets, ...generatedAssets].filter(isPublicAsset)
  const seen = new Set<string>()
  return merged.filter((asset) => {
    if (seen.has(asset.subject_id)) return false
    seen.add(asset.subject_id)
    return true
  })
}

export function siteVisualFor(subjectId: string): SiteAsset | undefined {
  return siteVisualsFor('C03-AFTERFALL').find((asset) => asset.subject_id === subjectId)
}
