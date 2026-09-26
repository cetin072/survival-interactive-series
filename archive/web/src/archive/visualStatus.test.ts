import { describe, expect, it } from 'vitest'
import { publicVisualCatalogSummary, publicVisualStatus, resolvePublicVisualStatus } from './visualStatus'

describe('public visual status', () => {
  it('shows a prepared brief as an image still pending', () => {
    expect(publicVisualStatus('char-jinwoo')).toMatchObject({ state: 'BRIEF_READY_IMAGE_PENDING', label: '그림 준비 중' })
    expect(publicVisualCatalogSummary.siteReadyImages).toBe(0)
  })
  it('shows withheld public visual scope as pending source material', () => {
    expect(publicVisualStatus('loc-contact')?.state).toBe('SOURCE_PENDING')
  })
  it('does not invent a visual point for an unrelated reference', () => {
    expect(publicVisualStatus('ref-visual')).toBeNull()
  })
  it('matches the pinned public catalog counts', () => {
    expect(publicVisualCatalogSummary.readyBriefs).toBe(30)
    expect(publicVisualCatalogSummary.waitingBriefs).toBe(4)
    expect(publicVisualCatalogSummary.sourceSaveVersion).toBe(253)
  })
  it('renders only a site asset bound to the current point and generation', () => {
    const point = { point_id: 'point-test', generation_key: 'generation-current', subject_id: 'char-test', status: 'READY' }
    const image = { point_id: point.point_id, generation_key: point.generation_key, subject_id: point.subject_id,
      public_path: '/visual-assets/test.png', width: 100, height: 120 }
    expect(resolvePublicVisualStatus(point, image)).toMatchObject({ state: 'SITE_IMAGE_READY', image: { src: image.public_path } })
    expect(resolvePublicVisualStatus(point, { ...image, generation_key: 'generation-stale' })?.state).toBe('BRIEF_READY_IMAGE_PENDING')
  })
})
