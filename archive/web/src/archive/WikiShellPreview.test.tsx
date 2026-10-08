import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WikiShellPreview } from './WikiShellPreview'
import { wikiCharacterIndex, wikiEventIndex, wikiLocationIndex } from './wikiDocument'
import { archiveRouteUrl, parseArchiveRoute } from './readerNavigation'
import { WorldIndexSection } from './WikiWorldIndexPreview'

describe('Wiki staged public structure', () => {
  it('uses the Wiki home as the default preview entrance', () => {
    const markup = renderToStaticMarkup(createElement(WikiShellPreview))
    expect(markup).toContain('일상과 비상상황에 필요한 생존 지식')
    expect(markup).toContain('진행 중')
    expect(markup).toContain('서진우의 생존기')
    expect(markup).not.toContain('최근 세계관 기록')
    expect(markup).toContain('세계관 위키 탐색')
    expect(markup).toContain('최근 공개한 지식')
    expect(markup).toContain('생존기')
  })

  it('renders the C03 Chronicle index between home and documents', () => {
    const markup = renderToStaticMarkup(createElement(WikiShellPreview, {
      page: 'chronicle',
      chronicleId: 'C03-AFTERFALL',
    }))
    expect(markup).toContain('서진우의 생존기')
    expect(markup).toContain('서진우의 생존 기록')
    expect(markup).toContain('세계관')
    expect(markup).toContain('최근 기록')
    expect(markup).toContain('인물')
    expect(markup).toContain('장소')
    expect(markup).toContain('사건')
    expect(markup).toContain('인물 전체보기')
    expect(markup).toContain('장소 전체보기')
    expect(markup).toContain('사건 전체보기')
    expect(markup).toContain('page=world')
    expect(markup).toContain('이야기 읽기')
  })

  it('renders every public character location and event on the full world index', () => {
    const markup = renderToStaticMarkup(createElement(WikiShellPreview, {
      page: 'world',
      chronicleId: 'C03-AFTERFALL',
    }))

    expect(markup).toContain('세계관 전체보기')
    expect(markup).toContain('최근 세계관 기록')
    expect(markup).toContain('세계관 분류')
    expect(markup).toContain('생존기별 세계관')
    expect(markup).toContain('전체 세계관 문서')
    expect(markup).toContain(`인물 ${wikiCharacterIndex.length}`)
    expect(markup).toContain(`장소 ${wikiLocationIndex.length}`)
    expect(markup).toContain(`사건 ${wikiEventIndex.length}`)

    for (const item of [...wikiCharacterIndex, ...wikiLocationIndex, ...wikiEventIndex]) {
      expect(markup).toContain(item.title)
      expect(markup).toContain('node=' + item.id)
    }
  })

  it('shows six document links per category, with native details for the rest', () => {
    const markup = renderToStaticMarkup(createElement(WikiShellPreview, {
      page: 'world', chronicleId: 'C03-AFTERFALL',
    }))
    expect((markup.match(/class="wiki-world-index-disclosure"/g) ?? []).length).toBe(3)
    const categories = [
      ['characters', wikiCharacterIndex, '명'],
      ['locations', wikiLocationIndex, '곳'],
      ['events', wikiEventIndex, '건'],
    ] as const
    for (const [id, items, unit] of categories) {
      const section = markup.split('id="' + id + '" aria-label=')[1]?.split('</section>')[0] ?? ''
      const initiallyVisible = section.split('<details')[0]
      const collapsed = section.split('<details')[1] ?? ''
      expect((initiallyVisible.match(/href="\/\?view=wiki-preview&amp;node=/g) ?? []).length).toBe(6)
      expect(initiallyVisible).toContain(items[0].title)
      expect(initiallyVisible).not.toContain(items[6].title)
      expect(collapsed).toContain('나머지 ' + (items.length - 6) + unit + ' 더 보기')
      expect(collapsed).toContain('목록 접기')
      expect(collapsed).toContain(items[6].title)
    }
  })

  it('does not show an empty disclosure when a world category has six or fewer items', () => {
    const items = wikiCharacterIndex.slice(0, 5)
    const markup = renderToStaticMarkup(createElement(WorldIndexSection, {
      id: 'preview-five',
      title: '인물',
      countLabel: '명',
      items,
    }))
    expect(markup).not.toContain('wiki-world-index-disclosure')
    expect((markup.match(/href="\/\?view=wiki-preview&amp;node=/g) ?? []).length).toBe(5)
  })

  it('does not leak C03 wiki nodes into C01 or C02 world views', () => {
    for (const chronicleId of ['C01-HAN-JUNHO', 'C02-STRONGHOLD']) {
      const markup = renderToStaticMarkup(createElement(WikiShellPreview, { page: 'world', chronicleId }))
      expect(markup).toContain('세계관 문서 준비 중')
      expect(markup).toContain('생존기별 세계관')
      expect(markup).not.toContain('char-jinwoo')
      expect(markup).not.toContain('최근 세계관 기록')
      expect(markup).not.toContain('현재 공개된 세계관 문서 기준')
    }
  })

  it('keeps older Chronicles readable without fabricating Wiki world data', () => {
    const markup = renderToStaticMarkup(createElement(WikiShellPreview, {
      page: 'chronicle',
      chronicleId: 'C01-HAN-JUNHO',
    }))
    expect(markup).toContain('한준호의 생존기')
    expect(markup).toContain('Reader 중심으로 공개')
    expect(markup).toContain('이야기 읽기')
    expect(markup).not.toContain('서진우의 생존 기록')
  })

  it('renders real existing Archive data in a Wiki document when a node is selected', () => {
    const markup = renderToStaticMarkup(createElement(WikiShellPreview, { nodeId: 'char-jinwoo' }))

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

  it('keeps supported internal relations inside Wiki', () => {
    const markup = renderToStaticMarkup(createElement(WikiShellPreview, { nodeId: 'char-jinwoo' }))
    expect(markup).toContain('view=wiki-preview&amp;node=char-seojin')
    expect(markup).toContain('view=wiki-preview&amp;node=event-guild-warehouse-option')
  })

  it('shows current activity before the older role text and links the exact published sources', () => {
    const markup = renderToStaticMarkup(createElement(WikiShellPreview, { nodeId: 'char-taehoon' }))
    expect(markup.indexOf('id="wiki-activities"')).toBeLessThan(markup.indexOf('id="wiki-history"'))
    expect(markup).toContain('공공급수·생산거점 동시 펌프 고장 대응')
    expect(markup).toContain('part=c03-s03-session-008-001')
    expect(markup).toContain('<summary>이전 기록의 개요와 해설</summary>')
    expect(markup).toContain('핵심 시설 담당')

    const event = renderToStaticMarkup(createElement(WikiShellPreview, { nodeId: 'event-wiki-934cea538155fc7bc102a21c' }))
    expect(event).toContain('part=c03-s03-session-008-001')
    expect(event).toContain('chapter=c03-afterfall-auto-7a589e3a941834319a82033e0169df5b7270a24315fbe18f30d8a368daee6b4a')
    expect(event).not.toContain('연결된 공개 원문 없음')
  })

  it('roundtrips home Chronicle and document preview states', () => {
    expect(parseArchiveRoute('?view=wiki-preview')).toMatchObject({
      view: 'wiki-preview',
      chronicleId: 'C03-AFTERFALL',
      page: 'home',
    })
    expect(parseArchiveRoute('?view=wiki-preview&page=chronicle&chronicle=C03-AFTERFALL')).toMatchObject({
      view: 'wiki-preview',
      chronicleId: 'C03-AFTERFALL',
      page: 'chronicle',
    })
    expect(parseArchiveRoute('?view=wiki-preview&page=world&chronicle=C03-AFTERFALL')).toMatchObject({
      view: 'wiki-preview',
      chronicleId: 'C03-AFTERFALL',
      page: 'world',
    })
    expect(parseArchiveRoute('?view=wiki-preview&node=char-seojin')).toMatchObject({
      view: 'wiki-preview',
      nodeId: 'char-seojin',
    })

    const chronicleUrl = archiveRouteUrl({
      view: 'wiki-preview',
      chronicleId: 'C03-AFTERFALL',
      page: 'chronicle',
    }, 'https://archive.example/')
    expect(chronicleUrl.searchParams.get('page')).toBe('chronicle')
    expect(chronicleUrl.searchParams.get('chronicle')).toBe('C03-AFTERFALL')

    const worldUrl = archiveRouteUrl({
      view: 'wiki-preview',
      chronicleId: 'C03-AFTERFALL',
      page: 'world',
    }, 'https://archive.example/')
    expect(worldUrl.searchParams.get('page')).toBe('world')
    expect(worldUrl.searchParams.get('chronicle')).toBe('C03-AFTERFALL')
  })
})
