import { describe, expect, it } from 'vitest'
import { hasPublishedWorldWiki, publishedWorldWikiIndex } from './worldWikiIndexData'
import { wikiCharacterIndex, wikiLocationIndex, wikiEventIndex } from './wikiDocument'

describe('world Wiki Chronicle boundary', () => {
  it('uses only the currently verified C03 world Graph', () => {
    const current = publishedWorldWikiIndex('C03-AFTERFALL')
    expect(current).not.toBeNull()
    expect(current?.categories.map((group) => group.items.length)).toEqual([
      wikiCharacterIndex.length, wikiLocationIndex.length, wikiEventIndex.length,
    ])
    expect(current?.recent.length).toBeGreaterThan(0)
    expect(current?.recent.every((document) => document.chronicleId === 'C03-AFTERFALL')).toBe(true)
  })

  it('does not invent C01, C02 or future C04 world records', () => {
    for (const id of ['C01-HAN-JUNHO', 'C02-STRONGHOLD', 'C04-NEW-WORLD']) {
      expect(hasPublishedWorldWiki(id)).toBe(false)
      expect(publishedWorldWikiIndex(id)).toBeNull()
    }
  })
})
