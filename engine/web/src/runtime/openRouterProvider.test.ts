import { describe, expect, it } from 'vitest'
import { fingerprintOpenRouterResponse, OpenRouterProvider, OPENROUTER_DEEPSEEK_MODEL, OPENROUTER_MAX_ATTEMPTS, type OpenRouterObservabilityEvent } from '../../netlify/functions/openRouterProvider'
import { runGMProviderTurn } from './gmTurnRuntime'
import { createWebMvpTestSession } from './webMvpTestSession'

function validProposal() {
  const followUpAction = { id: 'gm-follow-up', label: '다음 공개 상태 확인', actors: ['player'], exclusive_resources: [], proposal: { time_delta_min: 5, moves: [], resource_changes: [], base_capability_changes: [], world_changes: [] } }
  return {
    actions: [{ id: 'gm-check-comms', label: '통신 상태 확인', actors: ['player'], exclusive_resources: [], proposal: { time_delta_min: 10, moves: [], resource_changes: [{ resource_id: 'communications', from: '불안정', to: '점검 중' }], base_capability_changes: [], world_changes: [] } }],
    narrative: '통신 상태를 점검하도록 제안합니다.',
    next_choices: [{ id: 1, label: '다음 공개 상태를 확인한다', action: followUpAction }],
    presentation_blocks: [{ type: 'EVENT', message: 'AI 제안은 아직 엔진 검증 전입니다.' }],
    family_reactions: [{ member: 'son', disposition: 'independent_action', message: '민석은 통신 목록을 따로 정리합니다.' }],
  }
}

function completion(proposal: unknown, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(proposal) } }], usage: { prompt_tokens: 123, completion_tokens: 45, cost: 0.0001 } }), { status, headers: { 'x-openrouter-provider': 'test-upstream' } })
}

describe('OpenRouterProvider', () => {
  it('requests the approved DeepSeek model, validates the proposal, and leaves the engine to commit it', async () => {
    const events: OpenRouterObservabilityEvent[] = []
    const calls: RequestInit[] = []
    const provider = new OpenRouterProvider({ apiKey: 'test-key', observe: (event) => events.push(event), fetchImpl: async (_url, init) => { calls.push(init ?? {}); return completion(validProposal()) } })
    const initial = createWebMvpTestSession()
    const result = await provider.proposeTurn({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint: initial })
    expect(result.status).toBe('proposal')
    expect(calls).toHaveLength(1)
    const sent = JSON.parse(String(calls[0].body)) as { model: string; response_format: { json_schema: { strict: boolean } } }
    expect(sent.model).toBe(OPENROUTER_DEEPSEEK_MODEL)
    expect(sent.response_format.json_schema.strict).toBe(true)
    expect(events[0]).toMatchObject({ success: true, retry_count: 0, schema_validation: 'passed', upstream_provider: 'test-upstream' })
    const next = await runGMProviderTurn(initial, { kind: 'free-action', text: '통신 상태를 확인한다' }, provider)
    expect(next.public_state.resources.communications.band).toBe('점검 중')
    expect(next.committed_turn.number).toBe(1)
    expect(next.current_scene.presentation_blocks.at(-1)?.message).toContain('민석')
  })

  it('does not call a provider without a server key', async () => {
    let called = false
    const provider = new OpenRouterProvider({ apiKey: undefined, fetchImpl: async () => { called = true; return completion(validProposal()) }, observe: () => {} })
    const result = await provider.proposeTurn({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint: createWebMvpTestSession() })
    expect(called).toBe(false)
    expect(result).toMatchObject({ status: 'unavailable' })
  })

  it('does not let an observability failure reject a valid proposal', async () => {
    const provider = new OpenRouterProvider({ apiKey: 'test-key', observe: () => { throw new Error('logging unavailable') }, fetchImpl: async () => completion(validProposal()) })
    const result = await provider.proposeTurn({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint: createWebMvpTestSession() })
    expect(result.status).toBe('proposal')
  })

  it('retries a transient network failure no more than once, then safely falls back', async () => {
    const events: OpenRouterObservabilityEvent[] = []
    let calls = 0
    const provider = new OpenRouterProvider({ apiKey: 'test-key', timeoutMs: 1, observe: (event) => events.push(event), fetchImpl: async () => { calls += 1; throw new Error('temporary offline') } })
    const result = await provider.proposeTurn({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint: createWebMvpTestSession() })
    expect(result.status).toBe('unavailable')
    expect(calls).toBe(OPENROUTER_MAX_ATTEMPTS)
    expect(events[0]).toMatchObject({ success: false, retry_count: 1, failure_category: 'network' })
  })

  it('classifies a bounded abort as a timeout and retries a 5xx exactly once', async () => {
    let timeoutCalls = 0
    const timeoutEvents: OpenRouterObservabilityEvent[] = []
    const timeoutProvider = new OpenRouterProvider({ apiKey: 'test-key', timeoutMs: 1, observe: (event) => timeoutEvents.push(event), fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => { timeoutCalls += 1; init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }) }) })
    await timeoutProvider.proposeTurn({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint: createWebMvpTestSession() })
    expect(timeoutCalls).toBe(OPENROUTER_MAX_ATTEMPTS)
    expect(timeoutEvents[0]).toMatchObject({ failure_category: 'timeout', retry_count: 1 })
    let serverCalls = 0
    const serverProvider = new OpenRouterProvider({ apiKey: 'test-key', observe: () => {}, fetchImpl: async () => { serverCalls += 1; return new Response('{}', { status: 503 }) } })
    expect((await serverProvider.proposeTurn({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint: createWebMvpTestSession() })).status).toBe('unavailable')
    expect(serverCalls).toBe(OPENROUTER_MAX_ATTEMPTS)
  })

  it('falls back immediately for authentication/configuration failures', async () => {
    let calls = 0
    const provider = new OpenRouterProvider({ apiKey: 'test-key', observe: () => {}, fetchImpl: async () => { calls += 1; return new Response('{}', { status: 401 }) } })
    const result = await provider.proposeTurn({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint: createWebMvpTestSession() })
    expect(result.status).toBe('unavailable')
    expect(calls).toBe(1)
  })

  it('rejects malformed JSON, unsupported response shapes, and schema mismatches before commit', async () => {
    const checkpoint = createWebMvpTestSession()
    const responses = [new Response('not-json', { status: 200 }), new Response(JSON.stringify({ choices: [] }), { status: 200 }), completion({ ...validProposal(), unexpected: true })]
    for (const response of responses) {
      const provider = new OpenRouterProvider({ apiKey: 'test-key', observe: () => {}, fetchImpl: async () => response })
      const result = await provider.proposeTurn({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint })
      expect(result.status).toBe('unavailable')
      const next = await runGMProviderTurn(checkpoint, { kind: 'free-action', text: '통신 상태를 확인한다' }, provider)
      expect(next.public_state).toEqual(checkpoint.public_state)
    }
  })

  it('records a structural-only fingerprint for a documented-shape variant without retaining response content', () => {
    const fingerprint = fingerprintOpenRouterResponse({ id: 'safe-id', model: 'safe-model', choices: [{ message: { role: 'assistant', content: null } }], metadata: { provider: 'safe-provider' } }, 'safe-provider')
    expect(fingerprint).toMatchObject({ top_level_keys: ['choices', 'id', 'metadata', 'model'], choices_type: 'array', choices_length: 1, choice_zero_keys: ['message'], message_type: 'object', message_keys: ['content', 'role'], message_content_type: 'null', response_id_present: true, response_model_present: true, openrouter_metadata_present: true, upstream_provider: 'safe-provider' })
    expect(JSON.stringify(fingerprint)).not.toContain('safe-id')
    expect(JSON.stringify(fingerprint)).not.toContain('safe-model')
  })

  it('rejects a 200 error envelope and unknown object content without schema validation or commit', async () => {
    const checkpoint = createWebMvpTestSession()
    const payloads = [
      { error: { message: 'not retained' } },
      { choices: [{ message: { content: { unexpected: true } } }] },
    ]
    for (const payload of payloads) {
      const provider = new OpenRouterProvider({ apiKey: 'test-key', observe: () => {}, fetchImpl: async () => new Response(JSON.stringify(payload), { status: 200 }) })
      const result = await provider.proposeTurn({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint })
      expect(result).toMatchObject({ status: 'unavailable', diagnostic: { key_present: true, failure_category: 'unsupported_response_shape' } })
    }
  })

  it('never forwards hidden seed or raw transcript fields to OpenRouter', async () => {
    let body = ''
    const checkpoint = createWebMvpTestSession()
    const contaminated = { ...checkpoint, public_state: { ...checkpoint.public_state, raw_transcript: 'do-not-send', hidden_seed: 'do-not-send' } }
    const provider = new OpenRouterProvider({ apiKey: 'test-key', observe: () => {}, fetchImpl: async (_url, init) => { body = String(init?.body); return completion(validProposal()) } })
    await provider.proposeTurn({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint: contaminated })
    expect(body).not.toContain('raw_transcript')
    expect(body).not.toContain('hidden_seed')
    expect(body).not.toContain('test-key')
  })
})
