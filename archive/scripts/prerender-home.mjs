import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createKnowledgePageRenderer } from '../web/render-knowledge.mjs'

// Reuse the approved projection and the actual React home. No runtime server.
const renderer = await createKnowledgePageRenderer()
try {
  const file = resolve(import.meta.dirname, '../web/dist/index.html')
  const html = await readFile(file, 'utf8')
  if (!html.includes('<div id="root"></div>')) throw new Error('HOME_PRERENDER_ROOT_MISSING')
  const clientHtml = html.replace(/\s*<(?:link|meta)\b[^>]*data-home-seo[^>]*>/g, '')
    .replace(/<title>.*?<\/title>/, '<title>생존일기 · 생존 지식과 이야기</title>')
    .replace('</head>', '<meta name="robots" content="noindex, nofollow, noarchive" /></head>')
  await writeFile(resolve(import.meta.dirname, '../web/dist/client.html'), clientHtml)
  await writeFile(file, html.replace('<div id="root"></div>', () => '<div id="root" data-prerendered-home="true">' + renderer.renderHome() + '</div>'))
} finally { await renderer.close() }
