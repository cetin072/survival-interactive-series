import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildKnowledgeGuide, knowledgeHref } from './knowledgeGuide'
import { selectHomeKnowledge } from './knowledgeHome'
import { selectKnowledgeResources } from './knowledgeResources'
import { WikiToolsPage } from './WikiToolsPage'

const guide = buildKnowledgeGuide('K-002')
const tool = guide.tools[0]
const render = (resources: ReturnType<typeof selectKnowledgeResources>) => renderToStaticMarkup(createElement(WikiToolsPage, { resources }))

describe('shared approved Knowledge resources', () => {
  it('uses exactly the same first resource on home and the actual tools page', () => {
    const resources = selectKnowledgeResources()
    expect(selectHomeKnowledge().resource).toEqual(resources[0])
    expect(resources[0].guide.id).toBe('K-002')
    const html = render(resources)
    for (const text of [tool.title, tool.description, tool.type, guide.label, '사용 설명 보기', '다운로드']) expect(html).toContain(text)
    expect(html).toContain('href="' + knowledgeHref(guide) + '"')
    expect(html).toContain('href="' + tool.path + '" download=""')
    expect(html).not.toMatch(/준비 중|PDF 자료|체크리스트/)
  })

  it('automatically shows a new public AVAILABLE resource without per-file UI configuration', () => {
    const added = { ...guide, id: 'K-100', slug: 'new-fixture', label: '새 지식', tools: [{ ...tool, title: '새 자료', path: '/knowledge/downloads/new-fixture.xlsx' }] }
    const resources = selectKnowledgeResources([added, guide])
    expect(resources).toHaveLength(2)
    expect(render(resources)).toContain('새 자료')
    expect(render(resources)).toContain('/knowledge/new-fixture/')
    expect(render(resources)).toContain('/knowledge/downloads/new-fixture.xlsx')
  })

  it('excludes unavailable tools and every unpublished Knowledge state', () => {
    const hidden = ['READY', 'DRAFT', 'HOLD'].map((status) => ({ ...guide, status, label: 'PRIVATE_' + status }))
    const pending = { ...guide, tools: [{ ...tool, availability: 'PENDING', title: 'UNAVAILABLE_TOOL' }] }
    const resources = selectKnowledgeResources([...hidden, pending])
    expect(resources).toEqual([])
    const html = render(resources)
    expect(html).toContain('아직 공개된 실용 자료가 없습니다.')
    expect(html).not.toMatch(/PRIVATE_|UNAVAILABLE_TOOL|download=/)
  })

  it('deduplicates by file path with deterministic owner and priority independent of input order', () => {
    const other = { ...guide, id: 'K-003', slug: 'other-fixture' }
    const first = selectKnowledgeResources([other, guide])
    const second = selectKnowledgeResources([guide, other])
    expect(first).toEqual(second)
    expect(first).toHaveLength(1)
    expect(first[0].guide.id).toBe('K-002')
    expect(render(first).match(/ download=/g)).toHaveLength(1)
    expect(selectHomeKnowledge([other, guide]).resource).toEqual(first[0])
  })

  it('renders an empty list without category placeholders or dead download links', () => {
    const html = render(selectKnowledgeResources([]))
    expect(html).toContain('아직 공개된 실용 자료가 없습니다.')
    expect(html).not.toMatch(/download=|준비 중|PDF|XLSX|체크리스트/)
    expect(selectHomeKnowledge([]).resource).toBeUndefined()
  })
})
