import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WikiShellPreview } from './WikiShellPreview'
import { wikiCharacterIndex, wikiEventIndex, wikiLocationIndex } from './wikiDocument'
import { archiveRouteUrl, parseArchiveRoute } from './readerNavigation'

describe('Wiki staged public structure', () => {
  it('uses the Wiki home as the default preview entrance', () => {
    const markup = renderToStaticMarkup(createElement(WikiShellPreview))
    expect(markup).toContain('생존 이야기를 읽고')
    expect(markup).toContain('현재 진행 중')
    expect(markup).toContain('서진우의 생존기')
    expect(markup).toContain('최근 세계관 기록')
    expect(markup).toContain('세계관 분류')
    expect(markup).toContain('최근 생존 지식')
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
    expect(markup).toContain(`인물 ${wikiCharacterIndex.length}`)
    expect(markup).toContain(`장소 ${wikiLocationIndex.length}`)
    expect(markup).toContain(`사건 ${wikiEventIndex.length}`)

    for (const item of [...wikiCharacterIndex, ...wikiLocationIndex, ...wikiEventIndex]) {
      expect(markup).toContain(item.title)
      expect(markup).toContain('node=' + item.id)
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
