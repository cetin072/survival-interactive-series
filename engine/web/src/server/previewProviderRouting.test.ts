import { describe, expect, it } from 'vitest'
import { selectStoryProviderTier } from './previewProviderRouting'

describe('preview GM provider tier routing', () => {
  it('uses the Pro-quality primary tier for the first Deploy Preview attempt', () => {
    expect(selectStoryProviderTier('deploy-preview', 0)).toBe('preview-primary')
    expect(selectStoryProviderTier('deploy-preview', Number.NaN)).toBe('preview-primary')
    expect(selectStoryProviderTier('deploy-preview', -1)).toBe('preview-primary')
  })

  it('uses the emergency fallback tier only after a retry attempt', () => {
    expect(selectStoryProviderTier('deploy-preview', 1)).toBe('preview-fallback')
    expect(selectStoryProviderTier('deploy-preview', 2)).toBe('preview-fallback')
  })

  it('does not alter the non-preview provider policy', () => {
    expect(selectStoryProviderTier('production', 0)).toBe('default')
    expect(selectStoryProviderTier('production', 1)).toBe('default')
    expect(selectStoryProviderTier(undefined, 1)).toBe('default')
  })
})
