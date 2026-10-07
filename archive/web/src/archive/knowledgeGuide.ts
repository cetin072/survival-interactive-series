import publicBriefFiles from 'virtual:knowledge-public'
// @ts-expect-error Pure shared public display helpers.
export { knowledgeHref, knowledgeRiskLabel } from '../../../scripts/lib/knowledge-detail.mjs'

export type KnowledgeGuideBlock =
  | { type: 'prose'; text: string }
  | { type: 'note'; text: string }
  | { type: 'ordered_list'; items: string[] }
  | { type: 'unordered_list'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'download/tool'; tool_path: string }
  | { type: 'image'; src: string; alt: string; caption?: string }
  | { type: 'youtube'; url: string; title: string }

export type KnowledgeGuideSection = {
  heading: string
  blocks: KnowledgeGuideBlock[]
}

export type KnowledgeGuideSource = {
  id: string
  title: string
  url: string
  note: string
  checked_at: string
}

export type KnowledgeGuideTool = {
  type: string
  title: string
  path: string
  label: string
  description: string
  availability: string
}

export type KnowledgeGuide = {
  detail: KnowledgeBriefFile
  id: string
  slug: string
  status: string
  label: string
  title: string
  summary: string
  lead: string
  scope: string
  basis: string
  footer: string
  riskLevel: string
  sourceCheckedAt: string
  publishedAt: string
  sections: KnowledgeGuideSection[]
  sources: KnowledgeGuideSource[]
  tools: KnowledgeGuideTool[]
}

type KnowledgeBriefFile = {
  id: string
  slug: string
  status: string
  label: string
  title: string
  summary: string
  lead: string
  scope: string
  basis: string
  footer: string
  risk_level: string
  source_checked_at: string
  published_at: string
  updated_at: string
  publication_policy: string
  related_briefs: { id: string; slug: string; label: string; title: string }[]
  related_stories: { id: string; title: string; path: string }[]
  related_guide: { id: string; slug: string; title: string } | null
  sections: KnowledgeGuideSection[]
  sources: KnowledgeGuideSource[]
  tools?: KnowledgeGuideTool[]
}

const briefFiles = publicBriefFiles as KnowledgeBriefFile[]

export const supportedKnowledgeBlockTypes = new Set([
  'prose',
  'note',
  'ordered_list',
  'unordered_list',
  'table',
  'download/tool',
  'image',
  'youtube',
])

function assertSupportedBlocks(brief: KnowledgeBriefFile) {
  for (const section of brief.sections ?? []) {
    for (const block of section.blocks ?? []) {
      if (!supportedKnowledgeBlockTypes.has(block.type)) {
        throw new Error(`Unsupported published Knowledge block type: ${brief.id} / ${block.type}`)
      }
    }
  }
  return brief
}

export const publishedKnowledgeGuides = briefFiles
  .map(assertSupportedBlocks)
  .map((brief): KnowledgeGuide => ({
    detail: brief,
    id: brief.id,
    slug: brief.slug,
    status: brief.status,
    label: brief.label,
    title: brief.title,
    summary: brief.summary,
    lead: brief.lead,
    scope: brief.scope,
    basis: brief.basis,
    footer: brief.footer,
    riskLevel: brief.risk_level,
    sourceCheckedAt: brief.source_checked_at,
    publishedAt: brief.published_at,
    sections: brief.sections,
    sources: brief.sources,
    tools: brief.tools ?? [],
  }))
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))

export function buildKnowledgeGuide(briefId: string): KnowledgeGuide {
  const guide = publishedKnowledgeGuides.find((item) => item.id === briefId)
  if (!guide) throw new Error('Published Knowledge guide not found: ' + briefId)
  return guide
}
