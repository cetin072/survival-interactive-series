import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const archiveBuildRef = process.env.ARCHIVE_BUILD_REF ?? process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? 'unknown'

export default defineConfig({
  plugins: [react(), {
    name: 'archive-build-ref',
    transformIndexHtml(html) {
      return html.replace('</head>', `  <meta name="archive-build-ref" content="${archiveBuildRef}" />\n  </head>`)
    },
  }],
})
