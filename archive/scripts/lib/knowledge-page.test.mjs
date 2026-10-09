import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadKnowledge, root } from './knowledge-content.mjs'
import { publicBriefs, publicBriefData } from './knowledge-public.mjs'
import { createKnowledgePageRenderer } from '../../web/render-knowledge.mjs'
const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const knowledgeHref = (brief) => '/knowledge/' + brief.slug + '/'
let renderer
before(async () => { renderer = await createKnowledgePageRenderer() })
after(async () => { await renderer?.close() })
const renderKnowledgeDetail = (brief) => renderer.render(brief)
const knowledgeReviewState = (brief) => renderer.reviewState(brief)

test('all existing canonical routes retain original content, SEO, sitemap, downloads and relations', async () => {
  const data = await loadKnowledge()
  const published = await publicBriefs(data)
  const existingSlugs = ['emergency-supplies-inventory', 'family-emergency-contact-plan', 'information-status-handoff', 'community-role-delegation', 'evacuation-decision-planning', 'community-mutual-aid-agreement', 'emergency-route-redundancy', 'emergency-map-information-access', 'emergency-external-personnel-credentialing', 'apartment-power-outage-scope-check']
  for (const slug of existingSlugs) assert.ok(published.some((brief) => brief.slug === slug), slug)
  const sitemap = await readFile(join(root, 'archive/web/public/sitemap.xml'), 'utf8')
  for (const brief of published) {
    const page = await readFile(join(root, 'archive/web/public/knowledge', brief.slug, 'index.html'), 'utf8')
    const normalizedPage = page.replaceAll('&#x27;', '&#39;')
    const projection = publicBriefData(brief, data)
    assert.ok(page.includes(renderKnowledgeDetail(projection)), brief.id + ': shared renderer')
    assert.ok(page.includes(`<title>${esc(brief.label?.trim() || brief.title)} | 생존일기</title>`))
    assert.ok(page.includes(`<meta name="description" content="${esc(brief.meta_description)}" />`))
    const url = data.config.site_origin + knowledgeHref(brief)
    assert.ok(page.includes(`<link rel="canonical" href="${url}" />`))
    assert.ok(sitemap.includes(`<loc>${url}</loc>`))
    assert.equal([...page.matchAll(/<title>/g)].length, 1)
    assert.equal([...page.matchAll(/<meta name="description"/g)].length, 1)
    assert.equal([...page.matchAll(/<link rel="canonical"/g)].length, 1)
    const og = [...page.matchAll(/<meta property="(og:[^"]+)" content="([^"]*)" \/>/g)]
    assert.equal(og.length, 6)
    assert.equal(new Set(og.map((tag) => tag[1])).size, 6)
    assert.deepEqual(Object.fromEntries(og.map((tag) => [tag[1], tag[2]])), {
      'og:title': esc((brief.label?.trim() || brief.title) + ' | 생존일기'),
      'og:description': esc(brief.meta_description), 'og:type': 'article',
      'og:url': esc(url), 'og:site_name': '생존일기', 'og:locale': 'ko_KR',
    })
    assert.doesNotMatch(page, /noindex|site-verification|property="og:image"/)
    const schemas = [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((match) => JSON.parse(match[1]))
    assert.deepEqual(schemas.map((schema) => schema['@type']), ['BreadcrumbList', 'Article'])
    assert.equal(schemas[1].headline, brief.title)
    assert.equal(schemas[1].description, brief.meta_description)
    assert.equal(schemas[1].mainEntityOfPage, url)
    assert.equal(schemas[1].datePublished, brief.published_at)
    assert.equal(schemas[1].dateModified, brief.updated_at)
    assert.equal(schemas[0].itemListElement[1].item, url)
    assert.deepEqual(projection.sections, brief.sections)
    for (const section of brief.sections) {
      assert.ok(normalizedPage.includes(esc(section.heading)))
      for (const block of section.blocks) {
        for (const value of [block.text, ...(block.items ?? []), ...(block.headers ?? []), ...(block.rows ?? []).flat()].filter(Boolean)) assert.ok(page.replaceAll('&#x27;', '&#39;').includes(esc(value)), brief.id + ': original body')
        if (block.type === 'image') assert.ok(page.includes(`src="${esc(block.src)}"`))
        if (block.type === 'youtube') assert.ok(page.includes('youtube-nocookie.com/embed/'))
      }
    }
    for (const tool of brief.tools) {
      assert.ok(page.includes(`href="${tool.path}" download`))
      assert.ok((await readFile(join(root, 'archive/web/public', tool.path))).length > 0)
    }
    for (const source of brief.sources) assert.ok(normalizedPage.includes(esc(source.url)))
    for (const related of projection.related_briefs) assert.ok(page.includes(`href="${knowledgeHref(related)}"`))
    for (const story of projection.related_stories) assert.ok(page.includes(`href="${esc(story.path)}"`))
    assert.doesNotMatch(page, /knowledge-preview/)
    // Static content and sources remain in the first HTML response. The
    // sole executable addition is one local, deferred, share-only script.
    const executableScripts = [...page.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
      .filter((tag) => !tag.includes('type="application/ld+json"'))
    assert.deepEqual(executableScripts, ['<script defer src="/knowledge/share.js">'])
    assert.ok(page.includes('<meta name="twitter:card" content="summary" />'))
    assert.ok(page.includes('data-knowledge-share'))
    assert.ok(page.includes('value="' + esc(url) + '" readonly'))
    assert.ok(page.includes('data-knowledge-share-actions hidden'))
    assert.match(page, /<section class="knowledge-share"[^>]*data-knowledge-share>/)
    assert.doesNotMatch(page, /class="knowledge-share-panel"|<summary>공유 옵션<\/summary>/)
    for (const platform of ['naver', 'x', 'facebook']) {
      assert.ok(page.includes('data-knowledge-' + platform + '-share target="_blank" rel="noopener noreferrer"'))
    }
    assert.ok(page.indexOf('data-knowledge-share-actions hidden') < page.indexOf('id="knowledge-share-url"'))

  }
})

test('STEP 3-3 static guides keep fictional navigation apart from real-world evidence', async () => {
  const data=await loadKnowledge()
  const published=await publicBriefs(data)
  const linked=published.map(b=>({id:b.id,links:publicBriefData(b,data).related_stories}))
  assert.equal(linked.filter(x=>x.links.length).length,10)
  assert.equal(linked.reduce((n,x)=>n+x.links.length,0),12)
  assert.deepEqual(linked.find(x=>x.id==='K-013').links,[])
  const route=await readFile(join(root,'archive/web/public/knowledge/emergency-route-redundancy/index.html'),'utf8')
  assert.ok(route.includes('관련 이야기 · 작품 속 장면'))
  assert.ok(route.includes('현실의 재난 대응 수칙이나 이 글의 근거 자료는 아닙니다.'))
  assert.ok(route.includes('/visual-assets/12267791ac6cafd5bf762135a3794990c7b777269cb3daeded85131796e58149.png'))
  assert.ok(route.includes('loading="lazy"'))
  for (const slug of ['emergency-supplies-inventory','family-emergency-contact-plan']) {
    const page=await readFile(join(root,'archive/web/public/knowledge',slug,'index.html'),'utf8')
    assert.ok(page.includes('연결 상태 업데이트: 본문에 남아 있는'))
    assert.ok(page.includes('이후 공개 Reader 원문을 확인해 아래 작품 장면을 연결했습니다.'))
  }
  const credential=await readFile(join(root,'archive/web/public/knowledge/emergency-external-personnel-credentialing/index.html'),'utf8')
  assert.ok(!credential.includes('관련 이야기 · 작품 속 장면'))
})

test('media and all relation types render together without data loss or unsafe HTML', async () => {
  const data = await loadKnowledge()
  const brief = structuredClone(data.briefs.find((item) => item.id === 'K-002'))
  brief.sections.push({ heading: '미디어 <확인>', blocks: [
    { type: 'image', src: 'https://example.com/photo.webp?a=1&b=2', alt: '이미지 "설명"', caption: '<script>alert(1)</script>' },
    { type: 'youtube', url: 'https://youtu.be/AbCdEf12345', title: '영상 "제목"' },
  ] })
  data.guides.push({ id: 'G-test', status: 'PUBLISHED', slug: 'fixture-guide', title: '심화 가이드' })
  data.stories.push({ id: 'S-test', verified: true, title: '관련 이야기 <장면>', path: '/?view=story&chronicle=C01-HAN-JUNHO' })
  brief.guide_id = 'G-test'
  brief.story_refs = ['S-test']
  const projected = publicBriefData(brief, data)
  assert.deepEqual(projected.sections, brief.sections)
  const html = renderKnowledgeDetail(projected)
  assert.ok(html.includes('src="https://example.com/photo.webp?a=1&amp;b=2"'))
  assert.ok(html.includes('alt="이미지 &quot;설명&quot;"'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(html.includes('https://www.youtube-nocookie.com/embed/AbCdEf12345'))
  assert.ok(html.includes('allowFullScreen'))
  assert.ok(html.includes(`href="${brief.tools[0].path}" download`))
  assert.ok(html.includes('/knowledge/family-emergency-contact-plan/'))
  assert.ok(html.includes('/knowledge/guides/fixture-guide/'))
  assert.ok(html.includes('href="/?view=story&amp;chronicle=C01-HAN-JUNHO"'))
  assert.doesNotMatch(html, /<script>/)
})

test('risk, editorial review requirement/completion and public approval are separate', async () => {
  const data = await loadKnowledge()
  const high = (await publicBriefs(data)).find((item) => item.id === 'K-014')
  assert.equal(high.risk_level, 'HIGH')
  assert.deepEqual(knowledgeReviewState(high), { required: true, completed: true, approved: true })
  const html = renderKnowledgeDetail(publicBriefData(high, data))
  for (const text of ['고위험 정보', '사람 편집 검토 · 대상', '편집 검토 완료', '공개 승인 완료']) assert.ok(html.includes(text))
  assert.doesNotMatch(html, /검토 대기|사람 검토가 필요한|전문가 검증|의료 전문가|법률 전문가/)
  assert.deepEqual(knowledgeReviewState({ ...high, status: 'READY' }), { required: true, completed: false, approved: false })
  assert.deepEqual(knowledgeReviewState({ status: 'PUBLISHED', risk_level: 'LOW', publication_policy: 'AUTO_LOW_RISK' }), { required: false, completed: false, approved: true })
})

test('media permission is scoped to knowledge while executable code and Operator remain restricted', async () => {
  const config = await readFile(join(root, 'archive/web/netlify.toml'), 'utf8')
  const policies = [...config.matchAll(/Content-Security-Policy = "([^"]+)"/g)].map((match) => match[1])
  assert.equal(policies.length, 2)
  assert.ok(policies[0].includes("img-src 'self' data:;"))
  assert.ok(!policies[0].includes('frame-src'))
  assert.ok(config.includes('for = "/knowledge/*"'))
  assert.ok(policies[1].includes("img-src 'self' data: https:;"))
  assert.ok(policies[1].includes('frame-src https://www.youtube-nocookie.com;'))
  for (const policy of policies) assert.ok(policy.includes("script-src 'self';"))
})


test('robots and sitemap discover exactly the approved public pages without blocking assets or Operator noindex', async () => {
  const data = await loadKnowledge()
  const published = await publicBriefs(data)
  const origin = data.config.site_origin
  const robots = await readFile(join(root, 'archive/web/public/robots.txt'), 'utf8')
  assert.equal(robots.replaceAll('\r\n', '\n'), 'User-agent: *\nAllow: /\n\nSitemap: ' + origin + '/sitemap.xml\n')
  assert.doesNotMatch(robots, /noindex|Disallow:/i)
  const sitemap = await readFile(join(root, 'archive/web/public/sitemap.xml'), 'utf8')
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((item) => item[1])
  assert.deepEqual(urls, ['/', '/knowledge/', ...published.map(knowledgeHref)].map((path) => origin + path))
  assert.equal(new Set(urls).size, urls.length)
  assert.doesNotMatch(sitemap, /operator|knowledge-preview|deploy-preview|lastmod|priority|changefreq/)
  const index = await readFile(join(root, 'archive/web/public/knowledge/index.html'), 'utf8')
  for (const brief of published) assert.ok(index.includes('href="' + knowledgeHref(brief) + '"'))
  for (const brief of data.briefs.filter((item) => item.status !== 'PUBLISHED')) {
    assert.ok(!urls.includes(origin + knowledgeHref(brief)))
    assert.ok(!index.includes('href="' + knowledgeHref(brief) + '"'))
  }
  assert.ok(index.includes('<meta property="og:type" content="website" />'))
  assert.doesNotMatch(index, /noindex|site-verification/)
  const config = await readFile(join(root, 'archive/web/netlify.toml'), 'utf8')
  assert.ok(config.includes('for = "/operator*"'))
  assert.ok(config.includes('X-Robots-Tag = "noindex, nofollow, noarchive"'))
})

test('static Knowledge menu matches the existing public navigation and exposes a working home search link', async () => {
  const data = await loadKnowledge()
  const published = await publicBriefs(data)
  const labels = ['생존 지식', '자료실', '생존 이야기', '세계관 위키']
  assert.deepEqual(renderer.navigation.map((item) => item.label), labels)
  for (const path of ['index.html', ...published.map((brief) => brief.slug + '/index.html')]) {
    const page = await readFile(join(root, 'archive/web/public/knowledge', path), 'utf8')
    const menu = page.match(/<nav class="knowledge-nav"[^>]*>(.*?)<\/nav>/s)[1]
    const links = [...menu.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
    assert.deepEqual(links.slice(0, 4).map((item) => ({ href: item[1], label: item[2] })), renderer.navigation.map((item) => ({ href: esc(item.href), label: item.label })))
    assert.ok(menu.includes('href="/knowledge/" aria-current="page"'))
    assert.ok(menu.includes('href="/#site-search">검색</a>'))
    assert.ok(page.includes('<span>생존 지식과 이야기</span>'))
    assert.doesNotMatch(menu, /<input|<form/)
  }
})

test('canonical index reuses the existing Library UI as static HTML with original SEO and every public guide', async () => {
  const data = await loadKnowledge()
  const published = await publicBriefs(data)
  const projections = published.map((brief) => publicBriefData(brief, data))
  const page = await readFile(join(root, 'archive/web/public/knowledge/index.html'), 'utf8')
  assert.ok(page.includes(renderer.renderLibrary(projections)))
  assert.equal([...page.matchAll(/class="wiki-topbar"/g)].length, 0)
  assert.ok(page.includes('class="knowledge-library-list"'))
  assert.ok(page.includes('href="/knowledge/wikiShell.css"'))
  assert.ok(page.includes('href="/knowledge/survivalDesignLanguage.css"'))
  assert.ok(page.includes('<title>생존 지식 | 생존일기</title>'))
  assert.ok(page.includes('<meta name="description" content="게임과 이야기에서 시작한 질문을 현실의 공식 자료와 검토 가능한 근거로 정리하는 생존 지식 아카이브." />'))
  assert.ok(page.includes('<link rel="canonical" href="' + data.config.site_origin + '/knowledge/" />'))
  assert.equal([...page.matchAll(/<meta property="og:/g)].length, 6)
  assert.ok(page.includes('<meta property="og:type" content="website" />'))
  for (const id of ['household', 'information', 'evacuation', 'community']) {
    assert.ok(page.includes('data-knowledge-category="' + id + '"'))
  }
  const colorStyles = await readFile(join(root, 'archive/web/public/knowledge/wikiShell.css'), 'utf8')
  assert.ok(colorStyles.includes('STEP 3-2 subject cues'))
  assert.ok(colorStyles.includes('--knowledge-topic-tint'))
  for (const brief of published) assert.ok(page.includes('href="' + knowledgeHref(brief) + '"'))
  assert.doesNotMatch(page, /<script|knowledge-card|knowledge-hero|noindex/)
  const added = { ...projections[0], id: 'K-fixture', slug: 'fixture-new-guide', label: '새 공개 가이드' }
  const html = renderer.renderLibrary([...projections, added])
  assert.ok(html.includes('/knowledge/fixture-new-guide/'))
  const categoryCount = projections.filter((brief) => brief.topic_id === added.topic_id).length + 1
  assert.ok(html.includes('<span>' + categoryCount + '개</span>'))
  for (const section of ['생활 대비', '연락·정보', '대피·이동', '공동 대응']) {
    assert.ok(html.includes(section))
  }
})
