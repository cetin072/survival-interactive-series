import { describe, expect, it } from 'vitest'
import { buildAndroidChatGptIntent, isAndroidUserAgent, normalizeChatGptUrl } from './PlayBridge'

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

  it('builds an Android intent targeting the official ChatGPT package with web fallback', () => {
    const intent = buildAndroidChatGptIntent('https://chatgpt.com/c/example?foo=bar')

    expect(intent).toContain('intent://chatgpt.com/c/example?foo=bar#Intent;scheme=https;')
    expect(intent).toContain('package=com.openai.chatgpt;')
    expect(intent).toContain('S.browser_fallback_url=https%3A%2F%2Fchatgpt.com%2Fc%2Fexample%3Ffoo%3Dbar;')
  })
})
