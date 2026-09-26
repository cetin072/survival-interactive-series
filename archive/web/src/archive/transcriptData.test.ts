import { describe, expect, it } from 'vitest'
import { archiveNodes } from './archiveData'
import { activeChronicle, chronicles, partitionChronicles, transcriptPartsFor } from './transcriptData'

describe('Chronicle-isolated public transcript catalog', () => {
  it('keeps the source-root to Chronicle mapping exact', () => {
    expect(chronicles.map(({ id, sourceRoot }) => [id, sourceRoot])).toEqual([
      ['C01-HAN-JUNHO', 'seasons_v2'],
      ['C02-STRONGHOLD', 'worldlines/STRONGHOLD'],
      ['C03-AFTERFALL', 'worldlines/AFTERFALL'],
    ])
    expect(transcriptPartsFor('C01-HAN-JUNHO').every((part) => part.source.startsWith('seasons_v2/'))).toBe(true)
    expect(transcriptPartsFor('C03-AFTERFALL').every((part) => part.source.startsWith('worldlines/AFTERFALL/'))).toBe(true)
  })

  it('publishes only C01 raw records that were verified, with the known S02 gap explicit', () => {
    const c01 = transcriptPartsFor('C01-HAN-JUNHO')
    expect(c01.filter((part) => part.status === 'verified_transcript')).toHaveLength(10)
    expect(c01.find((part) => part.id === 'c01-s02-missing')).toMatchObject({ status: 'missing_transcript', sourceVerified: true })
    expect(c01.filter((part) => part.status === 'verified_transcript').every((part) => Boolean(part.content?.trim()))).toBe(true)
  })

  it('publishes only verified C03 raw while retaining every known gap and session boundary', () => {
    expect(activeChronicle).toMatchObject({ id: 'C03-AFTERFALL', active: true, transcriptStatus: 'partial' })
    const c03 = transcriptPartsFor('C03-AFTERFALL')
    expect(c03).toHaveLength(31)
    expect(c03.filter((part) => part.status === 'verified_transcript')).toHaveLength(25)
    expect(c03.filter((part) => part.status === 'verified_fragment')).toMatchObject([
      { id: 'c03-s01-008', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_008.md' },
      { sessionId: 'SESSION_003', status: 'verified_fragment' },
      { sessionId: 'SESSION_004', status: 'verified_fragment' },
    ])
    expect(c03.filter((part) => part.status === 'missing_transcript').map((part) => part.id)).toEqual([
      'c03-s01-missing-before',
      'c03-s02-session-001-gap',
      'c03-s02-session-002-gap',
    ])
    expect(new Set(c03.filter((part) => part.seasonId === 'S02').map((part) => part.sessionId))).toEqual(new Set([
      'SESSION_001', 'SESSION_002', 'SESSION_003', 'SESSION_004', 'SESSION_005',
      'SESSION_006', 'SESSION_007', 'SESSION_008', 'SESSION_009',
    ]))
    expect(c03.find((part) => part.sessionId === 'SESSION_001' && part.number === 1)?.range).toBe('2026-11-22 industrial-fire response through archive-request cutoff')
    expect(c03.find((part) => part.sessionId === 'SESSION_003')?.range).toBe('2027-01-16 09:28 → 2027-01-16 09:28')
    expect(c03.find((part) => part.sessionId === 'SESSION_007')?.range).toBe('2027-02-06 21:15 → 2027-02-07 13:40')
    expect(c03.filter((part) => ['SESSION_005', 'SESSION_006', 'SESSION_007', 'SESSION_008', 'SESSION_009'].includes(part.sessionId ?? '')).every((part) => part.status === 'verified_transcript')).toBe(true)
    expect(c03.filter((part) => part.status !== 'missing_transcript').every((part) => Boolean(part.content?.trim()))).toBe(true)
  })

  it('derives current and past shelves from the registry instead of a fixed Chronicle id', () => {
    const promotedRegistry = [
      ...chronicles.map((chronicle) => ({ ...chronicle, active: false })),
      { ...activeChronicle, id: 'C04-NEW', label: 'C04 NEW · 신규 주인공', worldlineId: 'NEW', protagonist: '신규 주인공', active: true },
    ]
    const partition = partitionChronicles(promotedRegistry)
    expect(partition.active.id).toBe('C04-NEW')
    expect(partition.past.map((chronicle) => chronicle.id)).toContain('C03-AFTERFALL')
    expect(() => partitionChronicles(promotedRegistry.map((chronicle) => ({ ...chronicle, active: true })))).toThrow('exactly one active')
  })

  it('does not attach C01 transcript records to C03 graph entities', () => {
    const c01 = transcriptPartsFor('C01-HAN-JUNHO')
    const c03EntityIds = new Set(archiveNodes.map((node) => node.id))
    expect(c01.every((part) => part.relatedNodeIds.length === 0)).toBe(true)
    expect(c01.flatMap((part) => part.relatedNodeIds).some((id) => c03EntityIds.has(id))).toBe(false)
  })

  it('publishes recovered C02 source-room transcripts while keeping gaps and legacy fragments explicit', () => {
    const c02 = transcriptPartsFor('C02-STRONGHOLD')
    expect(chronicles.find((chronicle) => chronicle.id === 'C02-STRONGHOLD')).toMatchObject({ transcriptStatus: 'partial' })
    expect(c02).toHaveLength(32)
    expect(c02.filter((part) => part.status === 'verified_transcript')).toHaveLength(24)
    expect(c02.filter((part) => part.status === 'missing_transcript')).toHaveLength(5)
    expect(c02.filter((part) => part.status === 'verified_fragment')).toHaveLength(3)
    expect(new Set(c02.filter((part) => part.status === 'verified_transcript').map((part) => part.sessionId)).size).toBe(5)
    expect(c02.filter((part) => part.status === 'verified_transcript').every((part) => part.source.startsWith('worldlines/STRONGHOLD/raw_transcript/SESSION_') && Boolean(part.content?.trim()))).toBe(true)
    expect(c02.filter((part) => part.status === 'verified_fragment').every((part) => part.contentFormat === 'raw_fragment' && Boolean(part.content?.trim()))).toBe(true)
    expect(c02.every((part) => part.relatedNodeIds.length === 0)).toBe(true)
  })
})
