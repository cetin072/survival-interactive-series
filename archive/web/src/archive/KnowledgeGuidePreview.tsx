import { buildKnowledgeGuide } from './knowledgeGuide'
import { KnowledgeGuidePage } from './KnowledgeGuidePage'

const defaultBriefId = 'K-002'

export function KnowledgeGuidePreview({ briefId }: { briefId?: string }) {
  const guide = buildKnowledgeGuide(briefId ?? defaultBriefId)
  return <KnowledgeGuidePage guide={guide} />
}
