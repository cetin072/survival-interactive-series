import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// @ts-expect-error Build-only Node module; never shipped to the browser.
import { publicKnowledgeModule } from '../scripts/lib/knowledge-public.mjs'
// @ts-expect-error Build-only Node module; never shipped to the browser.
import { loadPublicWikiData } from '../scripts/lib/wiki-public-sources.mjs'

const archiveBuildRef = process.env.ARCHIVE_BUILD_REF ?? process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? 'unknown'
let publicWikiData: ReturnType<typeof loadPublicWikiData> | undefined

export default defineConfig({
  plugins: [react(), {
    name: 'knowledge-public',
    resolveId(id) { if (id === 'virtual:knowledge-public') return '\0knowledge-public' },
    async load(id) {
      if (id === '\0knowledge-public') return 'export default ' + await publicKnowledgeModule()
    },
  }, {
    name: 'archive-public-sources',
    buildStart() { publicWikiData = undefined },
    watchChange() { publicWikiData = undefined },
    resolveId(id) {
      if (id === 'virtual:wiki-sources' || id === 'virtual:archive-public-transcripts') return '\0' + id
    },
    async load(id) {
      if (id !== '\0virtual:wiki-sources' && id !== '\0virtual:archive-public-transcripts') return
      const data = await (publicWikiData ??= loadPublicWikiData())
      for (const file of data.files) this.addWatchFile(file)
      return 'export default ' + JSON.stringify(id === '\0virtual:wiki-sources' ? data.sources : data.transcripts)
    },
  }, {
    name: 'archive-build-ref',
    transformIndexHtml(html) {
      return html.replace('</head>', `  <meta name="archive-build-ref" content="${archiveBuildRef}" />\n  </head>`)
    },
  }],
})
