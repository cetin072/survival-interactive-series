import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { root, loadKnowledge } from './knowledge-content.mjs'
import { publicBriefs } from './knowledge-public.mjs'
import { createKnowledgePageRenderer } from '../../web/render-knowledge.mjs'

test('home uses the approved projection and the actual component with real links', async () => {
  const renderer = await createKnowledgePageRenderer()
  try {
    const html = renderer.renderHome()
    assert.equal((html.match(/<h1>/g) ?? []).length, 1)
    for (const slug of ['apartment-power-outage-scope-check', 'emergency-supplies-inventory', 'family-emergency-contact-plan']) assert.ok(html.includes(`href="/knowledge/${slug}/"`))
    const data = await loadKnowledge()
    const allowed = new Set((await publicBriefs(data)).map(b => b.slug))
    for (const [, slug] of html.matchAll(/href="\/knowledge\/([^/#?]+)\/"/g)) assert.ok(allowed.has(slug), slug)
    assert.doesNotMatch(html, /\/operator|CORE_PRIVATE|HUMAN_REVIEW|READY_SUMMARY/)
    assert.ok(html.includes('href="/bag/"'))
    assert.equal(renderer.renderHome(), html)
  } finally { await renderer.close() }
})

test('head bootstrap preserves home but removes home metadata before client-only routes paint', async () => {
  const script = await readFile(root + '/archive/web/public/home-route.js', 'utf8')
  for (const [pathname, search, isHome] of [
    ['/', '', true], ['/', '?utm_source=test', true], ['/', '?view=story&chronicle=C01-HAN-JUNHO&chapter=one', false],
    ['/', '?view=wiki-preview&node=char-jinwoo', false], ['/operator/', '', false], ['/operator/knowledge/', '', false],
  ]) {
    const dataset = {}; let removed = false
    runInNewContext(script, { URLSearchParams, window: { location: { pathname, search } }, document: {
      documentElement: { dataset }, querySelectorAll: () => [{ remove() { removed = true } }],
    } })
    assert.equal(removed, !isHome)
    assert.equal(dataset.archiveClientRoute === 'true', !isHome)
  }
})
