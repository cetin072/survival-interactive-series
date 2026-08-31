import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BgmControl, BGM_ENABLED_STORAGE_KEY, BGM_VOLUME_STORAGE_KEY, DEFAULT_BGM_VOLUME, storedBgmEnabled, storedBgmVolume } from './BgmControl'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BGM preferences', () => {
  it('uses the requested 25% volume by default and rejects invalid values', () => {
    expect(storedBgmVolume(null)).toBe(DEFAULT_BGM_VOLUME)
    expect(storedBgmVolume('0.6')).toBe(0.6)
    expect(storedBgmVolume('1.2')).toBe(DEFAULT_BGM_VOLUME)
  })

  it('only treats an explicit true value as enabled', () => {
    expect(storedBgmEnabled('true')).toBe(true)
    expect(storedBgmEnabled('false')).toBe(false)
    expect(storedBgmEnabled(null)).toBe(false)
  })
})

describe('BgmControl rendering', () => {
  it('renders a looped local MP3 and a paused control without invoking autoplay', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => key === BGM_VOLUME_STORAGE_KEY ? '0.25' : key === BGM_ENABLED_STORAGE_KEY ? 'true' : null,
        setItem: vi.fn(),
      },
    })

    const html = renderToStaticMarkup(createElement(BgmControl))

    expect(html).toContain('src="/audio/cold-night-small-fire.mp3"')
    expect(html).toContain('loop=""')
    expect(html).toContain('preload="metadata"')
    expect(html).toContain('BGM ▶')
  })
})
