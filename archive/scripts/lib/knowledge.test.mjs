import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publicKnowledgeInventory, scanKnowledge, bootstrapKnowledge } from './knowledge-scan.mjs'
import { loadKnowledge, validateKnowledge, publicationEligibility, root } from './knowledge-content.mjs'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const manifestRef = 'archive/content/transcripts/C03-AFTERFALL/S99/SESSION_001/SOURCE_MANIFEST.json'
const raw = Buffer.from('## USER 000\n\nTEST_INPUT\n\n## GM 001\n\n## 2099년 1월 1일 10:00\n\nTEST_GM_PROSE\n')
async function fixture(edit = () => {}) {
  const base = await mkdtemp(join(tmpdir(), 'knowledge-scan-'))
  const seasonDir = join(base, 'archive/content/transcripts/C03-AFTERFALL/S99')
  const sessionDir = join(seasonDir, 'SESSION_001')
  await mkdir(sessionDir, { recursive: true })
  await mkdir(join(base, 'knowledge/automation'), { recursive: true })
  const range = { start: '2099-01-01 10:00', end: '2099-01-01 10:00' }
  const session = { session_id: 'SESSION_001', visibility: 'PUBLIC_ARCHIVE', capture_quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic_pairing_complete: true,
    source_manifest: 'SESSION_001/SOURCE_MANIFEST.json', coverage_basis: 'captured_message_range', captured_message_range: range, user_messages: 1, gm_public_blocks: 1 }
  const season = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S99', archive_class: 'COLD_RAW', visibility: 'PUBLIC_ARCHIVE', sessions: [session] }
  const source = { chronicle_id: season.chronicle_id, worldline_id: season.worldline_id, season_id: season.season_id, session_id: session.session_id,
    visibility: 'PUBLIC_ARCHIVE', public_safe_only: true, closed_at: '2099-01-01', atomic_pairing_complete: true,
    capture_quality: session.capture_quality, coverage_basis: 'captured_message_range', captured_message_range: range,
    counts: { user: 1, gm: 1, total: 2 }, message_order: { min: 0, max: 1, contiguous: true },
    content_sha256: [{ message_order: 0, role: 'USER', sha256: sha('TEST_INPUT') }, { message_order: 1, role: 'GM', sha256: sha('TEST_GM_PROSE') }],
    parts: ['PART_001.md'], parts_sha256: { 'PART_001.md': sha(raw) } }
  edit({ season, session, source })
  await writeFile(join(seasonDir, 'MANIFEST.json'), JSON.stringify(season))
  await writeFile(join(sessionDir, 'SOURCE_MANIFEST.json'), JSON.stringify(source))
  await writeFile(join(sessionDir, 'PART_001.md'), raw)
  await writeFile(join(base, 'knowledge/automation/state.json'), JSON.stringify({ version: 1, sources: [] }))
  return base
}
const empty = () => ({ version: 1, sources: [] })
const record = (item, status = 'PROCESSED') => ({ source_manifest_ref: item.source_manifest_ref, source_manifest_sha256: item.source_manifest_sha256,
  status, processed_at: '2026-09-27T00:00:00.000Z', candidate_ids: [], brief_ids: [] })

test('bootstrap existing public input then NOOP without falsely marking processed', async () => {
  const base = await fixture()
  try {
    const items = await publicKnowledgeInventory(base)
    assert.equal(await bootstrapKnowledge(base, items, empty(), '2026-09-27T00:00:00.000Z'), 1)
    const state = JSON.parse(await readFile(join(base, 'knowledge/automation/state.json')))
    assert.equal(state.sources[0].status, 'BASELINE_PRE_V1')
    assert.equal(scanKnowledge(items, state).status, 'NOOP')
    assert.equal(await bootstrapKnowledge(base, items, state, '2026-09-28T00:00:00.000Z'), 0)
  } finally { await rm(base, { recursive: true, force: true }) }
})
test('new verified public source is pending exactly once and repeat scan is deterministic', async () => {
  const base = await fixture()
  try {
    const items = await publicKnowledgeInventory(base)
    assert.equal(items.length, 1)
    const first = scanKnowledge(items, empty())
    assert.equal(first.status, 'PENDING')
    assert.equal(first.sources.length, 1)
    assert.deepEqual(scanKnowledge(items, empty()), first)
    const processed = scanKnowledge(items, { version: 1, sources: [record(items[0])] })
    assert.equal(processed.status, 'NOOP')
    assert.equal(processed.ignored[0].status, 'NOOP_ALREADY_PROCESSED')
    assert.equal(scanKnowledge([{ ...items[0], source_manifest_sha256: 'f'.repeat(64) }], { version: 1, sources: [record(items[0])] }).status, 'SOURCE_CHANGED_RESCAN_REQUIRED')
  } finally { await rm(base, { recursive: true, force: true }) }
})
for (const [name, edit] of [
  ['non-public season', ({ season }) => { season.visibility = 'PLAYER_ARCHIVE' }],
  ['partial session', ({ session }) => { session.capture_quality = 'PARTIAL_CAPTURE_INCOMPLETE_PAIRING'; session.atomic_pairing_complete = false }],
]) test(`${name} is not a knowledge input`, async () => {
  const base = await fixture(edit)
  try { assert.deepEqual(await publicKnowledgeInventory(base), []) }
  finally { await rm(base, { recursive: true, force: true }) }
})
test('malformed approved source fails closed', async () => {
  const base = await fixture(({ source }) => { source.parts_sha256['PART_001.md'] = 'f'.repeat(64) })
  try { await assert.rejects(publicKnowledgeInventory(base), /INVALID_APPROVED_READER_SOURCE/) }
  finally { await rm(base, { recursive: true, force: true }) }
})
test('golden fixtures satisfy content contract and policy gate', async () => {
  const data = await loadKnowledge(root)
  assert.equal(await validateKnowledge(data), true)
  for (const brief of data.briefs) {
    assert.equal(brief.status, 'PUBLISHED')
    assert.equal(brief.publication_policy, 'HUMAN_APPROVED')
    assert.equal(publicationEligibility(brief, data.evidence.get(brief.id), data.config), 'HUMAN_REVIEW')
  }
  const brief = { ...data.briefs[0], id: 'K-999', slug: 'test-only', status: 'READY', publication_policy: 'AUTO_LOW_RISK' }
  const evidence = data.evidence.get('K-002')
  assert.equal(publicationEligibility(brief, evidence, data.config), 'AUTO_PUBLISH_ELIGIBLE')
  assert.equal(publicationEligibility({ ...brief, risk_level: 'HIGH' }, evidence, data.config), 'HUMAN_REVIEW')
  assert.equal(publicationEligibility({ ...brief, content_type: 'GUIDE' }, evidence, data.config), 'HUMAN_REVIEW')
  assert.equal(publicationEligibility(brief, null, data.config), 'HOLD')
  assert.equal(publicationEligibility(brief, { ...evidence, conflicts: ['unresolved'] }, data.config), 'HOLD')
  assert.equal(publicationEligibility({ ...brief, risk_domains: ['WATER_PURIFICATION'] }, evidence, data.config), 'HUMAN_REVIEW')
})
test('AUTO_LOW_RISK READY and PUBLISHED must pass the same publication gate', async () => {
  const data = await loadKnowledge(root)
  const auto = { ...data.briefs[0], publication_policy: 'AUTO_LOW_RISK' }
  const withAuto = (patch = {}, evidence = data.evidence) => ({
    ...data, briefs: [{ ...auto, ...patch }, ...data.briefs.slice(1)], evidence,
  })
  const pack = data.evidence.get(auto.id)

  assert.equal(publicationEligibility({ ...auto, status: 'READY' }, pack, data.config), 'AUTO_PUBLISH_ELIGIBLE')
  assert.equal(await validateKnowledge(withAuto({ status: 'READY' })), true)
  assert.equal(publicationEligibility({ ...auto, status: 'PUBLISHED' }, pack, data.config), 'AUTO_PUBLISH_ELIGIBLE')
  assert.equal(await validateKnowledge(withAuto({ status: 'PUBLISHED' })), true)

  const missingEvidence = new Map(data.evidence)
  missingEvidence.delete(auto.id)
  await assert.rejects(validateKnowledge(withAuto({ status: 'PUBLISHED' }, missingEvidence)), /evidence/)

  const conflictedEvidence = new Map(data.evidence)
  conflictedEvidence.set(auto.id, { ...pack, conflicts: ['unresolved'] })
  await assert.rejects(validateKnowledge(withAuto({ status: 'PUBLISHED' }, conflictedEvidence)), /publication eligibility/)
  await assert.rejects(validateKnowledge(withAuto({ status: 'PUBLISHED', risk_domains: ['WATER_PURIFICATION'] })), /publication eligibility/)
  await assert.rejects(validateKnowledge(withAuto({ status: 'PUBLISHED', risk_level: 'HIGH' })), /publication eligibility/)
  await assert.rejects(validateKnowledge(withAuto({ status: 'PUBLISHED', risk_domains: ['WATER_PURIFCATION'] })), /risk domains/)
  await assert.rejects(validateKnowledge(withAuto({ status: 'READY', risk_domains: ['UNCLASSIFIED'] })), /risk domains/)
})
test('duplicate identity, broken relations and missing downloads fail validation', async () => {
  const data = await loadKnowledge(root)
  await assert.rejects(validateKnowledge({ ...data, briefs: [...data.briefs, { ...data.briefs[0] }] }), /duplicate or invalid brief id/)
  await assert.rejects(validateKnowledge({ ...data, briefs: [{ ...data.briefs[0], related_brief_ids: ['K-999'] }, data.briefs[1]] }), /related ref/)
  const broken = { ...data.briefs[0],
    tools: [{ ...data.briefs[0].tools[0], path: '/knowledge/downloads/missing.xlsx' }],
    sections: data.briefs[0].sections.map((section) => ({ ...section, blocks: section.blocks.map((block) => block.type === 'download/tool' ? { ...block, tool_path: '/knowledge/downloads/missing.xlsx' } : block) })) }
  await assert.rejects(validateKnowledge({ ...data, briefs: [broken, data.briefs[1]] }), /broken tool/)
})
test('generated golden pages remain static, searchable, linked and downloadable', async () => {
  const data = await loadKnowledge(root)
  const index = await readFile(join(root, 'archive/web/public/knowledge/index.html'), 'utf8')
  const sitemap = await readFile(join(root, 'archive/web/public/sitemap.xml'), 'utf8')
  for (const brief of data.briefs) {
    const page = await readFile(join(root, 'archive/web/public/knowledge', brief.slug, 'index.html'), 'utf8')
    assert.match(index, new RegExp(`/knowledge/${brief.slug}/`))
    assert.match(sitemap, new RegExp(`/knowledge/${brief.slug}/`))
    assert.ok(page.includes(`<h1>${brief.title}</h1>`))
    assert.ok(page.includes(`<title>${brief.title} | 생존일기</title>`))
    assert.ok(page.includes(brief.meta_description))
    assert.ok(page.includes('https://schema.org'))
    assert.ok(page.includes('rel="canonical"'))
    for (const source of brief.sources) assert.ok(page.includes(source.url.replace(/&/g, '&amp;')))
    for (const related of brief.related_brief_ids) assert.ok(page.includes(`/knowledge/${data.briefs.find((item) => item.id === related).slug}/`))
    for (const tool of brief.tools) assert.ok(page.includes(`href="${tool.path}" download`))
    assert.doesNotMatch(page, /<script(?! type="application\/ld\+json")/)
  }
})
