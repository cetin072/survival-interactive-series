import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { generateEditorialQaPreview } from '../build-knowledge-editorial-qa-preview.mjs'

const root = resolve(import.meta.dirname, '../../..')
const json = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const briefDir = resolve(root, 'knowledge/content/briefs')
const briefs = readdirSync(briefDir).filter((name) => /^K-\d+\.json$/.test(name)).map((name) => json(`knowledge/content/briefs/${name}`))
const proposals = ['K-015', 'K-018'].map((id) => json(`knowledge/editorial-review/${id}.editorial-v2.json`))
const auditedIds = ['002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014', '016', '020', '021', '022', '023'].map((n) => `K-${n}`)
const origin = /^(《생존일기》에서 시작한 질문|이 질문이 생긴 실제 경험)$/
const assertEditorialBrief = (brief) => {
  assert.match(brief.id, /^K-\d+$/)
  assert.ok(brief.lead.split(/[.!?]/)[0].trim().length >= 20, `${brief.id} first sentence`)
  assert.ok(brief.sections.length >= 2, `${brief.id} sections`)
  assert.match(brief.sections.at(-1).heading, origin, `${brief.id} origin`)
  assert.ok(brief.sources.length > 0, `${brief.id} sources`)
}

test('the 18 audited main briefs remain present while later briefs may be added', () => {
  const actualIds = new Set(briefs.map((brief) => brief.id))
  assert.ok(auditedIds.every((id) => actualIds.has(id)))
  assert.equal(actualIds.size, briefs.length, 'duplicate Brief ID')
  assert.deepEqual(proposals.map((item) => item.proposed_brief.id), ['K-015', 'K-018'])
  assert.ok(proposals.every((item) => item.status === 'EDITORIAL_PROPOSAL_NOT_APPROVED'))
  assert.ok(proposals.every((item) => item.original.job_id && item.original.pr_number && item.original.semantic_result_sha256))
})

test('every current and future well-formed Brief is checked without a frozen ID list', () => {
  for (const brief of [...briefs, ...proposals.map((item) => item.proposed_brief)]) assertEditorialBrief(brief)
  const future = structuredClone(briefs.find((brief) => brief.id === 'K-023'))
  future.id = 'K-025'
  future.slug = 'future-editorial-brief-fixture'
  assert.doesNotThrow(() => [...briefs, future].forEach(assertEditorialBrief))
})

test('K-015 explains the water example before citing EPA and retains HIGH human review', () => {
  const brief = proposals[0].proposed_brief
  assert.equal(brief.risk_level, 'HIGH')
  assert.equal(brief.publication_policy, 'HUMAN_APPROVED')
  const water = brief.sections.find((section) => section.heading.includes('급수시설 두 곳'))
  assert.ok(water)
  const text = water.blocks.filter((block) => block.type === 'prose').map((block) => block.text).join(' ')
  assert.ok(text.indexOf('두 급수시설') >= 0 && text.indexOf('한 팀') > text.indexOf('두 급수시설'))
  assert.ok(text.indexOf('EPA') > text.indexOf('한 팀'))
})

test('published article IDs and URLs remain stable, with HUMAN_REVIEW proposals outside public content', () => {
  const published = briefs.filter((brief) => brief.status === 'PUBLISHED')
  assert.ok(published.length > 0)
  assert.ok(published.every((brief) => /^K-\d+$/.test(brief.id) && /^[a-z0-9-]+$/.test(brief.slug)))
  assert.ok(new Set(published.map((brief) => brief.slug)).size === published.length)
  assert.ok(proposals.every((item) => item.proposed_brief.risk_level === 'HIGH' && item.proposed_brief.publication_policy === 'HUMAN_APPROVED'))
})

test('offline QA renders both exact proposals with visible version binding and no approval controls', async () => {
  await assert.rejects(generateEditorialQaPreview(resolve(root, 'archive/web/public/knowledge/editorial-qa')), /OUTPUT_MUST_BE_OUTSIDE_REPOSITORY/)
  const output = await mkdtemp(join(tmpdir(), 'editorial-qa-test-'))
  try {
    const result = await generateEditorialQaPreview(output)
    assert.deepEqual(result.items.map((item) => item.id), ['K-015', 'K-018'])
    for (const item of result.items) {
      const source = readFileSync(resolve(root, `knowledge/editorial-review/${item.id}.editorial-v2.json`))
      assert.equal(item.proposal_sha256, createHash('sha256').update(source).digest('hex'))
      const html = await readFile(join(output, item.filename), 'utf8')
      assert.ok(html.includes(item.proposal_sha256))
      assert.ok(html.includes(item.original_semantic_result_sha256))
      assert.ok(html.includes(proposals.find((proposal) => proposal.proposed_brief.id === item.id).proposed_brief.lead))
      assert.match(html, /기존 Operator 사람검토 원고와 다른 버전 · 게시 및 승인 불가/)
      assert.match(html, /class="qa-sticky"/)
      assert.match(html, /게시 · 미게시 원고/)
      assert.doesNotMatch(html, /<button\b|<form\b|<script\b/i)
    }
    const k015 = await readFile(join(output, 'K-015.editorial-v2.qa.html'), 'utf8')
    const waterExample = k015.slice(k015.indexOf('급수시설 두 곳에서 동시에 요청이 왔다면'))
    assert.ok(waterExample.indexOf('두 급수시설') >= 0 && waterExample.indexOf('두 급수시설') < waterExample.indexOf('EPA'))
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'))
    assert.equal(manifest.publication_approval, false)
  } finally { await rm(output, { recursive: true, force: true }) }
})
