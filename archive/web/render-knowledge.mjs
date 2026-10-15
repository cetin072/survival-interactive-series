// Build-only bridge to the existing KnowledgeGuidePage, not a second renderer.
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fileURLToPath } from 'node:url'

export async function createKnowledgePageRenderer() {
  const server = await createServer({ root: fileURLToPath(new URL('.', import.meta.url)), server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' })
  try {
    const { KnowledgeGuidePage } = await server.ssrLoadModule('/src/archive/KnowledgeGuidePage.tsx')
    const { adaptKnowledgeBrief, knowledgeReviewState } = await server.ssrLoadModule('/src/archive/knowledgeGuide.ts')
    const { KnowledgeGuideLibraryPreview } = await server.ssrLoadModule('/src/archive/KnowledgeGuideLibraryPreview.tsx')
    const { WikiTopbar } = await server.ssrLoadModule('/src/archive/WikiTopbar.tsx')
    const { publicNavigation } = await server.ssrLoadModule('/src/archive/publicNavigation.ts')
    const { groupKnowledge } = await server.ssrLoadModule('/src/archive/knowledgeCategories.ts')
    return {
      navigation: publicNavigation,
      // Static HTML uses the same topbar, with a working link instead of a JS-only search form.
      renderStaticTopbar: () => renderToStaticMarkup(createElement(WikiTopbar, { staticSearch: true, activeMenu: 'knowledge' })),
      groups: (briefs) => groupKnowledge(briefs.map(adaptKnowledgeBrief)),
      render: (brief) => renderToStaticMarkup(createElement(KnowledgeGuidePage, { guide: adaptKnowledgeBrief(brief), showTopbar: false })),
      renderLibrary: (briefs) => renderToStaticMarkup(createElement(KnowledgeGuideLibraryPreview, { guides: briefs.map(adaptKnowledgeBrief), showTopbar: false })),
      reviewState: knowledgeReviewState,
      close: () => server.close(),
    }
  } catch (error) { await server.close(); throw error }
}
