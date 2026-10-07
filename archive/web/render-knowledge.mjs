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
    const { publicNavigation } = await server.ssrLoadModule('/src/archive/publicNavigation.ts')
    return {
      navigation: publicNavigation,
      render: (brief) => renderToStaticMarkup(createElement(KnowledgeGuidePage, { guide: adaptKnowledgeBrief(brief), showTopbar: false })),
      reviewState: knowledgeReviewState,
      close: () => server.close(),
    }
  } catch (error) { await server.close(); throw error }
}
