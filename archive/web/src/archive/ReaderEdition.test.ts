import { describe, expect, it } from 'vitest'
import { primaryNavigationLabels } from './ArchiveApp'
import { chronicleRegistry, partitionChronicles } from './chronicleRegistry'
import { chaptersForChronicle, readerChapters } from './storyData'
// @ts-expect-error Node-owned shared publisher module has no browser declaration.
import { extractReaderNarrative, parseRoleHeader, removeTrailingChoiceGate } from '../../../scripts/lib/reader-transform.mjs'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { SafeMarkdown } from './SafeMarkdown'
import { assertReaderManifest } from './readerManifestContract'

describe('Reader Edition V1.1', () => {
  it('keeps RAW outside the two-item primary navigation', () => {
    expect(primaryNavigationLabels).toEqual(['세계 탐색', '이야기 읽기'])
  })
  it('has one registry and switches current shelf without Story code changes', () => {
    expect(partitionChronicles().active.id).toBe('C03-AFTERFALL')
    const simulated = [...chronicleRegistry.map((item) => ({ ...item, active: false })), { ...chronicleRegistry[2], id: 'C04-NEW' as const, active: true }]
    expect(partitionChronicles(simulated).active.id).toBe('C04-NEW')
    expect(partitionChronicles(simulated).past.map((item) => item.id)).toContain('C03-AFTERFALL')
  })
  it('keeps Chronicle source boundaries', () => {
    expect(chaptersForChronicle('C01-HAN-JUNHO').every((c) => c.sourceRefs.every((s) => s.startsWith('seasons_v2/')))).toBe(true)
    expect(chaptersForChronicle('C02-STRONGHOLD').every((c) => c.sourceRefs.every((s) => s.startsWith('worldlines/STRONGHOLD/')))).toBe(true)
    expect(chaptersForChronicle('C03-AFTERFALL').every((c) => c.sourceRefs.every((s) => s.startsWith('worldlines/AFTERFALL/') || s.startsWith('archive/content/transcripts/C03-AFTERFALL/')))).toBe(true)
  })
  it('selects GM verbatim while removing USER and the trailing choice gate', () => {
    const raw = '### USER\n3\n\n### GM\n## 2027년 1월 18일\n눈이 멎었다.\n\n“가자.”\n\n장태훈이 말했다.\n\n1. 지금 출발한다\n2. 정오까지 기다린다\n어떻게 할까?'
    expect(extractReaderNarrative(raw)).toBe('## 2027년 1월 18일\n눈이 멎었다.\n\n“가자.”\n\n장태훈이 말했다.')
  })
  it('parses bare and numbered historical role headers', () => {
    expect(parseRoleHeader('## USER')).toMatchObject({ role: 'USER' })
    expect(parseRoleHeader('### USER 001')).toMatchObject({ role: 'USER', messageLabel: '001' })
    expect(parseRoleHeader('## GM 001-B')).toMatchObject({ role: 'GM', messageLabel: '001-B' })
    expect(parseRoleHeader('## GM 001-A — 공개 진행 알림')).toMatchObject({ role: 'GM', messageLabel: '001-A', suffix: '공개 진행 알림' })
    expect(parseRoleHeader('## ASSISTANT_PUBLIC_META')).toMatchObject({ role: 'ASSISTANT_PUBLIC_META' })
  })
  it('removes only a cue-backed choice gate', () => {
    expect(removeTrailingChoiceGate('장면.\n\n진우의 판단\n\n1. 지금 간다\n2. 하루 기다린다\n3. 민호에게 연락한다\n4. 자유행동')).toBe('장면.')
    expect(removeTrailingChoiceGate('장면.\n\n어떻게 할까?\nA. 북쪽\nB. 남쪽')).toBe('장면.')
  })
  it('excludes an explicit design discussion but retains the following dated scene', () => {
    const raw = '## GM\n좋아. 네 판단을 전략논의로 가져간다.\n\n## GM\n## 10월 23일 20:10\n진우가 문을 열었다.'
    expect(extractReaderNarrative(raw)).toBe('## 10월 23일 20:10\n진우가 문을 열었다.')
  })
  it('excludes isolated GM planning replies without deleting a scene block', () => {
    const raw = '## GM\n좋아. 이건 거점 하나 옮길까 수준이 아니라, 7명이 두 거점을 어떻게 운영할지 정하는 문제다.\n\n## GM\n네 명 내부 회의의 핵심은 우리가 연합체가 되는 게 맞는가다.\n\n## GM\n## 10월 24일 17:35\n진우는 네 사람을 다시 모았다.'
    expect(extractReaderNarrative(raw)).toBe('## 10월 24일 17:35\n진우는 네 사람을 다시 모았다.')
  })
  it('does not remove narrative numeric lists, headings, dialogue, or order', () => {
    for (const gm of ['현재 물자:\n\n1. 물 20L\n2. 연료 3통\n3. 식량 4일분', '순서는 이랬다.\n\n1. 환자 안정화.\n2. 병원 수용 확인.\n3. 차량 출발.', '1월 3일\n2번 거점\n3명이 남았다.']) expect(removeTrailingChoiceGate(gm)).toBe(gm)
  })
  it('ships no role labels or choice UI in Reader bodies', () => {
    const body = readerChapters.map((chapter) => chapter.body).join('\n')
    expect(body).not.toMatch(/(?:^|\n)#{2,3}\s*(?:USER|GM|ASSISTANT_PUBLIC_META)/m)
    expect(body.match(/(?:^|\n)#{1,4}\s*(?:선택|행동)\s*\r?\n(?:\r?\n)*(?:\*\*)?(?:1\.|A\.)/m)?.[0]).toBeUndefined()
  })
  it('marks C02 grouping as parts rather than invented seasons', () => {
    expect(chaptersForChronicle('C02-STRONGHOLD').every((chapter) => !chapter.seasonId && Boolean(chapter.partId))).toBe(true)
  })
  it('audits every verified source and keeps C03 numbered GM prose', () => {
    const books = new Map(readerChapters.map((chapter) => [chapter.chronicleId, chapter]))
    expect(books.size).toBe(3)
    expect(chaptersForChronicle('C03-AFTERFALL').some((chapter) => chapter.body.includes('첫겨울'))).toBe(true)
    expect(readerChapters.every((chapter) => chapter.body.trim().length > 0 && chapter.sourceRefs.length > 0 && chapter.archiveSourceRefs.length > 0)).toBe(true)
  })
  it('rejects a stale or incomplete generated manifest before it reaches the Reader', () => {
    expect(() => assertReaderManifest({ chronicleId: 'C99', transformVersion: 'old', coverage: { verifiedRawParts: 1, scanned: 1 }, chapters: [] })).toThrow('Unsupported Reader manifest')
    expect(() => assertReaderManifest({ chronicleId: 'C99', transformVersion: 'reader-selection-v1.1.0', coverage: { verifiedRawParts: 2, scanned: 1 }, chapters: [] })).toThrow('Incomplete RAW coverage audit')
  })
  it('renders safe Markdown as semantic elements rather than literal markers', () => {
    const html = renderToStaticMarkup(createElement(SafeMarkdown, { body: '## 2027년 1월 18일\n\n진우가 문을 열었다.\n\n> “가자.”\n\n**눈이 멎었다.**\n\n---\n\n다음 장면.' }))
    expect(html).toContain('<h2>2027년 1월 18일</h2>'); expect(html).toContain('<blockquote>“가자.”</blockquote>'); expect(html).toContain('<strong>눈이 멎었다.</strong>'); expect(html).toContain('<hr'); expect(html).not.toContain('## ')
  })
})
