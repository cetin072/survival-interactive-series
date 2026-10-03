import { describe, expect, it } from 'vitest'
import { buildWikiDocument, buildWikiDocuments, wikiCharacterIndex, wikiCharacterNodeIds } from './wikiDocument'
import { wikiSectionPlan } from './WikiDocumentPage'

describe('WikiDocument compiler', () => {
  it('builds the approved 서진우 document from existing sources', () => {
    const document = buildWikiDocument('char-jinwoo')
    expect(document.title).toBe('서진우')
    expect(document.typeLabel).toBe('인물')
    expect(document.appearance).toContain('30대 초반')
    expect(document.visual?.public_path).toMatch(/^\/visual-assets\/[a-f0-9]{64}\.png$/)
    expect(document.relations.some((relation) => relation.title === '윤서진' && relation.label === '핵심 동료')).toBe(true)
    expect(document.sections.some((section) => section.id === 'jinwoo-role')).toBe(true)
    expect(document.transcriptPartIds).toContain('c03-s01-001')
    expect(document.metaRows).toEqual(expect.arrayContaining([
      { label: '유형', value: '인물' },
      { label: '생존기', value: 'C03 AFTERFALL' },
      { label: '상태', value: '활동 중' },
      { label: '소속', value: '핵심 4인' },
    ]))
  })

  it('uses one compiler contract for character, location and event nodes', () => {
    const documents = buildWikiDocuments(['char-jinwoo', 'loc-agri', 'event-fireline'])
    expect(documents.map((document) => document.typeLabel)).toEqual(['인물', '장소', '사건'])
    expect(documents[1].title).toBe('북유성 농업기술 실증단지')
    expect(documents[2].title).toBe('서쪽 대형화재 방어선')
    expect(documents.every((document) => document.anchor.gameTime.length > 0)).toBe(true)
    expect(documents.every((document) => document.metaRows.length >= 3)).toBe(true)
  })

  it('compiles every current Graph character through the same WikiDocument contract', () => {
    expect(wikiCharacterNodeIds).toHaveLength(19)
    expect(wikiCharacterIndex.some((item) => item.id === 'char-seojin' && item.title === '윤서진')).toBe(true)
    const documents = buildWikiDocuments(wikiCharacterNodeIds)
    expect(documents).toHaveLength(wikiCharacterNodeIds.length)
    expect(documents.every((document) => document.type === 'character')).toBe(true)
    expect(documents.every((document) => document.title.length > 0 && document.summary.length > 0)).toBe(true)
    expect(documents.every((document) => document.metaRows.some((row) => row.label === '생존기'))).toBe(true)
  })

  it('omits empty optional sections instead of fabricating content', () => {
    const location = buildWikiDocument('loc-agri')
    const plan = wikiSectionPlan(location)
    if (!location.appearance) expect(plan.some((section) => section.kind === 'appearance')).toBe(false)
    if (!location.visual) expect(plan.some((section) => section.kind === 'visuals')).toBe(false)
    expect(plan[0]).toMatchObject({ kind: 'overview', label: '개요' })
    expect(plan.at(-1)).toMatchObject({ kind: 'sources', label: '관련 이야기 · 기록 근거' })
  })

  it('fails closed for an unknown node rather than inventing a Wiki document', () => {
    expect(() => buildWikiDocument('missing-node')).toThrow(/Wiki source record missing/)
  })
})
