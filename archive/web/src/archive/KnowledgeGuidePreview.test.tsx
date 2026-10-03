import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KnowledgeGuidePreview } from './KnowledgeGuidePreview'
import { archiveRouteUrl, parseArchiveRoute } from './readerNavigation'

describe('Knowledge practical guide preview', () => {
  it('renders K-002 as a practical guide rather than a Wiki document', () => {
    const markup = renderToStaticMarkup(createElement(KnowledgeGuidePreview, { briefId: 'K-002' }))

    expect(markup).toContain('비상용품은 어떻게 목록화하고 점검하면 좋은가')
    expect(markup).toContain('한눈에 보기')
    expect(markup).toContain('핵심 요약')
    expect(markup).toContain('일반 준비 정보')
    expect(markup).toContain('처음에는 작게 시작해도 됩니다')
    expect(markup).toContain('주의')
    expect(markup).toContain('비상용품·재고 관리표 v1')
    expect(markup).toContain('survival-diary-emergency-inventory-v1.xlsx')
    expect(markup).toContain('근거와 출처')
    expect(markup).toContain('국민안전24')
    expect(markup).toContain('CDC')

    expect(markup).not.toContain('Graph Explorer')
    expect(markup).not.toContain('RAW Reader')
    expect(markup).not.toContain('risk_level')
  })

  it('roundtrips the isolated Knowledge preview route', () => {
    const route = parseArchiveRoute('?view=knowledge-preview&brief=K-002')
    expect(route).toMatchObject({ view: 'knowledge-preview', briefId: 'K-002' })

    const url = archiveRouteUrl(route, 'https://archive.example/')
    expect(url.searchParams.get('view')).toBe('knowledge-preview')
    expect(url.searchParams.get('brief')).toBe('K-002')
  })
})
