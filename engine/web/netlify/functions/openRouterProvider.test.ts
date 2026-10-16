import { describe, expect, it, vi } from 'vitest'
import { OpenRouterDeepSeekProvider, OPENROUTER_DEEPSEEK_MODEL } from './openRouterProvider'
import { createSyntheticPublicRuntimeFixture } from '../../src/runtime/syntheticPublicRuntimeFixture'

const request = { input: { kind: 'numbered-choice' as const, choice_id: 1 }, checkpoint: createSyntheticPublicRuntimeFixture() }
const proposal = { actions: [], narrative: 'synthetic proposal', next_choices: [], presentation_blocks: [] }

describe('OpenRouter DeepSeek server provider', () => {
  it('uses the verified DeepSeek model once and returns structured proposal plus safe usage metadata', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_input)).toBe('https://openrouter.ai/api/v1/chat/completions')
      expect(init?.headers).toMatchObject({ authorization: 'Bearer test-only-key' })
      const body = JSON.parse(String(init?.body))
      expect(body.model).toBe(OPENROUTER_DEEPSEEK_MODEL)
      expect(body.response_format.type).toBe('json_schema')
      expect(body.provider).toEqual({ require_parameters: true })
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(proposal) } }], usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18, cost: 0.001 } }))
    })
    const result = await new OpenRouterDeepSeekProvider('test-only-key', fetcher).proposeTurn(request)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ status: 'proposal', proposal, meta: { provider: 'openrouter', model: OPENROUTER_DEEPSEEK_MODEL, retry_count: 0, usage: { total_tokens: 18, cost: 0.001 } } })
  })

  it('classifies timeout and unavailable failures without retrying', async () => {
    const timeout = new OpenRouterDeepSeekProvider('test-only-key', async () => {
      const error = new Error('aborted'); error.name = 'AbortError'; throw error
    })
    const unavailable = new OpenRouterDeepSeekProvider('test-only-key', async () => new Response('{}', { status: 503 }))

    await expect(timeout.proposeTurn(request)).resolves.toMatchObject({ status: 'unavailable', meta: { failure_kind: 'timeout', retry_count: 0 } })
    await expect(unavailable.proposeTurn(request)).resolves.toMatchObject({ status: 'unavailable', meta: { failure_kind: 'unavailable', retry_count: 0 } })
  })

  it('keeps the wall-clock deadline active through delayed response body parsing', async () => {
    const slowBody = new OpenRouterDeepSeekProvider('test-only-key', async () => ({
      json: () => new Promise((resolve) => setTimeout(() => resolve({ choices: [{ message: { content: JSON.stringify(proposal) } }] }), 100)),
    }) as Response, 10)
    const startedAt = Date.now()
    const result = await slowBody.proposeTurn(request)

    expect(result).toMatchObject({ status: 'unavailable', meta: { failure_kind: 'timeout', retry_count: 0 } })
    expect(Date.now() - startedAt).toBeLessThan(80)
  })

  it('classifies malformed JSON and unsupported provider response shapes safely', async () => {
    const malformedJson = new OpenRouterDeepSeekProvider('test-only-key', async () => new Response('not-json'))
    const unsupportedShape = new OpenRouterDeepSeekProvider('test-only-key', async () => new Response(JSON.stringify({ choices: [{ message: { content: ['not', 'text'] } }] })))
    const malformedStructured = new OpenRouterDeepSeekProvider('test-only-key', async () => new Response(JSON.stringify({ choices: [{ message: { content: '{bad' } }] })))

    await expect(malformedJson.proposeTurn(request)).resolves.toMatchObject({ status: 'unavailable', meta: { failure_kind: 'malformed_json' } })
    await expect(unsupportedShape.proposeTurn(request)).resolves.toMatchObject({ status: 'unavailable', meta: { failure_kind: 'unsupported_response_shape' } })
    await expect(malformedStructured.proposeTurn(request)).resolves.toMatchObject({ status: 'unavailable', meta: { failure_kind: 'schema_error' } })
  })
})
