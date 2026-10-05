import { publicationEligibility } from './knowledge-content.mjs'
import { checkHumanApprovedRelease } from './knowledge-release.mjs'

// PUBLISHED is written by the existing approval consumer. Recheck its machine
// conditions without demanding a new approval for an already published article.
export async function publicBriefs(data) {
  const briefs = data.briefs.filter((brief) => brief.status === 'PUBLISHED')
  for (const brief of briefs) {
    const human = brief.publication_policy === 'HUMAN_APPROVED' ? await checkHumanApprovedRelease(data, {
      changedFiles: [`knowledge/content/briefs/${brief.id}.json`], briefIds: [brief.id], base: data.base,
    }) : null
    // These two approved articles predate C's Candidate/Reader contract.
    const legacyApproved = ['K-002', 'K-003'].includes(brief.id)
      && brief.publication_policy === 'HUMAN_APPROVED'
      && human?.reasons.every((reason) => [`CANDIDATE_MISSING:${brief.id}`, `STORY_SOURCE_NOT_VERIFIED:${brief.id}`].includes(reason))
    const eligible = brief.publication_policy === 'AUTO_LOW_RISK'
      ? publicationEligibility(brief, data.evidence.get(brief.id), data.config) === 'AUTO_PUBLISH_ELIGIBLE'
      : human?.decision === 'HUMAN_APPROVED_ELIGIBLE' || legacyApproved
    if (!eligible) throw new Error(`KNOWLEDGE_PUBLIC_INELIGIBLE:${brief.id}:${human?.reasons.join(',')}`)
  }
  return briefs.sort((a, b) => b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id))
}

const pick = (item, fields) => Object.fromEntries(fields.filter((key) => key in item).map((key) => [key, item[key]]))
const blockFields = {
  prose: ['text'], note: ['text'], ordered_list: ['items'], unordered_list: ['items'],
  table: ['headers', 'rows'], 'download/tool': ['tool_path'],
  image: ['src', 'alt', 'caption'], youtube: ['url', 'title'],
}

export function publicBriefData(brief) {
  return {
    ...pick(brief, ['id', 'slug', 'status', 'label', 'title', 'summary', 'lead', 'scope', 'basis', 'footer', 'risk_level', 'source_checked_at', 'published_at']),
    sections: brief.sections.map((section) => ({ heading: section.heading,
      blocks: section.blocks.map((block) => {
        if (!blockFields[block.type]) throw new Error(`KNOWLEDGE_PUBLIC_BLOCK:${block.type}`)
        return pick(block, ['type', ...blockFields[block.type]])
      }),
    })),
    sources: brief.sources.map((source) => pick(source, ['id', 'title', 'url', 'note', 'checked_at'])),
    tools: (brief.tools ?? []).map((tool) => pick(tool, ['type', 'title', 'path', 'label', 'description', 'availability'])),
  }
}

export async function publicKnowledgeModule() {
  const { loadKnowledge, validateKnowledge } = await import('./knowledge-content.mjs')
  const data = await loadKnowledge()
  await validateKnowledge(data)
  return JSON.stringify((await publicBriefs(data)).map(publicBriefData))
}
