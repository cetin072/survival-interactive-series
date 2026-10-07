import type { KnowledgeGuide } from './knowledgeGuide'
// @ts-expect-error Pure shared renderer used by Node and the browser.
import { renderKnowledgeDetail } from '../../../scripts/lib/knowledge-detail.mjs'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'

export function KnowledgeGuidePage({ guide }: { guide: KnowledgeGuide }) {
  // The renderer escapes every content value; this is generated HTML only.
  return <main className="wiki-shell knowledge-guide-shell">
    <WikiTopbar />
    <div dangerouslySetInnerHTML={{ __html: renderKnowledgeDetail(guide.detail) }} />
  </main>
}
