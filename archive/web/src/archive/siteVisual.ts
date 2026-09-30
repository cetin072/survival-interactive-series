import generatedManifest from '../../../content/visuals/C03-AFTERFALL/SITE_ASSETS.json'
import manualManifest from '../../../content/visuals/C03-AFTERFALL/MANUAL_SITE_ASSETS.json'

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
}

const generatedAssets = generatedManifest.assets as SiteAsset[]
const manualAssets = manualManifest.assets as SiteAsset[]

const isPublicAsset = (asset: SiteAsset) => /^\/visual-assets\/[a-f0-9]{64}\.png$/.test(asset.public_path)
  && /^point-[a-f0-9]{64}$/.test(asset.point_id)
  && /^generation-[a-f0-9]{64}$/.test(asset.generation_key)

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
