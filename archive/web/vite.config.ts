import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// @ts-expect-error Build-only Node module; never shipped to the browser.
import { publicKnowledgeModule } from '../scripts/lib/knowledge-public.mjs'

const archiveBuildRef = process.env.ARCHIVE_BUILD_REF ?? process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? 'unknown'

export default defineConfig({
  plugins: [react(), {
    name: 'knowledge-public',
    resolveId(id) { if (id === 'virtual:knowledge-public') return '\0knowledge-public' },
    async load(id) {
      if (id === '\0knowledge-public') return 'export default ' + await publicKnowledgeModule()
    },
  }, {
    name: 'archive-build-ref',
    transformIndexHtml(html) {
      return html.replace('</head>', `  <meta name="archive-build-ref" content="${archiveBuildRef}" />\n  </head>`)
    },
  }],
})
