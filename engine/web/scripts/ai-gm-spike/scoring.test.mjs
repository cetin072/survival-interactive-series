import { describe, expect, it } from 'vitest'
import { scoreResponse } from './scoring.mjs'

const benchmarkCase = {
  expected: {
    actions: [
      { verb: 'move', actor: 'player', to: 'shelter' },
      { verb: 'call', actor: 'player', target: 'wife' },
    ],
    ambiguous: false,
  },
}

describe('AI GM spike scoring', () => {
  it('scores action order independently from schema validity', () => {
    const score = scoreResponse({ actions: [{ verb: 'call', actor: 'player', target: 'wife' }, { verb: 'move', actor: 'player', to: 'shelter' }], ambiguous: false }, benchmarkCase)
    expect(score.actionCountCorrect).toBe(true)
    expect(score.actionOrderCorrect).toBe(false)
    expect(score.structuralMatchScore).toBeLessThan(1)
  })
})
