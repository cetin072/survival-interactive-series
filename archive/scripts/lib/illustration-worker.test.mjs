import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendIllustrationReceipt, createProvider, createShadowReport, kstCalendarDay, selectIllustrationCandidates } from './illustration-worker.mjs'

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
  mode: 'LIVE_MANUAL', provider: 'manual_import', attempt_count, last_status: status, last_run_at,
  output_sha256: ['SUCCEEDED', 'PUBLISHED'].includes(status) ? 'a'.repeat(64) : null,
  published_asset_ref: status === 'PUBLISHED' ? `/visual-assets/${'b'.repeat(64)}.png` : null,
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

test('orders the authoritative priority values ascending with deterministic ties', () => {
  const points = [point('e', 30), point('c', 20), point('a', 0), point('d', 25), point('b', 10)]
  const firstBatch = select({ points, batchLimit: 3 })
  assert.deepEqual(firstBatch.candidates.map((item) => item.priority), [0, 10, 20])
  const publishedFirstBatch = firstBatch.candidates.map(({ point_id, generation_key }) => ({ point_id, generation_key }))
  const rest = select({ points, assets: publishedFirstBatch, batchLimit: 3 })
  assert.deepEqual([...firstBatch.candidates, ...rest.candidates].map((item) => item.priority), [0, 10, 20, 25, 30])
  const ties = select({ points: [point('b', 10), point('a', 10)] })
  assert.deepEqual(ties.candidates.map((item) => item.point_id), [point('a').point_id, point('b').point_id])
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

test('rejects malformed receipts before success, retry, or daily cap decisions', () => {
  const candidate = point('a')
  const valid = receipt(candidate, 'FAILED')
  const corruptions = [
    { point_id: 'bad' },
    { generation_key: 'bad' },
    { subject_id: '  ' },
    { mode: 'SHADOW' },
    { provider: 'unknown' },
    { attempt_count: 2 },
    { last_status: 'SUCCESSISH' },
    { last_run_at: '2026-09-28' },
    { output_sha256: 'bad' },
    { published_asset_ref: '../private/original.png' },
  ]
  for (const corrupt of corruptions) {
    const attempt = { ...valid, ...corrupt }
    assert.throws(() => select({ points: [candidate], attempts: [attempt] }), /INVALID_ILLUSTRATION_RECEIPT_ENTRY/)
  }
  const successWithoutOutputHash = { ...receipt(candidate, 'SUCCEEDED'), output_sha256: null }
  assert.throws(() => select({ points: [candidate], attempts: [successWithoutOutputHash] }), /INVALID_ILLUSTRATION_RECEIPT_ENTRY/)
  const publishedWithoutRef = { ...receipt(candidate, 'PUBLISHED'), published_asset_ref: null }
  assert.throws(() => select({ points: [candidate], attempts: [publishedWithoutRef] }), /INVALID_ILLUSTRATION_RECEIPT_ENTRY/)
})

test('resets the daily counter at the Asia/Seoul calendar boundary', () => {
  const points = Array.from({ length: 6 }, (_, index) => point(String.fromCharCode(97 + index)))
  const attempts = points.map((item) => receipt(item, 'FAILED', '2026-09-28T14:59:00.000Z')) // 23:59 KST
  const beforeMidnight = new Date('2026-09-28T14:59:00.000Z')
  const afterMidnight = new Date('2026-09-28T15:01:00.000Z') // next day 00:01 KST
  assert.equal(kstCalendarDay(beforeMidnight), '2026-09-28')
  assert.equal(kstCalendarDay(afterMidnight), '2026-09-29')
  assert.equal(select({ points, attempts, now: beforeMidnight }).attempt_count_today, 6)
  const nextDayPlan = select({ points, attempts, now: afterMidnight })
  assert.equal(nextDayPlan.attempt_count_today, 0)
  assert.equal(nextDayPlan.daily_capacity_remaining, 6)
  const nextDayReceipt = appendIllustrationReceipt({ version: 'illustration-receipts-v1', attempts }, points[0], {
    provider: 'manual_import', status: 'FAILED', now: afterMidnight,
  })
  assert.equal(nextDayReceipt.attempts.length, 7)
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
