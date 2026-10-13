import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const json = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const briefDir = resolve(root, 'knowledge/content/briefs')
const briefs = readdirSync(briefDir).filter((name) => /^K-\d+\.json$/.test(name)).map((name) => json(`knowledge/content/briefs/${name}`))
const proposals = ['K-015', 'K-018'].map((id) => json(`knowledge/editorial-review/${id}.editorial-v2.json`))
const expectedIds = ['002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014', '016', '020', '021', '022', '023'].map((n) => `K-${n}`)
const origin = /^(《생존일기》에서 시작한 질문|이 질문이 생긴 실제 경험)$/

test('editorial audit covers exactly 18 main briefs and two unapproved review drafts', () => {
  assert.deepEqual(briefs.map((brief) => brief.id).sort(), expectedIds)
  assert.deepEqual(proposals.map((item) => item.proposed_brief.id), ['K-015', 'K-018'])
  assert.ok(proposals.every((item) => item.status === 'EDITORIAL_PROPOSAL_NOT_APPROVED'))
  assert.ok(proposals.every((item) => item.original.job_id && item.original.pr_number && item.original.semantic_result_sha256))
})

test('each revised brief keeps the answer at the start and provenance last', () => {
  for (const brief of [...briefs, ...proposals.map((item) => item.proposed_brief)]) {
    assert.ok(brief.lead.split(/[.!?]/)[0].trim().length >= 20, `${brief.id} first sentence`)
    assert.ok(brief.sections.length >= 2, `${brief.id} sections`)
    assert.match(brief.sections.at(-1).heading, origin, `${brief.id} origin`)
    assert.ok(brief.sources.length > 0, `${brief.id} sources`)
  }
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
  assert.ok(briefs.every((brief) => brief.id !== 'K-015' && brief.id !== 'K-018'))
  assert.ok(proposals.every((item) => item.proposed_brief.risk_level === 'HIGH' && item.proposed_brief.publication_policy === 'HUMAN_APPROVED'))
})
