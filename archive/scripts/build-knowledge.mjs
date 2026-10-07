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
const shell = (title, description, canonical, body, schema = '', detail = false) => `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(site + canonical)}" />
  <link rel="stylesheet" href="/knowledge/knowledge.css" />${detail ? '\n  <link rel="stylesheet" href="/knowledge/wikiShell.css" />\n  <link rel="stylesheet" href="/knowledge/survivalDesignLanguage.css" />' : ''}
${schema}
</head>
<body>
  <div class="knowledge-shell">
    <header class="knowledge-header">
      <a class="knowledge-brand" href="/"><p class="knowledge-kicker">SURVIVAL DIARY</p><strong>생존일기 · 생존 지식</strong></a>
      <nav class="knowledge-nav" aria-label="주요 탐색"><a href="/?view=archive">세계 탐색</a><a href="/?view=story">이야기 읽기</a><a href="/knowledge/" aria-current="page">생존 지식</a></nav>
    </header>
    ${body}
  </div>
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
    return shell(`${brief.title} | 생존일기`, brief.meta_description, path, renderer.render(publicBriefData(brief, data)), breadcrumb + structured, true)
  }
  const cards = published.map((brief) => `<a class="knowledge-card" href="/knowledge/${esc(brief.slug)}/"><span class="meta">자료 확인 ${esc(brief.source_checked_at)}</span><h2>${esc(brief.label)}</h2><small class="card-question">${esc(brief.title)}</small><p>${esc(brief.summary)}</p><strong>글 읽기 →</strong></a>`).join('\n')
  const index = shell('생존 지식 | 생존일기', '게임과 이야기에서 시작한 질문을 현실의 공식 자료와 검토 가능한 근거로 정리하는 생존 지식 아카이브.', '/knowledge/', `<main><section class="knowledge-hero"><p class="knowledge-kicker">KNOWLEDGE ARCHIVE</p><h1>살아보며 생긴 질문을<br />현실의 지식으로 정리합니다.</h1><p>《생존일기》의 플레이와 이야기에서 생긴 질문을 출발점으로 삼되, 현실 정보는 별도의 자료 확인과 편집 검토를 거쳐 정리합니다. 글의 수보다 다시 찾아볼 가치가 있는 자료를 남기는 것을 우선합니다.</p></section><section aria-labelledby="latest-title"><p class="knowledge-kicker">LATEST</p><h2 id="latest-title">생존 지식글</h2><div class="knowledge-grid">${cards}</div></section><aside class="knowledge-policy"><strong>이 지식 아카이브의 기준</strong><br />창작 설정과 현실 정보는 구분합니다. 공식 자료의 내용, 이 사이트의 편집 제안, 아직 확인하지 못한 부분을 가능한 한 분리해서 표시합니다. 안전에 큰 영향을 주는 주제는 필요한 검토 수준을 확보하지 못하면 독자적인 실행 지침으로 게시하지 않습니다.</aside></main><footer class="knowledge-footer">생존일기 · 생존을 상상하고 경험하며, 현실에서 필요한 지식을 쌓아가는 공간.</footer>`)
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/knowledge/', ...published.map((brief) => `/knowledge/${brief.slug}/`)].map((path) => `  <url><loc>${esc(site + path)}</loc></url>`).join('\n')}\n</urlset>\n`
  const styles = await Promise.all(['wikiShell.css', 'survivalDesignLanguage.css'].map(async (name) => [join(root, 'archive/web/public/knowledge', name), (await readFile(join(root, 'archive/web/src/archive', name), 'utf8')).replace(/\r\n/g, '\n')]))
  const outputs = new Map([
    ...styles,
    [join(root, 'archive/web/public/knowledge/index.html'), index],
    [join(root, 'archive/web/public/sitemap.xml'), sitemap],
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
