import { describe, expect, it } from 'vitest'
import { archiveNodes } from './archiveData'
import { activeChronicle, chronicles, transcriptParts, transcriptPartsFor } from './transcriptData'

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

  it('does not treat C03 Canon as transcript while AFTERFALL raw backfill is unavailable', () => {
    expect(activeChronicle).toMatchObject({ id: 'C03-AFTERFALL', isActive: true, transcriptStatus: 'backfill_required' })
    const c03 = transcriptPartsFor('C03-AFTERFALL')
    expect(c03).toHaveLength(1)
    expect(c03[0]).toMatchObject({ id: 'c03-s01-missing', status: 'missing_transcript' })
    expect(c03[0]?.content).toBeUndefined()
  })

  it('does not attach C01 transcript records to C03 graph entities', () => {
    const c01 = transcriptPartsFor('C01-HAN-JUNHO')
    const c03EntityIds = new Set(archiveNodes.map((node) => node.id))
    expect(c01.every((part) => part.relatedNodeIds.length === 0)).toBe(true)
    expect(c01.flatMap((part) => part.relatedNodeIds).some((id) => c03EntityIds.has(id))).toBe(false)
  })

  it('publishes C02 literal USER fragments without promoting them to complete transcript', () => {
    const c02 = transcriptPartsFor('C02-STRONGHOLD')
    expect(chronicles.find((chronicle) => chronicle.id === 'C02-STRONGHOLD')).toMatchObject({ transcriptStatus: 'partial' })
    expect(c02).toHaveLength(3)
    expect(c02.every((part) => part.status === 'verified_fragment' && part.source.startsWith('worldlines/STRONGHOLD/raw_transcript/') && part.contentFormat === 'raw_fragment' && Boolean(part.content?.trim()))).toBe(true)
    expect(c02.every((part) => part.relatedNodeIds.length === 0)).toBe(true)
  })
})
