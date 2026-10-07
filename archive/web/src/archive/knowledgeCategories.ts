import type { KnowledgeGuide } from './knowledgeGuide'

export const knowledgeCategories = [
  { id: 'household', label: '생활 대비', topics: ['household-emergency-preparedness'] },
  { id: 'information', label: '연락·정보', topics: ['community-information-sharing', 'emergency-information-access-control'] },
  { id: 'evacuation', label: '대피·이동', topics: ['evacuation-decision-planning', 'emergency-route-redundancy', 'community-evacuation-waypoints'] },
  { id: 'community', label: '공동 대응', topics: ['community-emergency-resource-management', 'community-continuity-roles', 'emergency-personnel-credentialing'] },
] as const

export function groupKnowledge(guides: readonly KnowledgeGuide[]) {
  const groups = knowledgeCategories.map(({ id, label, topics }) => ({
    id, label, guides: guides.filter((guide) => topics.some((topic) => topic === guide.topicId)),
  }))
  const known = new Set<string>(knowledgeCategories.flatMap((category) => [...category.topics]))
  const other = guides.filter((guide) => !known.has(guide.topicId))
  if (other.length) groups.push({ id: 'other' as 'household', label: '기타 생존 지식', guides: other })
  return groups.filter((group) => group.guides.length > 0)
}
