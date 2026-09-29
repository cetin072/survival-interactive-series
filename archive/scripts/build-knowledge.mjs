import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadKnowledge, validateKnowledge, root } from './lib/knowledge-content.mjs'

const check = process.argv.includes('--check')
const data = await loadKnowledge()
await validateKnowledge(data)
const published = data.briefs.filter((brief) => brief.status === 'PUBLISHED')
  .sort((a, b) => b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id))
const byId = new Map(data.briefs.map((brief) => [brief.id, brief]))
const guides = new Map(data.guides.map((guide) => [guide.id, guide]))
const stories = new Map(data.stories.map((story) => [story.id, story]))
const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const site = data.config.site_origin
const shell = (title, description, canonical, body, schema = '') => `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(site + canonical)}" />
  <link rel="stylesheet" href="/knowledge/knowledge.css" />
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
const renderBlock = (block, brief) => {
  if (block.type === 'prose') return `<p>${esc(block.text)}</p>`
  if (block.type === 'note') return `<div class="article-note">${esc(block.text)}</div>`
  if (block.type === 'table') return `<div class="article-table-wrap"><table class="article-table"><thead><tr>${block.headers.map((cell) => `<th>${esc(cell)}</th>`).join('')}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  if (block.type === 'ordered_list' || block.type === 'unordered_list') {
    const tag = block.type === 'ordered_list' ? 'ol' : 'ul'
    return `<${tag}>${block.items.map((item) => `<li>${esc(item)}</li>`).join('')}</${tag}>`
  }
  const tool = brief.tools.find((item) => item.path === block.tool_path)
  return `<a class="download-button" href="${esc(tool.path)}" download>${esc(tool.label)}</a>`
}
const article = (brief) => {
  const path = `/knowledge/${brief.slug}/`
  const breadcrumb = jsonLd({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: '생존 지식', item: site + '/knowledge/' },
    { '@type': 'ListItem', position: 2, name: brief.title, item: site + path },
  ] })
  const structured = jsonLd({ '@context': 'https://schema.org', '@type': 'Article', headline: brief.title,
    description: brief.meta_description, mainEntityOfPage: site + path, datePublished: brief.published_at,
    dateModified: brief.updated_at, inLanguage: 'ko', author: { '@type': 'Organization', name: '생존일기' } })
  const sections = brief.sections.map((section) => `<section class="article-section"><h2>${esc(section.heading)}</h2>${section.blocks.map((block) => renderBlock(block, brief)).join('\n')}</section>`).join('\n')
  const sources = `<section class="article-section"><h2>출처와 확인 범위</h2><ul class="source-list">${brief.sources.map((source) => `<li><a href="${esc(source.url)}">${esc(source.title)}</a><br />${esc(source.note)} <strong>확인일 ${esc(source.checked_at)}.</strong></li>`).join('')}</ul></section>`
  const related = brief.related_brief_ids.filter((id) => byId.get(id)?.status === 'PUBLISHED').map((id) => byId.get(id))
  const relatedHtml = related.length ? `<section class="article-section"><h2>관련 글</h2>${related.map((item) => `<p><a href="/knowledge/${esc(item.slug)}/"><strong>${esc(item.title)} →</strong></a></p>`).join('')}</section>` : ''
  const guide = guides.get(brief.guide_id)
  const guideHtml = guide?.status === 'PUBLISHED' ? `<section class="article-section"><h2>더 깊게 알아보기</h2><p><a href="/knowledge/guides/${esc(guide.slug)}/">전문 가이드 보기 →</a></p></section>` : ''
  const storyHtml = brief.story_refs.length ? `<section class="article-section"><h2>관련 이야기</h2>${brief.story_refs.map((id) => { const story = stories.get(id); return `<p><a href="${esc(story.path)}">${esc(story.title)} →</a></p>` }).join('')}</section>` : ''
  const policy = brief.publication_policy === 'HUMAN_APPROVED' ? '기존 공개 글 · 편집 승인' : 'AI 보조 작성 · 자동 게시 후보'
  const body = `<main class="article-shell"><a class="article-back" href="/knowledge/">← 생존 지식으로</a>
    <article><header class="article-header"><p class="knowledge-kicker">${esc(brief.label)} · ${esc(brief.id)}</p><h1>${esc(brief.title)}</h1><p class="article-lead">${esc(brief.lead)}</p>
    <div class="article-meta"><span>자료 확인: ${esc(brief.source_checked_at)}</span><span>확인 범위: ${esc(brief.scope)}</span><span>근거: ${esc(brief.basis)}</span><span>게시: <time datetime="${esc(brief.published_at)}">${esc(brief.published_at)}</time></span>${brief.updated_at !== brief.published_at ? `<span>수정: <time datetime="${esc(brief.updated_at)}">${esc(brief.updated_at)}</time></span>` : ''}</div></header>
    ${sections}\n${sources}\n${relatedHtml}\n${guideHtml}\n${storyHtml}</article><footer class="knowledge-footer">${esc(brief.footer)}<br />${esc(policy)}</footer></main>`
  return shell(`${brief.title} | 생존일기`, brief.meta_description, path, body, breadcrumb + structured)
}
const cards = published.map((brief) => `<a class="knowledge-card" href="/knowledge/${esc(brief.slug)}/"><span class="meta">${esc(brief.label)} · 자료 확인 ${esc(brief.source_checked_at)}</span><h2>${esc(brief.title)}</h2><p>${esc(brief.summary)}</p><strong>글 읽기 →</strong></a>`).join('\n')
const index = shell('생존 지식 | 생존일기', '게임과 이야기에서 시작한 질문을 현실의 공식 자료와 검토 가능한 근거로 정리하는 생존 지식 아카이브.', '/knowledge/', `<main><section class="knowledge-hero"><p class="knowledge-kicker">KNOWLEDGE ARCHIVE</p><h1>살아보며 생긴 질문을<br />현실의 지식으로 정리합니다.</h1><p>《생존일기》의 플레이와 이야기에서 생긴 질문을 출발점으로 삼되, 현실 정보는 별도의 자료 확인과 편집 검토를 거쳐 정리합니다. 글의 수보다 다시 찾아볼 가치가 있는 자료를 남기는 것을 우선합니다.</p></section><section aria-labelledby="latest-title"><p class="knowledge-kicker">LATEST</p><h2 id="latest-title">생존 지식글</h2><div class="knowledge-grid">${cards}</div></section><aside class="knowledge-policy"><strong>이 지식 아카이브의 기준</strong><br />창작 설정과 현실 정보는 구분합니다. 공식 자료의 내용, 이 사이트의 편집 제안, 아직 확인하지 못한 부분을 가능한 한 분리해서 표시합니다. 안전에 큰 영향을 주는 주제는 필요한 검토 수준을 확보하지 못하면 독자적인 실행 지침으로 게시하지 않습니다.</aside></main><footer class="knowledge-footer">생존일기 · 생존을 상상하고 경험하며, 현실에서 필요한 지식을 쌓아가는 공간.</footer>`)
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/knowledge/', ...published.map((brief) => `/knowledge/${brief.slug}/`)].map((path) => `  <url><loc>${esc(site + path)}</loc></url>`).join('\n')}\n</urlset>\n`
const outputs = new Map([
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
