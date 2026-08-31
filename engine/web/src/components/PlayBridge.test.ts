import { describe, expect, it } from 'vitest'
import { normalizeChatGptUrl } from './PlayBridge'

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
