import { describe, expect, it } from 'vitest'
import { publicVisualCatalogSummary, publicVisualStatus, resolvePublicVisualStatus } from './visualStatus'

describe('public visual status', () => {
  it('shows the approved Jinwoo site image while another brief remains pending', () => {
    expect(publicVisualStatus('char-jinwoo')).toMatchObject({ state: 'SITE_IMAGE_READY', label: '공개 그림',
      image: { src: '/visual-assets/5112dc7b2e8901aed2fcbe2c4a34736af0fefed2394a5c82e7d08fa6f2d558c8.png' } })
    expect(publicVisualStatus('char-seojin')).toMatchObject({ state: 'BRIEF_READY_IMAGE_PENDING', label: '그림 준비 중' })
    expect(publicVisualCatalogSummary.siteReadyImages).toBeGreaterThanOrEqual(1)
  })
  it('shows withheld public visual scope as pending source material', () => {
    expect(publicVisualStatus('loc-contact')?.state).toBe('SOURCE_PENDING')
  })
  it('does not invent a visual point for an unrelated reference', () => {
    expect(publicVisualStatus('ref-visual')).toBeNull()
  })
  it('keeps catalog counts coherent as new seasons and images arrive', () => {
    expect(publicVisualCatalogSummary.readyBriefs).toBeGreaterThanOrEqual(publicVisualCatalogSummary.siteReadyImages)
    expect(publicVisualCatalogSummary.waitingBriefs).toBeGreaterThanOrEqual(0)
    expect(publicVisualCatalogSummary.sourceSaveVersion).toBeGreaterThanOrEqual(253)
  })
  it('renders only a site asset bound to the current point and generation', () => {
    const point = { point_id: 'point-test', generation_key: 'generation-current', subject_id: 'char-test', status: 'READY' }
    const image = { point_id: point.point_id, generation_key: point.generation_key, subject_id: point.subject_id,
      public_path: '/visual-assets/test.png', width: 100, height: 120 }
    expect(resolvePublicVisualStatus(point, image)).toMatchObject({ state: 'SITE_IMAGE_READY', image: { src: image.public_path } })
    expect(resolvePublicVisualStatus(point, { ...image, generation_key: 'generation-stale' })?.state).toBe('BRIEF_READY_IMAGE_PENDING')
  })
})
