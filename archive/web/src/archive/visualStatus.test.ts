import { describe, expect, it } from 'vitest'
import { publicVisualCatalogSummary, publicVisualStatus } from './visualStatus'

describe('public visual status', () => {
  it('shows a prepared brief as an image still pending', () => {
    expect(publicVisualStatus('char-jinwoo')).toMatchObject({ state: 'BRIEF_READY_IMAGE_PENDING', label: '그림 준비 중' })
    expect(publicVisualCatalogSummary.publishedImages).toBe(0)
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
})
