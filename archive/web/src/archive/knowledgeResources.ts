import { type KnowledgeGuide, publishedKnowledgeGuides } from './knowledgeGuide'

// Editorial priority stores IDs only; data remains in the approved Knowledge.
const resourcePriorityIds: readonly string[] = ['K-002']

export const availableKnowledgeTools = (guide: KnowledgeGuide) =>
  guide.status === 'PUBLISHED' ? guide.tools.filter((tool) => tool.availability === 'AVAILABLE') : []

export function selectKnowledgeResources(guides: readonly KnowledgeGuide[] = publishedKnowledgeGuides) {
  const priority = (id: string) => {
    const index = resourcePriorityIds.indexOf(id)
    return index < 0 ? resourcePriorityIds.length : index
  }
  const ordered = [...guides].filter((guide) => guide.status === 'PUBLISHED')
    .sort((a, b) => priority(a.id) - priority(b.id) || a.id.localeCompare(b.id))
  const paths = new Set<string>()
  return ordered.flatMap((guide) => [...availableKnowledgeTools(guide)]
    .sort((a, b) => a.path.localeCompare(b.path))
    .filter((tool) => {
      if (paths.has(tool.path)) return false
      paths.add(tool.path)
      return true
    }).map((tool) => ({ guide, tool })))
}
