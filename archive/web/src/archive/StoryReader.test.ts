import { describe, expect, it } from 'vitest'
import { messagesFromRaw } from './StoryReader'
import { transcriptPartsFor } from './transcriptData'

describe('raw transcript reader', () => {
  it('renders both historical ## headers and C03 S02 ### headers as public messages', () => {
    const c03SessionOne = transcriptPartsFor('C03-AFTERFALL').find((part) => part.id === 'c03-s02-session-001-001')
    const messages = messagesFromRaw(c03SessionOne?.content ?? '')

    expect(messages[0]).toMatchObject({ role: 'player', label: '플레이어의 선택' })
    expect(messages.filter((message) => message.role === 'gm').length).toBeGreaterThan(1)
  })
})
