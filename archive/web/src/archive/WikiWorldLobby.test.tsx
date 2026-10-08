import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WikiWorldLobby } from './WikiWorldLobby'
import { WikiShellPreview } from './WikiShellPreview'
import { chronicleRegistry } from './chronicleRegistry'
import { parseArchiveRoute, archiveRouteUrl } from './readerNavigation'
import { publicNavigation, currentPublicMenu } from './publicNavigation'
import { wikiLobbyHref } from './wikiLinks'

describe('shared world Wiki entrance', () => {
  it('uses the card entrance in both the public menu and route roundtrip without replacing root home', () => {
    expect(publicNavigation.find((item) => item.id === 'world')?.href).toBe(wikiLobbyHref)
    const route = parseArchiveRoute('?view=wiki-preview&page=worlds')
    expect(route).toMatchObject({ view: 'wiki-preview', page: 'worlds' })
    expect(archiveRouteUrl(route, 'https://example.com/').search).toBe('?view=wiki-preview&page=worlds')
    expect(currentPublicMenu('/', '?view=wiki-preview&page=worlds')).toBe('world')
    expect(parseArchiveRoute('')).toMatchObject({ view: 'wiki-preview', page: 'home' })
    expect(renderToStaticMarkup(createElement(WikiShellPreview))).toContain('일상과 비상상황에 필요한 생존 지식')
    expect(renderToStaticMarkup(createElement(WikiShellPreview, { page: 'worlds' }))).toContain('생존기별 인물·장소·사건과 이야기 속 기록을 찾아보세요.')
  })
  it('uses registry titles, statuses and actual Wiki/Reader destinations without image slots or nested links', () => {
    const html = renderToStaticMarkup(createElement(WikiWorldLobby))
    for (const item of chronicleRegistry) {
      expect(html).toContain(item.title)
      expect(html).toContain('주인공 · ' + item.protagonist)
      expect(html).toContain('/?view=story&amp;chronicle=' + item.id)
    }
    expect(html).toContain('page=world&amp;chronicle=C03-AFTERFALL')
    expect(html).toContain('완결')
    expect(html).toContain('진행 중')
    expect(html).not.toContain('<img')
    let anchorDepth = 0
    for (const tag of html.match(/<\/?a(?:\s[^>]*)?>/g) ?? []) {
      anchorDepth += tag.startsWith('</') ? -1 : 1
      expect(anchorDepth).toBeGreaterThanOrEqual(0)
      expect(anchorDepth).toBeLessThanOrEqual(1)
    }
    expect(anchorDepth).toBe(0)
    const planned = { ...chronicleRegistry[0], id: 'C04-FIXTURE', status: 'PLANNED' as const, readerAvailable: false }
    const empty = renderToStaticMarkup(createElement(WikiWorldLobby, { registry: [planned] }))
    expect(empty).toContain('예정')
    expect(empty).not.toContain('이야기 읽기')
    expect(empty).not.toContain('href="/?view=wiki-preview&amp;page=world&amp;chronicle=C04-FIXTURE"')
    expect(html).not.toContain('C04-FIXTURE')
  })
  it('pins bare historical nodes to C03 and fails closed for explicit invalid Chronicle/node pairs', () => {
    expect(parseArchiveRoute('?view=wiki-preview&node=char-jinwoo')).toMatchObject({ chronicleId: 'C03-AFTERFALL' })
    const invalid = parseArchiveRoute('?view=wiki-preview&page=world&chronicle=NO-WORLD')
    expect(invalid).toMatchObject({ chronicleId: 'NO-WORLD' })
    for (const props of [{ nodeId: 'char-jinwoo', chronicleId: 'C01-HAN-JUNHO' }, { nodeId: 'missing', chronicleId: 'C03-AFTERFALL' }, { page: 'world' as const, chronicleId: 'NO-WORLD' }]) {
      const html = renderToStaticMarkup(createElement(WikiShellPreview, props))
      expect(html).toContain('세계관 문서를 찾을 수 없습니다')
      expect(html).not.toContain('응급실 간호사')
    }
    const c03 = renderToStaticMarkup(createElement(WikiShellPreview, { nodeId: 'char-jinwoo' }))
    expect(c03).toContain('응급실 간호사')
  })
})
