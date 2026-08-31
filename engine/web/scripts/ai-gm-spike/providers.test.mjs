import { describe, expect, it } from 'vitest'
import { parseProviderContent, requireApiKey, selectModels, verifyModels } from './providers.mjs'

const benchmarkCase = { allowed: { actors: ['player'], targets: [], locations: ['shelter'], vehicles: [], items: [] } }

describe('AI GM spike providers', () => {
  it('fails safely when the local API key is absent', () => {
    expect(() => requireApiKey({})).toThrow('OPENROUTER_API_KEY is required')
  })

  it('selects configured models and rejects an unconfigured one', () => {
    const config = { models: [{ id: 'one' }, { id: 'two' }] }
    expect(selectModels(config, ['two'])).toEqual([{ id: 'two' }])
    expect(() => selectModels(config, ['missing'])).toThrow('Unknown configured model')
  })

  it('records malformed provider content as invalid instead of parsing prose', () => {
    expect(parseProviderContent('not JSON', benchmarkCase)).toEqual({ valid: false, error: 'Provider content was not valid JSON.' })
  })

  it('checks live-catalog metadata for structured output support', async () => {
    const models = await verifyModels([{ id: 'one' }], async () => ({ ok: true, json: async () => ({ data: [{ id: 'one', supported_parameters: ['structured_outputs'] }] }) }))
    expect(models[0]).toMatchObject({ available: true, structuredOutputSupported: true, limitation: null })
  })
})
