import { describe, expect, it } from 'vitest'
import { recordVisualProfileFor } from './recordVisualProfile'

describe('optional Automation B visual enrichment', () => {
  it('returns no profile for A-Wiki graph records', () => {
    for (const id of ['char-jo-hansu', 'event-west-road-trial-agreement', 'event-west-road-rain-response']) {
      expect(recordVisualProfileFor(id)).toBeUndefined()
    }
  })
})
