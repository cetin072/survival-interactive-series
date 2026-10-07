import { type KnowledgeGuide, publishedKnowledgeGuides } from './knowledgeGuide'
import { selectKnowledgeResources } from './knowledgeResources'

// Editorial choice stores IDs and order only.
export const featuredKnowledgeIds = ['K-014', 'K-002', 'K-003'] as const

export function selectHomeKnowledge(guides: readonly KnowledgeGuide[] = publishedKnowledgeGuides) {
  // The build-owned public projection has already rechecked approval and files.
  const published = guides.filter((guide) => guide.status === 'PUBLISHED')
  const featured = featuredKnowledgeIds.flatMap((id) => published.find((guide) => guide.id === id) ?? [])
  const featuredIds = new Set(featured.map((guide) => guide.id))
  const recent = published.filter((guide) => !featuredIds.has(guide.id))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id)).slice(0, 4)
  return {
    featured, recent,
    missingFeaturedIds: featuredKnowledgeIds.filter((id) => !featuredIds.has(id)),
    resource: selectKnowledgeResources(published)[0],
  }
}
