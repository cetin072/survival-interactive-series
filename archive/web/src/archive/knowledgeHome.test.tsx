import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildKnowledgeGuide, knowledgeHref, publishedKnowledgeGuides } from './knowledgeGuide'
import { selectHomeKnowledge } from './knowledgeHome'
import { WikiHomePreview } from './WikiHomePreview'
import { chronicleRegistry } from './chronicleRegistry'

describe('Knowledge home public data', () => {
  it('uses the editorial order, real dates and distinct recent articles', () => {
    const home = selectHomeKnowledge()
    expect(home.featured.map((guide) => guide.id)).toEqual(['K-014', 'K-002', 'K-003'])
    expect(home.missingFeaturedIds).toEqual([])
    const recent = publishedKnowledgeGuides.filter((guide) => !home.featured.includes(guide))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id)).slice(0, 4)
    expect(home.recent).toEqual(recent)
    expect(new Set([...home.featured, ...home.recent].map((guide) => guide.id)).size).toBe(home.featured.length + home.recent.length)
    const html = renderToStaticMarkup(createElement(WikiHomePreview))
    for (const guide of [...home.featured, ...home.recent]) {
      expect(html).toContain('href="' + knowledgeHref(guide) + '"')
      expect(html).toContain(guide.label)
    }
    expect(html.indexOf('아파트 정전 범위 확인')).toBeLessThan(html.indexOf('비상용품 관리'))
    expect(html.indexOf('비상용품 관리')).toBeLessThan(html.indexOf('가족 비상연락'))
    expect(html).toContain('공식 안내 우선')
    expect(html).not.toContain('안전 보장')
    for (const category of ['household', 'information', 'evacuation', 'community']) {
      expect(html).toContain('/knowledge/#knowledge-' + category)
    }
    expect(html).toContain('주제로 찾아보기')
  })

  it('does not fill missing featured positions with unpublished guides or their tools', () => {
    const privateGuide = { ...buildKnowledgeGuide('K-014'), status: 'READY', summary: 'PRIVATE_READY_SUMMARY', tools: buildKnowledgeGuide('K-002').tools }
    const home = selectHomeKnowledge([privateGuide, buildKnowledgeGuide('K-003')])
    expect(home.featured.map((guide) => guide.id)).toEqual(['K-003'])
    expect(home.missingFeaturedIds).toEqual(['K-014', 'K-002'])
    expect(home.recent).toEqual([])
    expect(home.resource).toBeUndefined()
    const html = renderToStaticMarkup(createElement(WikiHomePreview, { knowledge: home }))
    expect(html).not.toContain('PRIVATE_READY_SUMMARY')
    expect(html).not.toContain('/knowledge/apartment-power-outage-scope-check/')
    expect(html).not.toContain('download=')
    expect(html).not.toContain('바로 쓰는 자료')
  })

  it('automatically adds new public articles with deterministic ties and limits', () => {
    const base = buildKnowledgeGuide('K-003')
    const guides = [...publishedKnowledgeGuides, ...['K-099', 'K-098'].map((id) => ({
      ...base, id, slug: id.toLowerCase(), publishedAt: '2099-01-01',
    }))]
    const home = selectHomeKnowledge(guides.reverse())
    expect(home.recent.map((guide) => guide.id).slice(0, 2)).toEqual(['K-098', 'K-099'])
    expect(home.recent).toHaveLength(4)
    expect(selectHomeKnowledge([{ ...base, id: 'K-100' }]).recent).toHaveLength(1)
  })

  it('reuses one available tool and renders an empty home without dead resource links', () => {
    const home = selectHomeKnowledge()
    expect(home.resource?.guide.id).toBe('K-002')
    expect(home.resource?.tool).toEqual(buildKnowledgeGuide('K-002').tools[0])
    const html = renderToStaticMarkup(createElement(WikiHomePreview))
    expect(html).toContain(home.resource!.tool.title)
    expect(html).toContain(home.resource!.tool.description)
    expect(html).toContain('href="' + home.resource!.tool.path + '" download=""')
    const empty = renderToStaticMarkup(createElement(WikiHomePreview, { knowledge: selectHomeKnowledge([]) }))
    expect(empty).toContain('먼저 읽어볼 지식')
    expect(empty).not.toContain('바로 쓰는 자료')
    const unavailable = selectHomeKnowledge([{ ...buildKnowledgeGuide('K-002'), tools: [{ ...home.resource!.tool, availability: 'PENDING' }] }])
    expect(unavailable.resource).toBeUndefined()
  })

  it('does not offer reading for planned or unavailable stories', () => {
    const planned = { ...chronicleRegistry[0], id: 'PLANNED-FIXTURE', title: '예정 작품', status: 'PLANNED' as const }
    const unavailable = { ...chronicleRegistry[1], readerAvailable: false }
    const html = renderToStaticMarkup(createElement(WikiHomePreview, { chronicles: [planned, unavailable] }))
    expect(html).toContain('예정 작품')
    expect(html).toContain('예정')
    expect(html).not.toContain('이야기 읽기')
    expect(html).not.toContain('chronicle=PLANNED')
  })
})
