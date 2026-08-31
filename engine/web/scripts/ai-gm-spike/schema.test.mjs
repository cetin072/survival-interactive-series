import { describe, expect, it } from 'vitest'
import { buildActionSchema, validateActionResponse } from './schema.mjs'

const benchmarkCase = {
  allowed: { actors: ['player'], targets: ['wife'], locations: ['shelter'], vehicles: ['family_car'], items: ['water_bottle'] },
}

describe('AI GM spike schema', () => {
  it('builds a strict case-specific schema', () => {
    const schema = buildActionSchema(benchmarkCase)
    expect(schema.strict).toBe(true)
    expect(schema.schema.properties.actions.items.additionalProperties).toBe(false)
    expect(schema.schema.properties.actions.items.properties.actor.enum).toEqual(['player'])
  })

  it('accepts allowed ordered actions and rejects unknown fields or IDs', () => {
    expect(validateActionResponse({ actions: [{ verb: 'move', actor: 'player', to: 'shelter', vehicle: 'family_car' }], ambiguous: false, confidence: 0.95 }, benchmarkCase).valid).toBe(true)
    const invalid = validateActionResponse({ actions: [{ verb: 'move', actor: 'stranger', to: 'shelter' }], ambiguous: false, confidence: 0.95, narration: 'ignored' }, benchmarkCase)
    expect(invalid.valid).toBe(false)
    expect(invalid.errors.join(' ')).toContain('unknown field')
  })
})
