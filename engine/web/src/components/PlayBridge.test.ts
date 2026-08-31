import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAndroidChatGptIntent, CHAT_URL_STORAGE_KEY, isAndroidUserAgent, normalizeChatGptUrl, PlayBridge } from './PlayBridge'

function renderPlayBridge(userAgent: string, savedUrl: string | null = null): string {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => key === CHAT_URL_STORAGE_KEY ? savedUrl : null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
  })
  vi.stubGlobal('navigator', { userAgent })

  return renderToStaticMarkup(createElement(PlayBridge))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PlayBridge URL validation', () => {
  it('accepts ChatGPT conversation URLs', () => {
    expect(normalizeChatGptUrl('https://chatgpt.com/c/example')).toBe('https://chatgpt.com/c/example')
  })

  it('rejects non-ChatGPT hosts and non-https URLs', () => {
    expect(normalizeChatGptUrl('https://example.com/c/example')).toBeNull()
    expect(normalizeChatGptUrl('http://chatgpt.com/c/example')).toBeNull()
  })

  it('rejects malformed values', () => {
    expect(normalizeChatGptUrl('not-a-url')).toBeNull()
  })
})

describe('Android ChatGPT app bridge', () => {
  it('detects Android user agents', () => {
    expect(isAndroidUserAgent('Mozilla/5.0 (Linux; Android 15; SM-S938N)')).toBe(true)
    expect(isAndroidUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
  })

  it('builds an Android intent targeting the official ChatGPT package without browser fallback', () => {
    const intent = buildAndroidChatGptIntent('https://chatgpt.com/c/example?foo=bar')

    expect(intent).toContain('intent://chatgpt.com/c/example?foo=bar#Intent;scheme=https;')
    expect(intent).toContain('package=com.openai.chatgpt;')
    expect(intent).not.toContain('browser_fallback_url')
  })
})

describe('PlayBridge rendering', () => {
  it('always renders a ChatGPT entry area when localStorage is empty', () => {
    const html = renderPlayBridge('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')

    expect(html).toContain('aria-label="게임 시작"')
    expect(html).toContain('CHATGPT 열기')
    expect(html).toContain('href="https://chatgpt.com/"')
  })

  it('renders an Android app launch link without a browser fallback', () => {
    const html = renderPlayBridge('Mozilla/5.0 (Linux; Android 15; SM-S938N)')

    expect(html).toContain('CHATGPT 앱 열기')
    expect(html).toContain('href="intent://chatgpt.com/#Intent;scheme=https;package=com.openai.chatgpt;end"')
    expect(html).not.toContain('browser_fallback_url')
  })

  it('keeps the entry link when a saved season URL is present', () => {
    const html = renderPlayBridge(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'https://chatgpt.com/c/season-06',
    )

    expect(html).toContain('PLAY IN CHATGPT')
    expect(html).toContain('href="https://chatgpt.com/c/season-06"')
  })
})
