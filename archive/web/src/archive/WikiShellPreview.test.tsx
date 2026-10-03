import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WikiShellPreview } from './WikiShellPreview'
import { archiveRouteUrl, parseArchiveRoute } from './readerNavigation'

describe('Wiki 서진우 vertical slice', () => {
  it('renders real existing Archive data inside the approved Wiki shell', () => {
    const markup = renderToStaticMarkup(createElement(WikiShellPreview))

    expect(markup).toContain('서진우')
    expect(markup).toContain('응급실 간호사')
    expect(markup).toContain('핵심 4인')
    expect(markup).toContain('활동 중')
    expect(markup).toContain('30대 초반')
    expect(markup).toContain('외부정찰·응급의료·정보·거점 연결')
    expect(markup).toContain('Season 1의 변화')
    expect(markup).toContain('Season 2의 변화')
    expect(markup).toContain('핵심 동료')
    expect(markup).toContain('윤서진')
    expect(markup).toContain('장태훈')
    expect(markup).toContain('/visual-assets/')
    expect(markup).toContain('관련 이야기 · 기록 근거')
    expect(markup).toContain('href="#wiki-overview">개요</a>')
    expect(markup).not.toContain('>1. 개요</a>')
    expect(markup).toContain('c03-s01-001')

    expect(markup).not.toContain('실제 데이터 연결 전')
    expect(markup).not.toContain('LIVE_RPG')
    expect(markup).not.toContain('Graph Explorer')
    expect(markup).not.toContain('RAW Reader')
  })

  it('keeps the real document on the isolated preview route until approval', () => {
    const route = parseArchiveRoute('?view=wiki-preview')
    expect(route).toMatchObject({ view: 'wiki-preview', chronicleId: 'C03-AFTERFALL' })
    const url = archiveRouteUrl(route, 'https://archive.example/')
    expect(url.searchParams.get('view')).toBe('wiki-preview')
  })
})
