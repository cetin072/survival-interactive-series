import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadKnowledge } from './knowledge-content.mjs'
import { publicBriefs, publicBriefData } from './knowledge-public.mjs'
import { assertPublicArtifacts } from '../check-knowledge-public.mjs'

test('public projection preserves approved bodies, sources and tools and strips nested private fields', async () => {
  const data = await loadKnowledge()
  const published = await publicBriefs(data)
  assert.ok(published.some((brief) => brief.id === 'K-014'))
  assert.ok(!published.some((brief) => ['K-004', 'K-005', 'K-006'].includes(brief.id)))
  const brief = structuredClone(published.find((brief) => brief.id === 'K-002'))
  brief.sections[0].operator_note = 'PRIVATE_SECTION'
  brief.sections[0].blocks[0].review = 'PRIVATE_BLOCK'
  brief.sources[0].operator_note = 'PRIVATE_SOURCE'
  const projected = publicBriefData(brief)
  assert.equal(projected.sections[0].blocks[0].text, brief.sections[0].blocks[0].text)
  assert.equal(projected.sources[0].url, brief.sources[0].url)
  assert.equal(projected.tools[0].path, brief.tools[0].path)
  assert.equal(projected.topic_id, brief.topic_id)
  assert.ok(!JSON.stringify(projected).includes('PRIVATE_'))
  assert.ok(!JSON.stringify(projected).includes(brief.editorial_note))
})

test('STEP 3-3 projects story examples without leaking internal quote pins', async () => {
  const data=await loadKnowledge()
  const k002=publicBriefData(data.briefs.find(b=>b.id==='K-002'),data)
  const k011=publicBriefData(data.briefs.find(b=>b.id==='K-011'),data)
  assert.deepEqual(k002.related_stories.map(s=>s.id),['afterfall-two-site-reserve','han-junho-supply-inventory'])
  assert.deepEqual(k011.related_stories.map(s=>s.id),['han-junho-route-backup','afterfall-dongcheon-bridge-access'])
  assert.ok(k011.related_stories[1].illustration.alt.includes('작품 삽화'))
  assert.deepEqual(publicBriefData(data.briefs.find(b=>b.id==='K-013'),data).related_stories,[])
  const projected=JSON.stringify([...k002.related_stories,...k011.related_stories])
  for(const secret of ['knowledge_links','reader_book_sha256','reader_chapter_sha256','source_refs','subject_id','quote'])
    assert.ok(!projected.includes('"'+secret+'"'),secret)
})

test('PUBLISHED alone cannot bypass existing public approval conditions', async () => {
  for (const mutation of [
    (brief, data) => { data.evidence.delete(brief.id) },
    (brief) => { brief.publication_policy = 'UNKNOWN' },
    (brief) => { brief.risk_level = 'HIGH' },
  ]) {
    const data = await loadKnowledge()
    const brief = data.briefs.find((item) => item.id === 'K-004')
    brief.status = 'PUBLISHED'
    brief.published_at = '2026-10-05'
    mutation(brief, data)
    await assert.rejects(publicBriefs(data), /KNOWLEDGE_PUBLIC_INELIGIBLE:K-004/)
  }
})

test('actual artifact scanner rejects draft content, escaped source maps and editorial notes', async () => {
  const data = await loadKnowledge()
  const dir = await mkdtemp(join(tmpdir(), 'knowledge-public-test-'))
  try {
    for (const id of ['K-004', 'K-005', 'K-006']) {
      const brief = data.briefs.find((item) => item.id === id)
      const text = brief.sections.flatMap((section) => section.blocks).find((block) => block.text?.length >= 30).text
      await writeFile(join(dir, 'asset.js.map'), JSON.stringify({ sourcesContent: [text] }))
      await assert.rejects(assertPublicArtifacts(data, dir), /KNOWLEDGE_PUBLIC_LEAK/)
    }
    await writeFile(join(dir, 'asset.js.map'), '{}')
    await writeFile(join(dir, 'page.html'), data.briefs[0].editorial_note)
    await assert.rejects(assertPublicArtifacts(data, dir), /KNOWLEDGE_PUBLIC_LEAK/)
    await writeFile(join(dir, 'page.html'), 'safe')
    assert.equal((await assertPublicArtifacts(data, dir)).files, 2)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
