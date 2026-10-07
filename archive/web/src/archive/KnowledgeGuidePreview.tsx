import { useEffect } from 'react'
import { knowledgeHref, publishedKnowledgeGuides } from './knowledgeGuide'

export function KnowledgeGuidePreview({ briefId }: { briefId?: string }) {
  const guide = publishedKnowledgeGuides.find((item) => item.id === briefId)
  const href = guide ? knowledgeHref(guide) : '/knowledge/'
  useEffect(() => { window.location.replace(href) }, [href])
  return <main><p>{briefId && !guide ? '아직 공개되지 않은 생존 지식입니다. ' : ''}생존 지식의 정식 페이지로 이동합니다.</p><a href={href}>생존 지식 보기 →</a></main>
}
