import type { KnowledgeGuide } from './knowledgeGuide'

export type KnowledgeCategoryId = 'household' | 'information' | 'evacuation' | 'community' | 'other'
type KnowledgeCategory = { id: KnowledgeCategoryId; label: string; topics: readonly string[] }

export const knowledgeCategories: readonly KnowledgeCategory[] = [
  { id: 'household', label: '생활 대비', topics: ['household-emergency-preparedness'] },
  { id: 'information', label: '연락·정보', topics: ['community-information-sharing', 'emergency-information-access-control'] },
  { id: 'evacuation', label: '대피·이동', topics: ['evacuation-decision-planning', 'emergency-route-redundancy', 'community-evacuation-waypoints'] },
  { id: 'community', label: '공동 대응', topics: ['community-emergency-resource-management', 'community-continuity-roles', 'emergency-personnel-credentialing'] },
]
const other: KnowledgeCategory = { id: 'other', label: '기타 생존 지식', topics: [] }

export function groupKnowledge(guides: readonly KnowledgeGuide[]) {
  const published = guides.filter((guide) => guide.status === 'PUBLISHED')
  const known = new Set(knowledgeCategories.flatMap((category) => [...category.topics]))
  return [...knowledgeCategories, other]
    .map((category) => ({
      id: category.id,
      label: category.label,
      guides: published.filter((guide) =>
        category.id === 'other' ? !known.has(guide.topicId) : category.topics.includes(guide.topicId)),
    }))
    .filter((group) => group.guides.length > 0)
}
