// Pure public HTML renderer: shared by the static generator and React wrapper.
// No Node/browser globals, package runtime, private evidence, or publication writes.
export const escapeKnowledgeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const esc = escapeKnowledgeHtml
export const knowledgeHref = (brief) => `/knowledge/${brief.slug}/`

export function knowledgeRiskLabel(risk) {
  if (risk === 'LOW') return '일반 준비 정보'
  if (risk === 'MEDIUM') return '주의가 필요한 정보'
  if (risk === 'HIGH') return '고위험 정보 · 공식 안내 우선'
  return '위험도 정보 없음'
}

export function knowledgeReviewState(brief) {
  const required = brief.publication_policy === 'HUMAN_APPROVED' || brief.risk_level === 'HIGH'
  // PUBLISHED is assigned by the approval consumer and rechecked by publicBriefs.
  // This records editorial approval, never professional/medical/legal validation.
  const completed = brief.status === 'PUBLISHED' && brief.publication_policy === 'HUMAN_APPROVED'
  return { required, completed, approved: brief.status === 'PUBLISHED' }
}

export function youtubeVideoId(value) {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value)) return null
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'youtu.be') return /^[A-Za-z0-9_-]{6,20}$/.test(url.pathname.slice(1)) ? url.pathname.slice(1) : null
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const direct = url.searchParams.get('v')
      if (direct && /^[A-Za-z0-9_-]{6,20}$/.test(direct)) return direct
      const parts = url.pathname.split('/').filter(Boolean)
      if (['shorts', 'embed', 'live'].includes(parts[0]) && /^[A-Za-z0-9_-]{6,20}$/.test(parts[1] ?? '')) return parts[1]
    }
  } catch {}
  return null
}

function renderBlock(block, brief) {
  if (block.type === 'prose') return `<p>${esc(block.text)}</p>`
  if (block.type === 'note') return `<aside class="knowledge-guide-note"><strong>주의</strong><p>${esc(block.text)}</p></aside>`
  if (block.type === 'ordered_list' || block.type === 'unordered_list') {
    const tag = block.type === 'ordered_list' ? 'ol' : 'ul'
    return `<${tag} class="knowledge-guide-${tag === 'ol' ? 'steps' : 'list'}">${block.items.map((item) => `<li>${esc(item)}</li>`).join('')}</${tag}>`
  }
  if (block.type === 'table') return `<div class="knowledge-guide-table-wrap"><table><thead><tr>${block.headers.map((cell) => `<th>${esc(cell)}</th>`).join('')}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  if (block.type === 'image') return `<figure class="knowledge-guide-media"><img src="${esc(block.src)}" alt="${esc(block.alt)}" loading="lazy" decoding="async" />${block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ''}</figure>`
  if (block.type === 'youtube') {
    const id = youtubeVideoId(block.url)
    return id ? `<figure class="knowledge-guide-media"><div class="knowledge-guide-video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}" title="${esc(block.title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div></figure>` : ''
  }
  if (block.type === 'download/tool') {
    const tool = brief.tools.find((item) => item.path === block.tool_path)
    return `<a class="knowledge-guide-tool" href="${esc(block.tool_path)}" download><strong>${esc(tool?.title ?? '실전 자료')}</strong><span>${esc(tool?.description ?? '다운로드 가능한 자료')}</span><b>${esc(tool?.label ?? '자료 다운로드')}</b></a>`
  }
  return ''
}

export function renderKnowledgeDetail(brief) {
  const review = knowledgeReviewState(brief)
  const related = (brief.related_briefs ?? []).map((item) => `<p><a href="${esc(knowledgeHref(item))}"><strong>${esc(item.label)} →</strong><small class="related-question">${esc(item.title)}</small></a></p>`).join('')
  const stories = (brief.related_stories ?? []).map((item) => `<p><a href="${esc(item.path)}">${esc(item.title)} →</a></p>`).join('')
  const guide = brief.related_guide
  return `<div class="knowledge-guide-frame">
    <nav class="wiki-breadcrumb" aria-label="현재 위치"><a href="/">생존일기</a><span>›</span><a href="/knowledge/">생존 지식</a><span>›</span><strong>${esc(brief.label)}</strong></nav>
    <article class="knowledge-guide">
      <header class="knowledge-guide-header"><p class="wiki-document-kicker">생존 지식 · ${esc(brief.id)}</p><h1>${esc(brief.label)}</h1><p class="knowledge-guide-question article-question">${esc(brief.title)}</p><p class="knowledge-guide-lead">${esc(brief.lead)}</p>
        <div class="knowledge-guide-meta"><span>위험도 · ${esc(knowledgeRiskLabel(brief.risk_level))}</span><span>사람 편집 검토 · ${review.required ? '대상' : '필수 아님'}</span><span>검토 상태 · ${review.completed ? '편집 검토 완료' : review.required ? '편집 검토 대기' : '자동 게시 기준 충족'}</span><span>공개 상태 · ${review.approved ? '공개 승인 완료' : '공개 승인 전'}</span><span>범위 · ${esc(brief.scope)}</span><span>자료 확인 · ${esc(brief.source_checked_at)}</span><span>게시 · <time datetime="${esc(brief.published_at)}">${esc(brief.published_at)}</time></span>${brief.updated_at && brief.updated_at !== brief.published_at ? `<span>수정 · <time datetime="${esc(brief.updated_at)}">${esc(brief.updated_at)}</time></span>` : ''}</div>
      </header>
      <section class="knowledge-guide-summary" aria-labelledby="guide-summary-title"><div><p class="wiki-document-kicker">한눈에 보기</p><h2 id="guide-summary-title">핵심 요약</h2></div><p>${esc(brief.summary)}</p><dl><div><dt>적용 범위</dt><dd>${esc(brief.scope)}</dd></div><div><dt>근거</dt><dd>${esc(brief.basis)}</dd></div></dl></section>
      <nav class="knowledge-guide-toc" aria-label="글 목차"><strong>목차</strong><ol>${brief.sections.map((section, index) => `<li><a href="#guide-section-${index + 1}">${esc(section.heading)}</a></li>`).join('')}</ol></nav>
      <div class="knowledge-guide-body">${brief.sections.map((section, index) => `<section id="guide-section-${index + 1}"><h2><span>${index + 1}.</span> ${esc(section.heading)}</h2>${section.blocks.map((block) => renderBlock(block, brief)).join('\n')}</section>`).join('\n')}</div>
      <section class="knowledge-guide-sources" aria-labelledby="guide-sources-title"><div class="wiki-section-heading"><h2 id="guide-sources-title">근거와 출처</h2><span>${brief.sources.length}개</span></div><div>${brief.sources.map((source) => `<article><div><strong>${esc(source.title)}</strong><small>확인일 · ${esc(source.checked_at)}</small></div><p>${esc(source.note)}</p><a href="${esc(source.url)}" target="_blank" rel="noreferrer">원문 출처 보기 ↗</a></article>`).join('')}</div></section>
      ${related ? `<section class="knowledge-guide-related"><h2>관련 글</h2>${related}</section>` : ''}
      ${guide ? `<section class="knowledge-guide-related"><h2>더 깊게 알아보기</h2><p><a href="/knowledge/guides/${esc(guide.slug)}/">전문 가이드 보기 →</a></p></section>` : ''}
      ${stories ? `<section class="knowledge-guide-related"><h2>관련 이야기</h2>${stories}</section>` : ''}
      <footer class="knowledge-guide-footer"><p>${esc(brief.footer)}</p><p>${review.completed ? '사람의 편집 검토와 공개 승인을 거친 글입니다.' : 'AI 보조 작성 · 자동 게시 기준을 충족한 글입니다.'}</p></footer>
    </article>
  </div>`.replace(/^[ \t]+$/gm, '')
}
