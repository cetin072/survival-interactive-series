import { describe, expect, it } from 'vitest'
import { publicSearchIndex, searchPublicArchive, searchResultGroups } from './wikiSearch'

describe('unified public Wiki search', () => {
  it('searches current Wiki documents from the Graph index', () => {
    const results = searchPublicArchive('서진우')
    expect(results[0]).toMatchObject({ kind: 'wiki', title: '서진우' })
    expect(results.some((entry) => entry.kind === 'resource' && entry.title.includes('서진우'))).toBe(true)
  })

  it('searches only published Knowledge briefs', () => {
    const results = searchPublicArchive('비상용품')
    expect(results.some((entry) => entry.kind === 'knowledge' && entry.id === 'knowledge:K-002')).toBe(true)
    expect(publicSearchIndex.some((entry) => entry.id === 'knowledge:K-004')).toBe(false)
    expect(publicSearchIndex.some((entry) => entry.id === 'knowledge:K-005')).toBe(false)
  })

  it('finds world events and groups mixed result types', () => {
    const results = searchPublicArchive('화재')
    expect(results.some((entry) => entry.kind === 'wiki' && entry.title === '서쪽 대형화재 방어선')).toBe(true)

    const groups = searchResultGroups(searchPublicArchive('서진우'))
    expect(groups.wiki.length).toBeGreaterThan(0)
    expect(groups.resource.length).toBeGreaterThan(0)
  })

  it('returns no fake result for empty queries', () => {
    expect(searchPublicArchive('   ')).toEqual([])
  })
})
