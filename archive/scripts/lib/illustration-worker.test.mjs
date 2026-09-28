import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendIllustrationReceipt, createProvider, createShadowReport, selectIllustrationCandidates } from './illustration-worker.mjs'

const point = (id, priority = 10, overrides = {}) => ({
  point_id: `point-${id.repeat(64)}`,
  generation_key: `generation-${id.repeat(64)}`,
  subject_id: `subject-${id}`,
  priority,
  status: 'READY',
  title: `Subject ${id}`,
  brief: { subject: { label: `Subject ${id}` }, canon_facts: { fact: 'source' }, safeguards: ['Do not invent facts.'] },
  ...overrides,
})
const receipt = (p, status, last_run_at = '2026-09-28T01:00:00.000Z', attempt_count = 1) => ({
  point_id: p.point_id, generation_key: p.generation_key, subject_id: p.subject_id,
  attempt_count, last_status: status, last_run_at,
})
const select = ({ points, assets = [], attempts = [], batchLimit = 3, now = new Date('2026-09-28T05:00:00.000Z'), subjectIds = null }) => selectIllustrationCandidates({
  catalog: { points }, siteAssets: { assets }, receipts: { version: 'illustration-receipts-v1', attempts }, now, batchLimit, subjectIds,
})

test('selects only unpublished READY points with valid identities', () => {
  const ready = point('a'), pending = point('b', 1, { status: 'PENDING' }), invalid = point('c', 1, { generation_key: null })
  const plan = select({ points: [ready, pending, invalid] })
  assert.deepEqual(plan.candidates.map((item) => item.subject_id), [ready.subject_id])
  assert.equal(plan.counts.total_ready_points, 2)
  assert.equal(plan.counts.skipped_invalid_identity, 1)
})

test('skips existing site assets, previous success, and assets at the retry cap', () => {
  const published = point('a'), succeeded = point('b'), exhausted = point('c'), candidate = point('d')
  const plan = select({ points: [published, succeeded, exhausted, candidate], assets: [{ ...published }], attempts: [
    receipt(succeeded, 'SUCCEEDED'),
    receipt(exhausted, 'FAILED', '2026-09-27T23:00:00.000Z'),
    receipt(exhausted, 'FAILED', '2026-09-27T23:10:00.000Z'),
    receipt(exhausted, 'FAILED', '2026-09-27T23:20:00.000Z'),
  ] })
  assert.deepEqual(plan.candidates.map((item) => item.subject_id), [candidate.subject_id])
  assert.equal(plan.counts.skipped_existing_assets, 1)
  assert.equal(plan.counts.skipped_previous_success, 1)
  assert.equal(plan.counts.skipped_retry_cap, 1)
})

test('generation key changes create a new identity candidate', () => {
  const revised = point('a', 10, { generation_key: `generation-${'b'.repeat(64)}` })
  const plan = select({ points: [revised], attempts: [receipt(point('a'), 'SUCCEEDED')] })
  assert.equal(plan.candidates[0].generation_key, revised.generation_key)
})

test('orders higher priority first and enforces the batch limit', () => {
  const plan = select({ points: [point('a', 1), point('b', 25), point('c', 15), point('d', 30)], batchLimit: 3 })
  assert.deepEqual(plan.candidates.map((item) => item.priority), [30, 25, 15])
})

test('applies the daily attempt cap across identities', () => {
  const candidates = Array.from({ length: 8 }, (_, i) => point(String.fromCharCode(97 + i)))
  const attempts = candidates.slice(0, 5).map((p) => receipt(p, 'FAILED'))
  const plan = select({ points: candidates, attempts })
  assert.equal(plan.attempt_count_today, 5)
  assert.equal(plan.candidates.length, 1)
  assert.equal(plan.counts.skipped_daily_cap, 5)
})

test('builds provider-independent handoffs and normalized provider results', async () => {
  const candidate = point('a')
  const plan = select({ points: [candidate] })
  const handoff = plan.candidates[0].handoff
  assert.equal(handoff.contract_version, 'illustration-handoff-v1')
  assert.equal(handoff.canonical_facts.fact, 'source')
  assert.equal(handoff.output_spec.original_visibility, 'PRIVATE')
  const result = await createProvider('shadow').generateIllustration(candidate)
  assert.deepEqual(Object.keys(result).sort(), ['generation_key', 'height', 'metadata', 'mime_type', 'original_ref', 'point_id', 'provider', 'sha256', 'status', 'width'])
  assert.equal(result.status, 'WOULD_GENERATE')
  assert.equal(result.metadata.calls_made, 0)
})

test('shadow reports preserve site assets and reject accidental live modes', () => {
  const assets = [{ point_id: point('z').point_id }]
  const before = structuredClone(assets)
  const report = createShadowReport(select({ points: [point('a')] }))
  assert.equal(report.mode, 'SHADOW')
  assert.equal(report.would_generate_count, 1)
  assert.equal(report.site_assets_mutated, false)
  assert.deepEqual(assets, before)
  assert.throws(() => createShadowReport(select({ points: [] }), { mode: 'LIVE_AUTO' }), /LIVE_EXECUTION_DISABLED/)
})

test('native ChatGPT is handoff-ready but unproven and API generation remains disabled', async () => {
  const native = await createProvider('native_chatgpt').generateIllustration(point('a'))
  const api = await createProvider('api_openai').generateIllustration(point('a'))
  assert.equal(native.status, 'STUBBED')
  assert.equal(api.status, 'LIVE_DISABLED')
})

test('records manual attempts within retry caps and rejects live auto', () => {
  const candidate = point('a')
  const empty = { version: 'illustration-receipts-v1', attempts: [] }
  const first = appendIllustrationReceipt(empty, candidate, { provider: 'manual_import', status: 'FAILED', now: new Date('2026-09-28T01:00:00.000Z') })
  const second = appendIllustrationReceipt(first, candidate, { provider: 'manual_import', status: 'FAILED', now: new Date('2026-09-28T02:00:00.000Z') })
  const third = appendIllustrationReceipt(second, candidate, { provider: 'manual_import', status: 'FAILED', now: new Date('2026-09-28T03:00:00.000Z') })
  assert.equal(third.attempts.length, 3)
  assert.throws(() => appendIllustrationReceipt(third, candidate, { provider: 'manual_import', status: 'FAILED' }), /RETRY_CAP_REACHED/)
  assert.throws(() => appendIllustrationReceipt(empty, candidate, { mode: 'LIVE_AUTO', provider: 'manual_import', status: 'IMPORTED' }), /INVALID_ILLUSTRATION_ATTEMPT/)
})

test('preserves the three real published images and the siteVisualFor path contract', async () => {
  const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
  const manifestPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json')
  const assets = JSON.parse(await readFile(manifestPath, 'utf8')).assets
  assert.deepEqual(assets.map((asset) => asset.subject_id).sort(), ['char-eunchae', 'char-jinwoo', 'char-seojin'])
  for (const asset of assets) {
    assert.match(asset.point_id, /^point-[a-f0-9]{64}$/)
    assert.match(asset.generation_key, /^generation-[a-f0-9]{64}$/)
    assert.match(asset.public_path, /^\/visual-assets\/[a-f0-9]{64}\.png$/)
    await readFile(resolve(root, 'archive/web/public', asset.public_path.slice(1)))
  }
  const renderer = await readFile(resolve(root, 'archive/web/src/archive/siteVisual.ts'), 'utf8')
  assert.match(renderer, /manifest\.assets as SiteAsset\[\]/)
  assert.match(renderer, /export function siteVisualFor\(subjectId: string\)/)
})
