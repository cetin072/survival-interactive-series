import { describe, expect, it } from 'vitest'
import { createPrompt } from './prompt.mjs'

describe('AI GM spike prompt', () => {
  it('states that ambiguity is a no-action stop result', () => {
    expect(createPrompt({ state: {}, allowed: {}, facts: [], input: '아이에게 전화한다.' }))
      .toContain('set ambiguous=true, return actions as an empty array')
  })
})
