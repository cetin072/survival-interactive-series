import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WikiShellPreview } from './WikiShellPreview'
import { archiveRouteUrl, parseArchiveRoute } from './readerNavigation'

describe('Wiki shell preview', () => {
  it('renders the structural wiki primitives without real content wiring', () => {
    const markup = renderToStaticMarkup(createElement(WikiShellPreview))
    expect(markup).toContain('인물, 장소, 사건, 생존 지식 검색')
    expect(markup).toContain('문서 정보')
    expect(markup).toContain('목차')
    expect(markup).toContain('1. 개요')
    expect(markup).toContain('2. 주요 행적')
    expect(markup).toContain('3. 관계')
    expect(markup).toContain('4. 삽화')
    expect(markup).toContain('5. 기록 근거')
    expect(markup).toContain('실제 데이터 연결 전')
    expect(markup).not.toContain('LIVE_RPG')
    expect(markup).not.toContain('RAW Reader')
    expect(markup).not.toContain('Graph Explorer')
  })

  it('keeps the preview on an isolated, non-primary route', () => {
    const route = parseArchiveRoute('?view=wiki-preview')
    expect(route).toMatchObject({ view: 'wiki-preview', chronicleId: 'C03-AFTERFALL' })
    const url = archiveRouteUrl(route, 'https://archive.example/')
    expect(url.searchParams.get('view')).toBe('wiki-preview')
  })
})
