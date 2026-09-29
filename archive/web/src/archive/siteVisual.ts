import manifest from '../../../content/visuals/C03-AFTERFALL/SITE_ASSETS.json'

type SiteAsset = { subject_id: string; point_id: string; generation_key: string; public_path: string; width: number; height: number }

const assets = manifest.assets as SiteAsset[]

export function siteVisualsFor(chronicleId: string): SiteAsset[] {
  if (chronicleId !== 'C03-AFTERFALL') return []
  return assets.filter((asset) => /^\/visual-assets\/[a-f0-9]{64}\.png$/.test(asset.public_path)
    && /^point-[a-f0-9]{64}$/.test(asset.point_id)
    && /^generation-[a-f0-9]{64}$/.test(asset.generation_key))
}

export function siteVisualFor(subjectId: string): SiteAsset | undefined {
  return siteVisualsFor('C03-AFTERFALL').find((asset) => asset.subject_id === subjectId)
}
