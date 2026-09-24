import { describe, expect, it } from 'vitest'
import { activeChronicle, transcriptParts } from './transcriptData'

describe('C03 public transcript catalog', () => {
  it('keeps every reader record inside the active C03 AFTERFALL namespace', () => {
    expect(activeChronicle.id).toBe('C03-AFTERFALL')
    expect(transcriptParts.every((part) => part.chronicleId === activeChronicle.id && part.worldlineId === 'AFTERFALL')).toBe(true)
  })

  it('marks unverified S02 history as a gap rather than supplying invented dialogue', () => {
    const gap = transcriptParts.find((part) => part.id === 'c03-s02-missing')
    expect(gap).toMatchObject({ status: 'missing_transcript', sourceVerified: true })
    expect(gap?.content).toBeUndefined()
  })

  it('only renders sourced, non-empty records as verified transcript', () => {
    const verified = transcriptParts.filter((part) => part.status === 'verified_transcript')
    expect(verified).toHaveLength(10)
    expect(verified.every((part) => part.source.startsWith('seasons_v2/') && Boolean(part.content?.trim()))).toBe(true)
  })
})
