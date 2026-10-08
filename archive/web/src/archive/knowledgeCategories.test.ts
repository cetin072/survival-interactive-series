import { describe, expect, it } from 'vitest'
import { groupKnowledge } from './knowledgeCategories'
import { publishedKnowledgeGuides, type KnowledgeGuide } from './knowledgeGuide'

describe('STEP 3-2 public Knowledge shelf', () => {
  it('groups the existing public Knowledge exactly once into four stable categories', () => {
    const groups = groupKnowledge(publishedKnowledgeGuides)
    expect(groups.map((group) => [group.id, group.label, group.guides.length])).toEqual([
      ['household', '생활 대비', 3],
      ['information', '연락·정보', 2],
      ['evacuation', '대피·이동', 2],
      ['community', '공동 대응', 3],
    ])
    const ids = groups.flatMap((group) => group.guides.map((guide) => guide.id))
    expect(ids.length).toBe(publishedKnowledgeGuides.length)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps future topics visible without changing Automation C or source documents', () => {
    const newGuide = { ...publishedKnowledgeGuides[0], id: 'K-900', slug: 'future-topic', topicId: 'brand-new-topic' }
    const groups = groupKnowledge([newGuide])
    expect(groups.map((group) => group.label)).toEqual(['기타 생존 지식'])
    expect(groups[0].guides[0].slug).toBe('future-topic')
  })

  it('never includes unpublished guide data even if passed accidentally', () => {
    const draft = { ...publishedKnowledgeGuides[0], id: 'K-901', status: 'DRAFT' } as KnowledgeGuide
    expect(groupKnowledge([draft])).toEqual([])
  })
})
