import { describe, expect, it } from 'vitest'
import { messagesFromRaw, selectInitialTranscriptPart } from './RawTranscriptReader'
import { transcriptPartsFor } from './transcriptData'

describe('raw transcript reader', () => {
  it('renders both historical ## headers and C03 S02 ### headers as public messages', () => {
    const c03SessionOne = transcriptPartsFor('C03-AFTERFALL').find((part) => part.id === 'c03-s02-session-001-001')
    const messages = messagesFromRaw(c03SessionOne?.content ?? '')

    expect(messages[0]).toMatchObject({ role: 'player', label: '플레이어의 선택' })
    expect(messages.filter((message) => message.role === 'gm').length).toBeGreaterThan(1)
  })

  it('selects the routed or restored transcript before the first render', () => {
    const parts = transcriptPartsFor('C03-AFTERFALL')
    expect(selectInitialTranscriptPart(parts, 'c03-s02-session-001-002', 'c03-s01-001')?.id).toBe('c03-s02-session-001-002')
    expect(selectInitialTranscriptPart(parts, undefined, 'c03-s02-session-001-002')?.id).toBe('c03-s02-session-001-002')
    expect(selectInitialTranscriptPart(parts, undefined, 'not-a-part')?.id).toBe(parts[0]?.id)
  })
})
