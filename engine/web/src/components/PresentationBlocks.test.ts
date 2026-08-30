import { describe, expect, it } from 'vitest'
import { demoScene } from '../data/demoScene'

describe('M0 presentation block fixtures', () => {
  it('provides conditional EVENT, AUTO, and PHASE CHANGE display data', () => {
    expect(demoScene.presentationBlocks.map((block) => block.type)).toEqual(['EVENT', 'AUTO', 'PHASE CHANGE'])
  })
})
