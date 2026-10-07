import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KnowledgeGuideLibraryPreview } from './KnowledgeGuideLibraryPreview'
import { KnowledgeGuidePage } from './KnowledgeGuidePage'
import { KnowledgeGuidePreview } from './KnowledgeGuidePreview'
import { publishedKnowledgeGuides } from './knowledgeGuide'
import { archiveRouteUrl, parseArchiveRoute } from './readerNavigation'
import { WikiHomePreview } from './WikiHomePreview'
import { searchPublicArchive } from './wikiSearch'

describe('Knowledge practical guide rollout', () => {
  it('renders a Knowledge library when no brief is selected', () => {
    const markup = renderToStaticMarkup(createElement(KnowledgeGuideLibraryPreview))
    expect(markup).toContain('생존 지식')
    expect(markup).toContain('공개 가이드')
    for (const guide of publishedKnowledgeGuides) {
      expect(markup).toContain(guide.title)
      expect(markup).toContain('/knowledge/' + guide.slug + '/')
    }
    expect(markup).not.toContain('K-004')
    expect(markup).not.toContain('K-005')
  })

  it('renders every PUBLISHED brief through the same practical Guide page', () => {
    for (const guide of publishedKnowledgeGuides) {
      const markup = renderToStaticMarkup(createElement(KnowledgeGuidePage, { guide }))
      expect(markup).toContain(guide.title)
      expect(markup).toContain('한눈에 보기')
      expect(markup).toContain('근거와 출처')
      expect(markup).toContain(guide.scope)
      expect(markup).not.toContain('risk_level')
    }
  })

  it('links home cards, search results, library and related knowledge to canonical paths', () => {
    const home = renderToStaticMarkup(createElement(WikiHomePreview))
    const library = renderToStaticMarkup(createElement(KnowledgeGuideLibraryPreview))
    for (const guide of publishedKnowledgeGuides) {
      const href = '/knowledge/' + guide.slug + '/'
      expect(library).toContain('href="' + href + '"')
      expect(searchPublicArchive(guide.id).find((item) => item.id === 'knowledge:' + guide.id)?.href).toBe(href)
      const page = renderToStaticMarkup(createElement(KnowledgeGuidePage, { guide }))
      for (const related of guide.detail.related_briefs) expect(page).toContain('href="/knowledge/' + related.slug + '/"')
      expect(page).not.toContain('knowledge-preview')
    }
    for (const guide of publishedKnowledgeGuides.slice(0, 5)) expect(home).toContain('href="/knowledge/' + guide.slug + '/"')
    expect(home).not.toContain('knowledge-preview')
    expect(library).not.toContain('knowledge-preview')
  })

  it('legacy detail links expose a canonical destination without a duplicate article', () => {
    const markup = renderToStaticMarkup(createElement(KnowledgeGuidePreview, { briefId: 'K-002' }))
    expect(markup).toContain('href="/knowledge/emergency-supplies-inventory/"')
    expect(markup).not.toContain('<article')
  })

  it('renders K-002 with action blocks, caution and the downloadable XLSX', () => {
    const markup = renderToStaticMarkup(createElement(KnowledgeGuidePage, { guide: publishedKnowledgeGuides.find((item) => item.id === 'K-002')! }))
    expect(markup).toContain('비상용품은 어떻게 목록화하고 점검하면 좋은가')
    expect(markup).toContain('핵심 요약')
    expect(markup).toContain('일반 준비 정보')
    expect(markup).toContain('처음에는 작게 시작해도 됩니다')
    expect(markup).toContain('주의')
    expect(markup).toContain('비상용품·재고 관리표 v1')
    expect(markup).toContain('survival-diary-emergency-inventory-v1.xlsx')
    expect(markup).toContain('국민안전24')
    expect(markup).toContain('CDC')
  })

  it('renders unordered lists used by other published Guides', () => {
    const markup = renderToStaticMarkup(createElement(KnowledgeGuidePage, { guide: publishedKnowledgeGuides.find((item) => item.id === 'K-007')! }))
    expect(markup).toContain('knowledge-guide-list')
    expect(markup).toContain('정보 상태 인계')
  })

  it('fails closed in the UI for READY or unknown brief IDs', () => {
    const readyMarkup = renderToStaticMarkup(createElement(KnowledgeGuidePreview, { briefId: 'K-004' }))
    expect(readyMarkup).toContain('아직 공개되지 않은 생존 지식입니다')
    expect(readyMarkup).not.toContain('공동체 비상 물자를 나눠 둘 때')

    const unknownMarkup = renderToStaticMarkup(createElement(KnowledgeGuidePreview, { briefId: 'K-999' }))
    expect(unknownMarkup).toContain('아직 공개되지 않은 생존 지식입니다')
  })

  it('roundtrips the Knowledge library and Guide routes', () => {
    expect(parseArchiveRoute('?view=knowledge-preview')).toMatchObject({ view: 'knowledge-preview', briefId: undefined })

    const route = parseArchiveRoute('?view=knowledge-preview&brief=K-002')
    expect(route).toMatchObject({ view: 'knowledge-preview', briefId: 'K-002' })

    const url = archiveRouteUrl(route, 'https://archive.example/')
    expect(url.searchParams.get('view')).toBe('knowledge-preview')
    expect(url.searchParams.get('brief')).toBe('K-002')
  })
})
