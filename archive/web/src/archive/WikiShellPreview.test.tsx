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

  it('renders location and event documents through the same Wiki shell', () => {
    const locationMarkup = renderToStaticMarkup(createElement(WikiShellPreview, { nodeId: 'loc-agri' }))
    expect(locationMarkup).toContain('북유성 농업기술 실증단지')
    expect(locationMarkup).toContain('물·농업·종자·장기생산 거점')
    expect(locationMarkup).toContain('>장소<')
    expect(locationMarkup).not.toContain('외형</a>')

    const eventMarkup = renderToStaticMarkup(createElement(WikiShellPreview, { nodeId: 'event-fireline' }))
    expect(eventMarkup).toContain('서쪽 대형화재 방어선')
    expect(eventMarkup).toContain('2026-11-22 ~ 11-23')
    expect(eventMarkup).toContain('>사건<')
  })

  it('keeps supported internal relations inside Wiki and references on the legacy Archive', () => {
    const markup = renderToStaticMarkup(createElement(WikiShellPreview, { nodeId: 'char-jinwoo' }))
    expect(markup).toContain('view=wiki-preview&amp;node=char-seojin')
    expect(markup).toContain('view=wiki-preview&amp;node=event-guild-warehouse-option')
  })

  it('keeps the real document on the isolated preview route until approval', () => {
    const route = parseArchiveRoute('?view=wiki-preview')
    expect(route).toMatchObject({ view: 'wiki-preview', chronicleId: 'C03-AFTERFALL' })
    const url = archiveRouteUrl(route, 'https://archive.example/')
    expect(url.searchParams.get('view')).toBe('wiki-preview')
  })
})
