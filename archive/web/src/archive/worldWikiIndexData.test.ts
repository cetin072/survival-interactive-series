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

  it('does not invent unbuilt or future world records', () => {
    for (const id of ['C02-STRONGHOLD', 'C04-NEW-WORLD']) {
      expect(hasPublishedWorldWiki(id)).toBe(false)
      expect(publishedWorldWikiIndex(id)).toBeNull()
    }
  })
  it('uses source-bound C01 candidate documents without C03 fallback', () => {
    const world = publishedWorldWikiIndex('C01-HAN-JUNHO')!
    expect(hasPublishedWorldWiki('C01-HAN-JUNHO')).toBe(true)
    expect(world.categories[0].items.map((item) => item.id)).toContain('char-junho')
    expect(world.categories.flatMap((group) => group.items).map((item) => item.id)).not.toContain('char-jinwoo')
    expect(world.recent.every((document) => document.chronicleId === 'C01-HAN-JUNHO'
      && document.anchor.saveVersion === undefined && document.sources.length > 0)).toBe(true)
  })
})
