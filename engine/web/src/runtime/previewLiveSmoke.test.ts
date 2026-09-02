import { describe, expect, it } from 'vitest'
import { createWebMvpTestSession } from './webMvpTestSession'

describe('linked Netlify deploy-preview live GM diagnostic', () => {
  it('returns a live proposal for a free action', async () => {
    const base = process.env.PREVIEW_GM_URL
    expect(base).toBeTruthy()

    const response = await fetch(`${base}/api/gm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { kind: 'free-action', text: '아내에게 현재 상황을 물어본다' },
        checkpoint: createWebMvpTestSession(),
      }),
    })
    const payload = await response.json() as {
      status?: string
      message?: string
      diagnostic?: { key_present?: boolean; failure_category?: string; response_fingerprint?: { upstream_provider?: string } }
      proposal?: { actions?: unknown[]; family_reactions?: unknown[]; next_choices?: unknown[] }
    }

    console.log('LIVE_GM_DIAG', JSON.stringify({
      http: response.status,
      status: payload.status,
      message: payload.message,
      key_present: payload.diagnostic?.key_present,
      failure_category: payload.diagnostic?.failure_category,
      upstream_provider: payload.diagnostic?.response_fingerprint?.upstream_provider,
      actions: payload.proposal?.actions?.length,
      family_reactions: payload.proposal?.family_reactions?.length,
      next_choices: payload.proposal?.next_choices?.length,
    }))

    expect(response.status).toBe(200)
    expect(payload.status).toBe('proposal')
  }, 30000)
})
