import { describe, expect, it } from 'vitest'
import { primaryNavigationLabels } from './ArchiveApp'
import { chronicleRegistry, partitionChronicles } from './chronicleRegistry'
import { chaptersForChronicle, readerChapters } from './storyData'
import { extractReaderNarrativeFromGm, removeTrailingChoiceGate } from './readerTransform'

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
    expect(extractReaderNarrativeFromGm(raw)).toBe('## 2027년 1월 18일\n눈이 멎었다.\n\n“가자.”\n\n장태훈이 말했다.')
  })
  it('also removes Markdown-heading choice options', () => {
    expect(removeTrailingChoiceGate('장면.\n\n### 1. 간다\n### 2. 남는다')).toBe('장면.')
  })
  it('does not remove narrative numeric lists, headings, dialogue, or order', () => {
    const gm = '## 창고\n\n보급품은 다음과 같았다.\n\n- 물 20L\n- 연료 3통\n- 식량 4일분\n\n“계속 간다.”'
    expect(removeTrailingChoiceGate(gm)).toBe(gm)
  })
  it('ships no role labels or choice UI in Reader bodies', () => {
    const body = readerChapters.map((chapter) => chapter.body).join('\n')
    expect(body).not.toMatch(/(?:^|\n)#{2,3}\s*(?:USER|GM|ASSISTANT_PUBLIC_META)/m)
    expect(body).not.toMatch(/(?:^|\n)#{1,4}\s*(?:선택|행동)\s*$/m)
  })
  it('marks C02 grouping as parts rather than invented seasons', () => {
    expect(chaptersForChronicle('C02-STRONGHOLD').every((chapter) => !chapter.seasonId && Boolean(chapter.partId))).toBe(true)
  })
})
