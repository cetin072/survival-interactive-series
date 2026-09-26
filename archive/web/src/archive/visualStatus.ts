import catalog from '../../../content/visuals/C03-AFTERFALL/VISUALS.json'
import siteAssets from '../../../content/visuals/C03-AFTERFALL/SITE_ASSETS.json'

type SiteAsset = { point_id: string; generation_key: string; subject_id: string; public_path: string; width: number; height: number }
type VisualPoint = { point_id: string; generation_key: string | null; subject_id: string; status: string }

export type PublicVisualStatus = {
  state: 'BRIEF_READY_IMAGE_PENDING' | 'SOURCE_PENDING' | 'SITE_IMAGE_READY'
  label: string
  detail: string
  image?: { src: string; width: number; height: number }
}

// The checked-in manifest is empty until a verified, approved site asset exists.
const visualBySubject = new Map(catalog.points.filter((point) => point.point_type !== 'MAP').map((point) => [point.subject_id, point]))
const siteAssetByPoint = new Map((siteAssets.assets as SiteAsset[]).map((asset) => [asset.point_id, asset]))

export function publicVisualStatus(subjectId: string): PublicVisualStatus | null {
  const point = visualBySubject.get(subjectId)
  return resolvePublicVisualStatus(point, point ? siteAssetByPoint.get(point.point_id) : undefined)
}

export function resolvePublicVisualStatus(point: VisualPoint | undefined, image?: SiteAsset): PublicVisualStatus | null {
  if (!point) return null
  if (point.status === 'READY' && image?.point_id === point.point_id
    && image.generation_key === point.generation_key && image.subject_id === point.subject_id) return {
    state: 'SITE_IMAGE_READY', label: '공개 그림', detail: '공개 기록에 연결된 그림입니다.',
    image: { src: image.public_path, width: image.width, height: image.height },
  }
  if (point.status === 'READY') return {
    state: 'BRIEF_READY_IMAGE_PENDING', label: '그림 준비 중',
    detail: '공개 기록을 바탕으로 그림 설명이 준비되었습니다. 게시된 그림은 아직 없습니다.',
  }
  return {
    state: 'SOURCE_PENDING', label: '그림 자료 대기',
    detail: '그림에 필요한 공개 자료가 확인되면 준비합니다.',
  }
}

export const publicVisualCatalogSummary = {
  sourceSaveVersion: catalog.anchor.save_version,
  readyBriefs: catalog.points.filter((point) => point.status === 'READY').length,
  waitingBriefs: catalog.points.filter((point) => point.status === 'WAITING_CANON').length,
  siteReadyImages: siteAssets.assets.length,
} as const
