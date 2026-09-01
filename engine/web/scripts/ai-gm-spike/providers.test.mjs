import { describe, expect, it } from 'vitest'
import { extractProviderContent, parseProviderContent, requestStructuredAction, requireApiKey, selectModels, verifyModels } from './providers.mjs'

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

  it('accepts only the documented non-streaming content string shape', () => {
    expect(extractProviderContent({ choices: [{ message: { content: '{"actions":[]}' } }] })).toMatchObject({
      valid: true,
      responseShape: 'choices[0].message.content:string',
    })
    expect(extractProviderContent({ choices: [{ message: { content: null } }] })).toMatchObject({
      valid: false,
      responseShape: 'choices[0].message.content:null',
    })
    expect(extractProviderContent({ choices: [{ message: { content: [] } }] })).toMatchObject({
      valid: false,
      responseShape: 'choices[0].message.content:array',
    })
  })

  it('records each response shape and total wall clock across a retry', async () => {
    const payloads = [
      { choices: [{ message: { content: null } }] },
      { choices: [{ message: { content: '{"actions":[],"ambiguous":false,"confidence":1}' } }], usage: { total_tokens: 3 } },
    ]
    const result = await requestStructuredAction({
      apiKey: 'local-test-key',
      model: { id: 'one' },
      benchmarkCase,
      prompt: 'test prompt',
      timeoutMs: 100,
      fetchImpl: async () => ({ ok: true, json: async () => payloads.shift() }),
    })
    expect(result.ok).toBe(true)
    expect(result.retryCount).toBe(1)
    expect(result.wallClockMs).toBeGreaterThanOrEqual(0)
    expect(result.attempts).toEqual([
      expect.objectContaining({ attempt: 1, outcome: 'unsupported_response_shape', responseShape: 'choices[0].message.content:null' }),
      expect.objectContaining({ attempt: 2, outcome: 'success', responseShape: 'choices[0].message.content:string' }),
    ])
  })

  it('checks live-catalog metadata for structured output support', async () => {
    const models = await verifyModels([{ id: 'one' }], async () => ({ ok: true, json: async () => ({ data: [{ id: 'one', supported_parameters: ['structured_outputs'] }] }) }))
    expect(models[0]).toMatchObject({ available: true, structuredOutputSupported: true, limitation: null })
  })
})
