import { describe, expect, it } from 'vitest'
import { HttpGMProvider } from './gmTransport'
import { createWebMvpTestSession } from './webMvpTestSession'

const liveUrl = process.env.LIVE_PREVIEW_GM_URL

describe('live preview browser-parity smoke', () => {
  it.skipIf(!liveUrl)('sends the exact WEB MVP checkpoint through HttpGMProvider', async () => {
    const checkpoint = createWebMvpTestSession()
    const provider = new HttpGMProvider(fetch, `${liveUrl}/api/gm`)
    const result = await provider.proposeTurn({
      input: { kind: 'numbered-choice', choice_id: 1 },
      checkpoint,
    })
    console.log('BROWSER_PARITY_SMOKE', JSON.stringify(result))
    expect(result.status).toBe('proposal')
    if (result.status === 'proposal') {
      expect(typeof result.proposal).toBe('object')
    }
  }, 30000)
})
