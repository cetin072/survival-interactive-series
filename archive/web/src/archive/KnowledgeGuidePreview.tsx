import { KnowledgeGuideLibraryPreview } from './KnowledgeGuideLibraryPreview'
import { KnowledgeGuidePage } from './KnowledgeGuidePage'
import { publishedKnowledgeGuides } from './knowledgeGuide'

export function KnowledgeGuidePreview({ briefId }: { briefId?: string }) {
  if (!briefId) return <KnowledgeGuideLibraryPreview />

  const guide = publishedKnowledgeGuides.find((item) => item.id === briefId)
  if (!guide) {
    return <KnowledgeGuideLibraryPreview notice="아직 공개되지 않은 생존 지식입니다. 공개된 가이드만 표시합니다." />
  }

  return <KnowledgeGuidePage guide={guide} />
}
