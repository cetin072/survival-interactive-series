import { describe, expect, it } from 'vitest'
import { handleGMRequest } from '../../netlify/functions/gm'
import { MockProvider, NullProvider } from './gmProvider'
import { runGMProviderTurn } from './gmTurnRuntime'
import { HttpGMProvider } from './gmTransport'
import { createSyntheticPublicRuntimeFixture } from './syntheticPublicRuntimeFixture'
import { createSyntheticMockProvider } from './syntheticPublicRuntimeFixture'

function endpointFetch(provider?: MockProvider | NullProvider) {
  return async (_input: RequestInfo | URL, init?: RequestInit) => handleGMRequest(new Request('https://example.test/api/gm', init), provider ?? createSyntheticMockProvider())
}

describe('/api/gm synthetic transport', () => {
  it('commits numbered choice only after server transport and engine validation', async () => {
    const initial = createSyntheticPublicRuntimeFixture()
    const provider = new HttpGMProvider(endpointFetch())
    const next = await runGMProviderTurn(initial, { kind: 'numbered-choice', choice_id: 1 }, provider)

    expect(next.public_state.party.player.location).toBe('학교')
    expect(next.public_state.vehicles.family_car.location).toBe('학교')
    expect(next.committed_turn.number).toBe(1)
  })

  it('handles Korean free action and ordered compound action over transport', async () => {
    const provider = new HttpGMProvider(endpointFetch())
    const initial = createSyntheticPublicRuntimeFixture()

    const communications = await runGMProviderTurn(initial, { kind: 'free-action', text: '통신 상태를 확인한다' }, provider)
    expect(communications.public_state.resources.communications.band).toBe('점검 중')

    const compound = await runGMProviderTurn(initial, { kind: 'free-action', text: '통신 상태를 확인하고 가족 차량으로 학교에 간다' }, provider)
    expect(compound.public_state.resources.communications.band).toBe('점검 중')
    expect(compound.public_state.party.player.location).toBe('학교')
    expect(compound.time).toBe('18:10')
  })

  it('maps unavailable backend to fallback without authoritative state mutation', async () => {
    const initial = createSyntheticPublicRuntimeFixture()
    const provider = new HttpGMProvider(endpointFetch(new NullProvider('synthetic backend unavailable')))
    const next = await runGMProviderTurn(initial, { kind: 'free-action', text: '아내에게 연락한다' }, provider)

    expect(next.public_state).toEqual(initial.public_state)
    expect(next.committed_turn.number).toBe(0)
  })

  it('returns only safe diagnostics for synthetic deploy-preview requests', async () => {
    const initial = createSyntheticPublicRuntimeFixture()
    const unavailable = new MockProvider(() => ({ status: 'unavailable' as const, message: 'safe', diagnostic: { key_present: true, failure_category: 'auth_or_config' } }))
    const preview = await handleGMRequest(new Request('https://example.test/api/gm', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint: initial }),
    }), unavailable, 'deploy-preview')
    expect(await preview.json()).toEqual({ status: 'unavailable', message: 'safe [auth_or_config]', diagnostic: { key_present: true, failure_category: 'auth_or_config' } })

    const production = await handleGMRequest(new Request('https://example.test/api/gm', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { kind: 'free-action', text: '통신 상태를 확인한다' }, checkpoint: initial }),
    }), unavailable, 'production')
    expect(await production.json()).toEqual({ status: 'unavailable', message: 'safe' })
  })

  it('rejects malformed backend proposal before it reaches the browser engine', async () => {
    const initial = createSyntheticPublicRuntimeFixture()
    const malformed = new MockProvider(() => ({ status: 'proposal', proposal: { actions: 'bad' } }))
    const response = await handleGMRequest(new Request('https://example.test/api/gm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { kind: 'numbered-choice', choice_id: 1 }, checkpoint: initial }),
    }), malformed)

    expect(response.status).toBe(502)
    const payload = await response.json() as { status: string }
    expect(payload.status).toBe('unavailable')
  })

  it('rejects malformed request and refuses real Canon checkpoint on synthetic backend', async () => {
    const malformed = await handleGMRequest(new Request('https://example.test/api/gm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { kind: 'free-action', text: '' }, checkpoint: {} }),
    }))
    expect(malformed.status).toBe(400)

    const checkpoint = { ...createSyntheticPublicRuntimeFixture(), source_kind: 'canon-v2' as const }
    const canonAttempt = await handleGMRequest(new Request('https://example.test/api/gm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { kind: 'numbered-choice', choice_id: 1 }, checkpoint }),
    }))
    expect(canonAttempt.status).toBe(503)
  })
})
