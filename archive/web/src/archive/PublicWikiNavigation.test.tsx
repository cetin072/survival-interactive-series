import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArchiveApp } from './ArchiveApp'

function renderRoute(path: string) {
  vi.stubGlobal('window', {
    location: new URL(path, 'https://archive.example'),
    localStorage: { getItem: () => null },
  })
  return renderToStaticMarkup(createElement(ArchiveApp))
}

afterEach(() => vi.unstubAllGlobals())

describe('public Wiki navigation', () => {
  it('shows the Wiki home at root and sends each top menu item to its own route', () => {
    const markup = renderRoute('/')
    expect(markup).toContain('생존 이야기를 읽고')
    expect(markup).toContain('href="/" aria-label="생존일기 Wiki 홈"')
    expect(markup).toContain('href="/?view=story">이야기</a>')
    expect(markup).toContain('href="/knowledge/">생존 지식</a>')
    expect(markup).toContain('href="/?view=tools">자료실</a>')
    expect(markup).toContain('id="wiki-knowledge-title">최근 생존 지식</h2><a href="/knowledge/">전체 보기</a>')
    expect(markup).not.toContain('archive-header')
  })

  it('shows the Wiki story list with existing Chronicles and Reader links', () => {
    const markup = renderRoute('/?view=story')
    expect(markup).toContain('wiki-topbar')
    expect(markup).toContain('전체 생존기 목록')
    expect(markup).toContain('한준호의 생존기')
    expect(markup).toContain('박도현의 생존기')
    expect(markup).toContain('서진우의 생존기')
    expect(markup).toContain('이야기 읽기')
    expect(markup).toContain('생존기 보기')
    expect(markup).toContain('href="/?view=story&amp;chronicle=C03-AFTERFALL"')
    expect(markup).not.toContain('archive-header')
  })

  it('shows the tools page in the Wiki shell', () => {
    const markup = renderRoute('/?view=tools')
    expect(markup).toContain('wiki-topbar')
    expect(markup).toContain('생존 도구')
    expect(markup).toContain('PDF 자료')
    expect(markup).toContain('XLSX 관리표')
    expect(markup).toContain('체크리스트')
    expect(markup).not.toContain('archive-header')
  })

  it('keeps the legacy media URL in the Wiki shell without a Media top menu item', () => {
    const markup = renderRoute('/?view=media')
    expect(markup).toContain('wiki-topbar')
    expect(markup).toContain('미디어 Archive')
    expect(markup).toContain('웹툰 · 교육')
    expect(markup.match(/<nav aria-label="공용 메뉴">.*?<\/nav>/)?.[0]).not.toContain('Media')
    expect(markup).not.toContain('archive-header')
  })

  it('keeps the legacy Knowledge entry as a link to its canonical destination', () => {
    const markup = renderRoute('/?view=knowledge-preview')
    expect(markup).toContain('정식 페이지로 이동')
    expect(markup).toContain('href="/knowledge/"')
    expect(markup).not.toContain('archive-header')
  })
})