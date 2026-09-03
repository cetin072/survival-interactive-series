import { describe, expect, it } from 'vitest'
import { createSyntheticPublicRuntimeFixture } from './syntheticPublicRuntimeFixture'
import { createWebMvpTestSession } from './webMvpTestSession'
import { HttpGMProvider, validateGMTransportRequest, validateGMTransportResponse } from './gmTransport'

describe('GM HTTP transport contract', () => {
  it('accepts public checkpoint v1 and rejects hidden/archive-only fields', () => {
    const checkpoint = createSyntheticPublicRuntimeFixture()
    expect(validateGMTransportRequest({ input: { kind: 'numbered-choice', choice_id: 1 }, checkpoint }).valid).toBe(true)

    const contaminated = { ...checkpoint, hidden_seed: { event: 'secret' } }
    const result = validateGMTransportRequest({ input: { kind: 'numbered-choice', choice_id: 1 }, checkpoint: contaminated })
    expect(result.valid).toBe(false)
  })

  it('accepts the exact WEB MVP test-session checkpoint used by the browser', () => {
    const checkpoint = createWebMvpTestSession()
    const numbered = validateGMTransportRequest({ input: { kind: 'numbered-choice', choice_id: 1 }, checkpoint })
    const ordered = validateGMTransportRequest({ input: { kind: 'ordered-choices', choice_ids: [1, 2] }, checkpoint })
    const tooManyOrdered = validateGMTransportRequest({ input: { kind: 'ordered-choices', choice_ids: [1, 2, 3] }, checkpoint })
    const free = validateGMTransportRequest({ input: { kind: 'free-action', text: '가족에게 먼저 전화한다' }, checkpoint })
    expect(numbered).toEqual(expect.objectContaining({ valid: true }))
    expect(ordered).toEqual(expect.objectContaining({ valid: true }))
    expect(tooManyOrdered).toEqual(expect.objectContaining({ valid: false }))
    expect(free).toEqual(expect.objectContaining({ valid: true }))
  })

  it('validates transport response envelopes without trusting proposal shape', () => {
    expect(validateGMTransportResponse({ status: 'proposal', proposal: { anything: true } }).valid).toBe(true)
    expect(validateGMTransportResponse({ status: 'unavailable', message: 'offline' }).valid).toBe(true)
    expect(validateGMTransportResponse({ status: 'proposal' }).valid).toBe(false)
  })

  it('posts to /api/gm and returns a structured proposal envelope', async () => {
    const checkpoint = createSyntheticPublicRuntimeFixture()
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const provider = new HttpGMProvider(async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ status: 'proposal', proposal: { actions: [], narrative: 'ok', next_choices: [], presentation_blocks: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const result = await provider.proposeTurn({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint })
    expect(calls).toHaveLength(1)
    expect(String(calls[0].input)).toBe('/api/gm')
    expect(calls[0].init?.method).toBe('POST')
    expect(result.status).toBe('proposal')
  })

  it('coalesces identical in-flight turn requests into one HTTP call', async () => {
    const checkpoint = createSyntheticPublicRuntimeFixture()
    let calls = 0
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const provider = new HttpGMProvider(async () => {
      calls += 1
      await gate
      return new Response(JSON.stringify({ status: 'proposal', proposal: { actions: [], narrative: 'ok', next_choices: [], presentation_blocks: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const request = { input: { kind: 'free-action' as const, text: '민석에게 중간 지점에서 만나자고 한다' }, checkpoint }

    const first = provider.proposeTurn(request)
    const second = provider.proposeTurn(request)
    expect(calls).toBe(1)
    release?.()

    const [a, b] = await Promise.all([first, second])
    expect(a.status).toBe('proposal')
    expect(b.status).toBe('proposal')
    expect(calls).toBe(1)
  })

  it('uses the browser/global fetch receiver for the default transport', async () => {
    const checkpoint = createSyntheticPublicRuntimeFixture()
    const originalFetch = globalThis.fetch
    let receiver: unknown

    globalThis.fetch = async function (this: unknown) {
      receiver = this
      return new Response(JSON.stringify({ status: 'proposal', proposal: { actions: [], narrative: 'ok', next_choices: [], presentation_blocks: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    } as typeof fetch

    try {
      const provider = new HttpGMProvider()
      const result = await provider.proposeTurn({ input: { kind: 'numbered-choice', choice_id: 1 }, checkpoint })
      expect(receiver).toBe(globalThis)
      expect(result.status).toBe('proposal')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('retries the direct Netlify function path after /api/gm network failure', async () => {
    const checkpoint = createSyntheticPublicRuntimeFixture()
    const calls: string[] = []
    const provider = new HttpGMProvider(async (input) => {
      calls.push(String(input))
      if (String(input) === '/api/gm') throw new Error('rewrite failed')
      return new Response(JSON.stringify({ status: 'proposal', proposal: { actions: [], narrative: 'ok', next_choices: [], presentation_blocks: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const result = await provider.proposeTurn({ input: { kind: 'numbered-choice', choice_id: 1 }, checkpoint })
    expect(calls).toEqual(['/api/gm', '/.netlify/functions/gm'])
    expect(result.status).toBe('proposal')
  })

  it('returns safe unavailable result on network, HTTP proposal rejection, or invalid JSON', async () => {
    const checkpoint = createSyntheticPublicRuntimeFixture()
    const request = { input: { kind: 'numbered-choice' as const, choice_id: 1 }, checkpoint }

    const network = new HttpGMProvider(async () => { throw new Error('offline') })
    expect((await network.proposeTurn(request)).status).toBe('unavailable')

    const rejected = new HttpGMProvider(async () => new Response(JSON.stringify({ status: 'proposal', proposal: {} }), { status: 502 }))
    expect((await rejected.proposeTurn(request)).status).toBe('unavailable')

    const invalidJson = new HttpGMProvider(async () => new Response('not-json', { status: 500 }))
    expect((await invalidJson.proposeTurn(request)).status).toBe('unavailable')
  })
})
