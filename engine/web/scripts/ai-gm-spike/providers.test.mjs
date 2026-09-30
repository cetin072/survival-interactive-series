import { describe, expect, it } from 'vitest'
import { extractProviderContent, extractRoutingMetadata, parseProviderContent, requestStructuredAction, requireApiKey, selectModels, verifyModels } from './providers.mjs'

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

  it('extracts only safe upstream routing fields from opt-in router metadata', () => {
    expect(extractRoutingMetadata({
      openrouter_metadata: {
        strategy: 'fallback',
        attempt: 2,
        endpoints: { available: [{ provider: 'first', model: 'one', selected: false }, { provider: 'second', model: 'one', selected: true }] },
        attempts: [{ provider: 'first', model: 'one', status: 502 }, { provider: 'second', model: 'one', status: 200 }],
      },
    })).toEqual({
      status: 'provided',
      upstreamProvider: 'second',
      upstreamModel: 'one',
      strategy: 'fallback',
      routerAttempt: 2,
      attempts: [{ provider: 'first', model: 'one', status: 502 }, { provider: 'second', model: 'one', status: 200 }],
    })
    expect(extractRoutingMetadata({})).toMatchObject({ status: 'not_provided', upstreamProvider: null, attempts: [] })
  })

  it('records each response shape and total wall clock across a retry', async () => {
    const payloads = [
      { choices: [{ message: { content: null } }] },
      {
        choices: [{ message: { content: '{"actions":[],"ambiguous":false,"confidence":1}' } }],
        usage: { total_tokens: 3 },
        openrouter_metadata: { strategy: 'direct', attempt: 1, attempts: [{ provider: 'deepseek', model: 'one', status: 200 }] },
      },
    ]
    const requests = []
    const result = await requestStructuredAction({
      apiKey: 'local-test-key',
      model: { id: 'one' },
      benchmarkCase,
      prompt: 'test prompt',
      timeoutMs: 100,
      fetchImpl: async (_url, init) => {
        requests.push(init)
        return { ok: true, text: async () => JSON.stringify(payloads.shift()) }
      },
    })
    expect(result.ok).toBe(true)
    expect(result.retryCount).toBe(1)
    expect(result.wallClockMs).toBeGreaterThanOrEqual(0)
    expect(result.attempts).toEqual([
      expect.objectContaining({ attempt: 1, outcome: 'unsupported_response_shape', responseShape: 'choices[0].message.content:null' }),
      expect.objectContaining({ attempt: 2, outcome: 'success', responseShape: 'choices[0].message.content:string' }),
    ])
    expect(result.routing).toMatchObject({ upstreamProvider: 'deepseek', upstreamModel: 'one' })
    expect(requests[0].headers).toMatchObject({ 'X-OpenRouter-Metadata': 'enabled' })
    expect(JSON.parse(requests[0].body).provider).toEqual({ require_parameters: true })
  })

  it('can pin a benchmark request to one provider without changing the default route', async () => {
    let request
    await requestStructuredAction({
      apiKey: 'local-test-key',
      model: { id: 'one' },
      benchmarkCase,
      prompt: 'test prompt',
      timeoutMs: 100,
      providerId: 'deepinfra',
      fetchImpl: async (_url, init) => {
        request = JSON.parse(init.body)
        return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: '{"actions":[],"ambiguous":false,"confidence":1}' } }] }) }
      },
    })
    expect(request.provider).toEqual({ require_parameters: true, only: ['deepinfra'], allow_fallbacks: false })
  })

  it('checks live-catalog metadata for structured output support', async () => {
    const models = await verifyModels([{ id: 'one' }], async () => ({ ok: true, json: async () => ({ data: [{ id: 'one', supported_parameters: ['structured_outputs'] }] }) }))
    expect(models[0]).toMatchObject({ available: true, structuredOutputSupported: true, limitation: null })
  })
})
