import { createKnowledgePageRenderer } from '../web/render-knowledge.mjs'
import { publicBriefData, publicBriefs } from './lib/knowledge-public.mjs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadKnowledge, validateKnowledge, root } from './lib/knowledge-content.mjs'

const check = process.argv.includes('--check')
const data = await loadKnowledge()
await validateKnowledge(data)
const published = await publicBriefs(data)
const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const site = data.config.site_origin
// Existing labels are the concise visible headings; preserve the original question in the page/schema.
const searchTitle = (brief) => `${brief.label?.trim() || brief.title} | 생존일기`
// Small static, progressively enhanced UI: link remains selectable without JS.
const sharePanel = (canonical) => [
  '<section class="knowledge-share" aria-labelledby="knowledge-share-heading" data-knowledge-share>',
  '  <h2 id="knowledge-share-heading">이 글 공유하기</h2>',
  '  <p>이 글의 공식 주소를 복사하거나 SNS로 전달할 수 있습니다.</p>',
  '  <div class="knowledge-share-actions" data-knowledge-share-actions hidden>',
  '    <button type="button" data-knowledge-native-share hidden>휴대전화·기기 공유</button>',
  '    <button type="button" class="knowledge-share-copy" data-knowledge-copy>링크 복사</button>',
  '    <a data-knowledge-naver-share target="_blank" rel="noopener noreferrer">네이버</a>',
  '    <a data-knowledge-x-share target="_blank" rel="noopener noreferrer">X</a>',
  '    <a data-knowledge-facebook-share target="_blank" rel="noopener noreferrer">Facebook</a>',
  '  </div>',
  '  <label for="knowledge-share-url">이 글의 공식 주소</label>',
  '  <input id="knowledge-share-url" type="url" value="' + esc(site + canonical) + '" readonly spellcheck="false" />',
  '  <p class="knowledge-share-status" data-knowledge-share-status role="status" aria-live="polite"></p>',
  '</section>',
].join('\n')

const shell = (title, description, canonical, body, schema = '', detail = false, guideUi = detail) => `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(site + canonical)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:type" content="${detail ? 'article' : 'website'}" />
  <meta property="og:url" content="${esc(site + canonical)}" />
  <meta property="og:site_name" content="생존일기" />
  <meta property="og:locale" content="ko_KR" />${detail ? '\n  <meta name="twitter:card" content="summary" />' : ''}
  <link rel="stylesheet" href="/knowledge/knowledge.css" />${guideUi ? '\n  <link rel="stylesheet" href="/knowledge/wikiShell.css" />\n  <link rel="stylesheet" href="/knowledge/survivalDesignLanguage.css" />' : ''}
${schema}
</head>
<body>
  <div class="knowledge-shell">
    <header class="knowledge-header">
      <a class="knowledge-brand" href="/"><p class="knowledge-kicker">SURVIVAL DIARY</p><strong>생존일기</strong><span>생존 지식과 이야기</span></a>
      <nav class="knowledge-nav" aria-label="주요 탐색">${renderer.navigation.map((item) => `<a href="${esc(item.href)}"${item.id === 'knowledge' ? ' aria-current="page"' : ''}>${esc(item.label)}</a>`).join('')}<a href="/#site-search">검색</a></nav>
    </header>
    ${body}${detail ? '\n    ' + sharePanel(canonical) : ''}
  </div>${detail ? '\n  <script defer src="/knowledge/share.js"></script>' : ''}
</body>
</html>
`
const jsonLd = (value) => `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`
const renderer = await createKnowledgePageRenderer()
try {
  const article = (brief) => {
    const path = `/knowledge/${brief.slug}/`
    const breadcrumb = jsonLd({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: '생존 지식', item: site + '/knowledge/' },
      { '@type': 'ListItem', position: 2, name: brief.title, item: site + path },
    ] })
    const structured = jsonLd({ '@context': 'https://schema.org', '@type': 'Article', headline: brief.title,
      description: brief.meta_description, mainEntityOfPage: site + path, datePublished: brief.published_at,
      dateModified: brief.updated_at, inLanguage: 'ko', author: { '@type': 'Organization', name: '생존일기' } })
    return shell(searchTitle(brief), brief.meta_description, path, renderer.render(publicBriefData(brief, data)), breadcrumb + structured, true)
  }
  const index = shell('생존 지식 | 생존일기', '게임과 이야기에서 시작한 질문을 현실의 공식 자료와 검토 가능한 근거로 정리하는 생존 지식 아카이브.', '/knowledge/', renderer.renderLibrary(published.map((brief) => publicBriefData(brief, data))), '', false, true)
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/knowledge/', ...published.map((brief) => `/knowledge/${brief.slug}/`)].map((path) => `  <url><loc>${esc(site + path)}</loc></url>`).join('\n')}\n</urlset>\n`
  const styles = await Promise.all(['wikiShell.css', 'survivalDesignLanguage.css'].map(async (name) => [join(root, 'archive/web/public/knowledge', name), (await readFile(join(root, 'archive/web/src/archive', name), 'utf8')).replace(/\r\n/g, '\n')]))
  const outputs = new Map([
    ...styles,
    [join(root, 'archive/web/public/knowledge/index.html'), index],
    [join(root, 'archive/web/public/sitemap.xml'), sitemap],
    [join(root, 'archive/web/public/robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`],
    ...published.map((brief) => [join(root, 'archive/web/public/knowledge', brief.slug, 'index.html'), article(brief)]),
  ])
  for (const [file, expected] of outputs) {
    if (check) {
      const actual = (await readFile(file, 'utf8').catch(() => null))?.replace(/\r\n/g, '\n')
      if (actual !== expected) throw new Error(`KNOWLEDGE_GENERATED_STALE: ${file}`)
    } else {
      await mkdir(join(file, '..'), { recursive: true })
      await writeFile(file, expected)
    }
  }
  console.log(JSON.stringify({ status: check ? 'CHECKED' : 'BUILT', published: published.map((b) => b.id), files: outputs.size }))

} finally { await renderer.close() }
