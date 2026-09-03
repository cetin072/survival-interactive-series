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

  it('posts to /api/gm and marks the first request as attempt zero', async () => {
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
    expect(new Headers(calls[0].init?.headers).get('x-gm-retry-attempt')).toBe('0')
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

  it('retries the direct Netlify function path after /api/gm network failure and marks attempt one', async () => {
    const checkpoint = createSyntheticPublicRuntimeFixture()
    const calls: Array<{ path: string; attempt: string | null }> = []
    const provider = new HttpGMProvider(async (input, init) => {
      calls.push({ path: String(input), attempt: new Headers(init?.headers).get('x-gm-retry-attempt') })
      if (String(input) === '/api/gm') throw new Error('rewrite failed')
      return new Response(JSON.stringify({ status: 'proposal', proposal: { actions: [], narrative: 'ok', next_choices: [], presentation_blocks: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const result = await provider.proposeTurn({ input: { kind: 'numbered-choice', choice_id: 1 }, checkpoint })
    expect(calls).toEqual([
      { path: '/api/gm', attempt: '0' },
      { path: '/.netlify/functions/gm', attempt: '1' },
    ])
    expect(result.status).toBe('proposal')
  })

  it('retries a transient 503/invalid gateway response once without requiring another player click', async () => {
    const checkpoint = createSyntheticPublicRuntimeFixture()
    const calls: Array<{ path: string; attempt: string | null }> = []
    const provider = new HttpGMProvider(async (input, init) => {
      calls.push({ path: String(input), attempt: new Headers(init?.headers).get('x-gm-retry-attempt') })
      if (calls.length === 1) return new Response('<html>gateway unavailable</html>', { status: 503 })
      return new Response(JSON.stringify({ status: 'proposal', proposal: { actions: [], narrative: 'recovered', next_choices: [], presentation_blocks: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const result = await provider.proposeTurn({ input: { kind: 'ordered-choices', choice_ids: [1, 2] }, checkpoint })
    expect(calls).toEqual([
      { path: '/api/gm', attempt: '0' },
      { path: '/.netlify/functions/gm', attempt: '1' },
    ])
    expect(result.status).toBe('proposal')
  })

  it('retries the same explicit endpoint once after a transient response and marks fallback attempt', async () => {
    const checkpoint = createSyntheticPublicRuntimeFixture()
    const attempts: Array<string | null> = []
    const provider = new HttpGMProvider(async (_input, init) => {
      attempts.push(new Headers(init?.headers).get('x-gm-retry-attempt'))
      if (attempts.length === 1) return new Response('gateway timeout', { status: 504 })
      return new Response(JSON.stringify({ status: 'proposal', proposal: { actions: [], narrative: 'recovered', next_choices: [], presentation_blocks: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }, '/.netlify/functions/gm')

    const result = await provider.proposeTurn({ input: { kind: 'numbered-choice', choice_id: 3 }, checkpoint })
    expect(attempts).toEqual(['0', '1'])
    expect(result.status).toBe('proposal')
  })

  it('returns safe unavailable result after retrying network, HTTP proposal rejection, or invalid JSON failures', async () => {
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
