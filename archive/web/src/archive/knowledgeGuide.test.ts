import { describe, expect, it } from 'vitest'
import {
  buildKnowledgeGuide,
  knowledgeRiskLabel,
  publishedKnowledgeGuides,
  supportedKnowledgeBlockTypes,
} from './knowledgeGuide'

describe('KnowledgeGuide adapter', () => {
  it('builds the published K-002 practical guide from the existing brief', () => {
    const guide = buildKnowledgeGuide('K-002')
    expect(guide.title).toBe('비상용품은 어떻게 목록화하고 점검하면 좋은가')
    expect(guide.status).toBe('PUBLISHED')
    expect(guide.scope).toBe('일반 생활 준비')
    expect(guide.basis).toContain('국민안전24')
    expect(guide.sections.some((section) => section.blocks.some((block) => block.type === 'ordered_list'))).toBe(true)
    expect(guide.sections.some((section) => section.blocks.some((block) => block.type === 'table'))).toBe(true)
    expect(guide.sections.some((section) => section.blocks.some((block) => block.type === 'note'))).toBe(true)
    expect(guide.tools.some((tool) => tool.path.endsWith('.xlsx'))).toBe(true)
    expect(guide.sources.length).toBeGreaterThanOrEqual(2)
  })

  it('compiles every currently published brief with only supported block types', () => {
    expect(publishedKnowledgeGuides.length).toBeGreaterThan(0)
    expect(publishedKnowledgeGuides.some((guide) => guide.id === 'K-002')).toBe(true)
    expect(publishedKnowledgeGuides.some((guide) => guide.id === 'K-011')).toBe(true)

    for (const guide of publishedKnowledgeGuides) {
      expect(guide.status).toBe('PUBLISHED')
      expect(guide.title.length).toBeGreaterThan(0)
      expect(guide.summary.length).toBeGreaterThan(0)
      expect(guide.sources.length).toBeGreaterThan(0)
      for (const section of guide.sections) {
        for (const block of section.blocks) {
          expect(supportedKnowledgeBlockTypes.has(block.type)).toBe(true)
        }
      }
    }
  })

  it('supports unordered lists used by published Automation C guides', () => {
    expect(publishedKnowledgeGuides.some((guide) =>
      guide.sections.some((section) => section.blocks.some((block) => block.type === 'unordered_list')),
    )).toBe(true)
  })

  it('exposes only PUBLISHED briefs and rejects READY content', () => {
    expect(publishedKnowledgeGuides.every((guide) => guide.status === 'PUBLISHED')).toBe(true)
    expect(publishedKnowledgeGuides.some((guide) => guide.id === 'K-004')).toBe(false)
    expect(publishedKnowledgeGuides.some((guide) => guide.id === 'K-005')).toBe(false)
    expect(() => buildKnowledgeGuide('K-004')).toThrow(/Published Knowledge guide not found/)
  })

  it('uses Korean risk labels rather than raw developer codes in the public guide', () => {
    expect(knowledgeRiskLabel('LOW')).toBe('일반 준비 정보')
    expect(knowledgeRiskLabel('HIGH')).toContain('고위험')
  })
})
