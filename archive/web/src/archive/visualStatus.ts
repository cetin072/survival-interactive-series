import catalog from '../../../content/visuals/C03-AFTERFALL/VISUALS.json'

export type PublicVisualStatus = {
  state: 'BRIEF_READY_IMAGE_PENDING' | 'SOURCE_PENDING'
  label: string
  detail: string
}

// This pinned public catalog contains briefs, not completed images or public URLs.
const visualBySubject = new Map(catalog.points.filter((point) => point.point_type !== 'MAP').map((point) => [point.subject_id, point]))

export function publicVisualStatus(subjectId: string): PublicVisualStatus | null {
  const point = visualBySubject.get(subjectId)
  if (!point) return null
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
  publishedImages: 0,
} as const
