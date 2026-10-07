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

test('all ten existing canonical routes retain original content, SEO, sitemap, downloads and relations', async () => {
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
    assert.ok(page.includes(`<title>${esc(brief.title)} | 생존일기</title>`))
    assert.ok(page.includes(`<meta name="description" content="${esc(brief.meta_description)}" />`))
    const url = data.config.site_origin + knowledgeHref(brief)
    assert.ok(page.includes(`<link rel="canonical" href="${url}" />`))
    assert.ok(sitemap.includes(`<loc>${url}</loc>`))
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
    assert.doesNotMatch(page, /knowledge-preview|<script(?! type="application\/ld\+json")/)
  }
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
