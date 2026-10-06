import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appendIllustrationReceipt,
  buildDailyRunSummary,
  createProvider,
  createShadowReport,
  dailyGenerationUsed,
  kstCalendarDay,
  persistIllustrationAttempt,
  selectIllustrationCandidates,
} from './illustration-worker.mjs'

const point = (id, priority = 10, overrides = {}) => ({
  point_id: `point-${id.repeat(64)}`,
  generation_key: `generation-${id.repeat(64)}`,
  subject_id: `subject-${id}`,
  priority,
  status: 'READY',
  title: `Subject ${id}`,
  brief: {
    version: 'visual-brief-v1',
    point_type: 'CHARACTER',
    subject: { label: `Subject ${id}`, node_id: `subject-${id}` },
    canon_facts: { fact: 'source' },
    art_direction: {
      composition: 'single-subject master portrait; simple non-identifying background',
      mood: 'QUIET_DECAY',
      mood_rules: ['cool blue-gray; no invented weather'],
      rendering: ['non-photorealistic painterly illustration'],
      avoid: ['embedded typography, labels or numbers'],
      style_version: 'AFTERFALL_ARCHIVE_V1',
      theme: 'Quiet survival, not spectacle.',
    },
    safeguards: ['Do not invent facts.'],
  },
  ...overrides,
})
const withSubject = (p, subject_id, point_type = 'CHARACTER') => ({
  ...p,
  subject_id,
  brief: {
    ...p.brief,
    point_type,
    subject: { ...p.brief.subject, node_id: subject_id },
  },
})
const receipt = (p, status, occurred_at = '2026-09-28T01:00:00.000Z', attempt_no = 1, overrides = {}) => ({
  point_id: p.point_id,
  generation_key: p.generation_key,
  subject_id: p.subject_id,
  mode: 'LIVE_MANUAL',
  provider: 'native_chatgpt',
  attempt_no,
  attempt_count: 1,
  status,
  last_status: status,
  reason_code: status === 'FAILED' ? 'GENERATION_FAILED' : null,
  occurred_at,
  last_run_at: occurred_at,
  date_kst: kstCalendarDay(occurred_at),
  counts_toward_daily_generation_cap: true,
  output_sha256: status === 'SUCCEEDED' ? 'a'.repeat(64) : null,
  published_asset_ref: null,
  ...overrides,
})
const emptyReceipts = () => ({ version: 'illustration-receipts-v2', attempts: [] })
const select = ({ points, assets = [], attempts = [], observedAttempts = [], batchLimit = 3, now = new Date('2026-09-28T05:00:00.000Z'), subjectIds = null }) => selectIllustrationCandidates({
  catalog: { points }, siteAssets: { assets }, receipts: { ...emptyReceipts(), attempts }, observedAttempts, now, batchLimit, subjectIds,
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
    receipt(exhausted, 'FAILED', '2026-09-27T12:00:00.000Z', 1),
    receipt(exhausted, 'FAILED', '2026-09-27T12:10:00.000Z', 2),
    receipt(exhausted, 'FAILED', '2026-09-27T12:20:00.000Z', 3),
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

test('orders priorities 0, 10, 20, 25, 30 ascending with deterministic ties', () => {
  const points = [point('e', 30), point('c', 20), point('a', 0), point('d', 25), point('b', 10)]
  const firstBatch = select({ points, batchLimit: 3 })
  assert.deepEqual(firstBatch.candidates.map((item) => item.priority), [0, 10, 20])
  const priorBatchPublished = firstBatch.candidates.map(({ point_id, generation_key }) => ({ point_id, generation_key }))
  const rest = select({ points, assets: priorBatchPublished, batchLimit: 3 })
  assert.deepEqual([...firstBatch.candidates, ...rest.candidates].map((item) => item.priority), [0, 10, 20, 25, 30])
  const ties = select({ points: [point('b', 10), point('a', 10)] })
  assert.deepEqual(ties.candidates.map((item) => item.point_id), [point('a').point_id, point('b').point_id])
})

test('automatic selection defers locations and events while character candidates exist', () => {
  const location = withSubject(point('a', 0), 'loc-forest', 'LOCATION')
  const event = withSubject(point('b', 10), 'event-market', 'EVENT')
  const character = withSubject(point('c', 30), 'char-hayoung')
  const plan = select({ points: [location, event, character], batchLimit: 3 })
  assert.deepEqual(plan.candidates.map((item) => item.subject_id), ['char-hayoung'])
  assert.equal(plan.counts.deferred_non_character_priority, 2)
})

test('automatic character selection prefers fresh subjects over retries', () => {
  const retryCharacter = withSubject(point('a', 0), 'char-retry')
  const freshCharacter = withSubject(point('b', 30), 'char-fresh')
  const plan = select({
    points: [retryCharacter, freshCharacter],
    attempts: [receipt(retryCharacter, 'FAILED', '2026-09-27T12:00:00.000Z', 1)],
    batchLimit: 1,
  })
  assert.deepEqual(plan.candidates.map((item) => item.subject_id), ['char-fresh'])
})


test('durable DB rejection makes that character a retry so a fresh character is selected first', () => {
  const rejectedCharacter = withSubject(point('a', 0), 'char-rejected')
  const freshCharacter = withSubject(point('b', 30), 'char-fresh-db')
  const plan = select({
    points: [rejectedCharacter, freshCharacter],
    observedAttempts: [{
      point_id: rejectedCharacter.point_id,
      generation_key: rejectedCharacter.generation_key,
      subject_id: rejectedCharacter.subject_id,
      attempt_no: 1,
      status: 'REVIEW_REJECTED',
      review_decision: 'REJECT',
    }],
    batchLimit: 1,
  })
  assert.deepEqual(plan.candidates.map((item) => item.subject_id), ['char-fresh-db'])
})

test('durable DB success excludes an already completed visual even when receipts lag behind', () => {
  const completed = withSubject(point('a', 0), 'char-completed')
  const candidate = withSubject(point('b', 30), 'char-next')
  const plan = select({
    points: [completed, candidate],
    observedAttempts: [{
      point_id: completed.point_id,
      generation_key: completed.generation_key,
      subject_id: completed.subject_id,
      attempt_no: 1,
      status: 'SUCCEEDED',
      review_decision: 'PASS',
    }],
  })
  assert.deepEqual(plan.candidates.map((item) => item.subject_id), ['char-next'])
  assert.equal(plan.counts.skipped_previous_success, 1)
})

test('explicit subjectIds remain authoritative despite automatic character-first policy', () => {
  const location = withSubject(point('a', 0), 'loc-target', 'LOCATION')
  const character = withSubject(point('b', 30), 'char-other')
  const plan = select({ points: [location, character], subjectIds: ['loc-target'], batchLimit: 1 })
  assert.deepEqual(plan.candidates.map((item) => item.subject_id), ['loc-target'])
})

test('missing priority fails closed instead of falling back to priority zero', () => {
  const missing = point('a')
  delete missing.priority
  const plan = select({ points: [missing] })
  assert.equal(plan.candidates.length, 0)
  assert.equal(plan.counts.skipped_invalid_priority, 1)
})

test('null priority fails closed', () => {
  const plan = select({ points: [point('a', 10, { priority: null })] })
  assert.equal(plan.candidates.length, 0)
  assert.equal(plan.counts.skipped_invalid_priority, 1)
})

test('numeric priorities outside the allowlist fail closed', () => {
  const plan = select({ points: [point('a', 5), point('b', 40), point('c', Number.NaN)] })
  assert.equal(plan.candidates.length, 0)
  assert.equal(plan.counts.skipped_invalid_priority, 3)
})

test('string priority fails closed', () => {
  const plan = select({ points: [point('a', 10, { priority: '10' })] })
  assert.equal(plan.candidates.length, 0)
  assert.equal(plan.counts.skipped_invalid_priority, 1)
})

test('batch and actual-generation daily caps are both three', () => {
  const candidates = Array.from({ length: 6 }, (_, index) => point(String.fromCharCode(97 + index)))
  const threeAttempts = candidates.slice(0, 3).map((item) => receipt(item, 'FAILED'))
  const plan = select({ points: candidates, attempts: threeAttempts })
  assert.equal(plan.batch_limit, 3)
  assert.equal(plan.daily_generation_cap, 3)
  assert.equal(plan.generation_attempts_today, 3)
  assert.equal(plan.daily_capacity_remaining, 0)
  assert.equal(plan.candidates.length, 0)
  assert.equal(plan.counts.skipped_daily_cap, candidates.length)
})

test('each failed retry consumes daily capacity and fourth actual attempt is blocked', () => {
  const first = point('a'), second = point('b')
  let receipts = emptyReceipts()
  receipts = appendIllustrationReceipt(receipts, first, { provider: 'native_chatgpt', status: 'FAILED', reasonCode: 'GENERATION_FAILED', now: new Date('2026-09-28T01:00:00Z') })
  receipts = appendIllustrationReceipt(receipts, first, { provider: 'native_chatgpt', status: 'FAILED', reasonCode: 'GENERATION_FAILED', now: new Date('2026-09-28T02:00:00Z') })
  receipts = appendIllustrationReceipt(receipts, second, { provider: 'native_chatgpt', status: 'FAILED', reasonCode: 'PROVIDER_UNAVAILABLE', now: new Date('2026-09-28T03:00:00Z') })
  assert.deepEqual(receipts.attempts.map((item) => item.attempt_no), [1, 2, 1])
  assert.equal(dailyGenerationUsed(receipts, '2026-09-28'), 3)
  assert.throws(() => appendIllustrationReceipt(receipts, point('c'), {
    provider: 'native_chatgpt', status: 'FAILED', reasonCode: 'GENERATION_FAILED', now: new Date('2026-09-28T04:00:00Z'),
  }), /DAILY_CAP_REACHED/)
})

test('builds provider-independent handoffs and normalized provider results', async () => {
  const candidate = point('a')
  const plan = select({ points: [candidate] })
  const handoff = plan.candidates[0].handoff
  assert.equal(handoff.contract_version, 'illustration-handoff-v1')
  assert.equal(handoff.canonical_facts.fact, 'source')
  assert.equal(handoff.output_spec.original_visibility, 'PRIVATE')
  assert.equal(handoff.image_prompt.contract_version, 'illustration-image-prompt-v1')
  assert.deepEqual(Object.keys(handoff.image_prompt).sort(), [
    'contract_version', 'generation_key', 'negative_prompt', 'point_id', 'positive_prompt', 'review_checklist', 'subject_id',
  ])
  const result = await createProvider('shadow').generateIllustration(candidate)
  assert.deepEqual(Object.keys(result).sort(), ['generation_key', 'height', 'metadata', 'mime_type', 'original_ref', 'point_id', 'provider', 'sha256', 'status', 'width'])
  assert.equal(result.status, 'WOULD_GENERATE')
  assert.equal(result.metadata.calls_made, 0)
  assert.equal(result.metadata.counts_toward_daily_generation_cap, false)
})

test('shadow planning never consumes an attempt or mutates any durable artifacts', () => {
  const receipts = emptyReceipts()
  const original = structuredClone(receipts)
  const assets = [{ point_id: point('z').point_id }]
  const report = createShadowReport(select({ points: [point('a')], assets }))
  assert.equal(report.mode, 'SHADOW')
  assert.equal(report.would_generate_count, 1)
  assert.equal(report.generation_calls_made, 0)
  assert.equal(report.generation_attempts_consumed, 0)
  assert.equal(report.receipts_mutated, false)
  assert.equal(report.site_assets_mutated, false)
  assert.equal(report.storage_written, false)
  assert.equal(report.daily_notifications, 'OFF')
  assert.deepEqual(receipts, original)
  assert.throws(() => createShadowReport(select({ points: [] }), { mode: 'LIVE_AUTO' }), /LIVE_EXECUTION_DISABLED/)
})

test('manual import does not create or consume a generation attempt', async () => {
  const receipts = emptyReceipts()
  const before = structuredClone(receipts)
  const imported = await createProvider('manual_import').generateIllustration({
    ...point('a'), imported_result: { original_ref: 'private/original.png', width: 512, height: 512, mime_type: 'image/png', sha256: 'c'.repeat(64) },
  })
  const report = createShadowReport(select({ points: [point('b')] }), { provider: 'manual_import' })
  assert.equal(imported.status, 'IMPORTED')
  assert.equal(imported.metadata.calls_made, 0)
  assert.equal(imported.metadata.counts_toward_daily_generation_cap, false)
  assert.equal(dailyGenerationUsed(receipts, '2026-09-28'), 0)
  assert.deepEqual(receipts, before)
  assert.equal(report.generation_attempts_today, 0)
  assert.equal(report.generation_attempts_consumed, 0)
})

test('native ChatGPT remains unproven, paid API remains disabled, and LIVE_AUTO cannot run', async () => {
  const native = await createProvider('native_chatgpt').generateIllustration(point('a'))
  const api = await createProvider('api_openai').generateIllustration(point('a'))
  assert.equal(native.status, 'STUBBED')
  assert.equal(native.metadata.counts_toward_daily_generation_cap, false)
  assert.equal(api.status, 'LIVE_DISABLED')
  assert.equal(api.metadata.counts_toward_daily_generation_cap, false)
  assert.throws(() => appendIllustrationReceipt(emptyReceipts(), point('b'), {
    mode: 'LIVE_AUTO', provider: 'native_chatgpt', status: 'FAILED', reasonCode: 'GENERATION_FAILED',
  }), /INVALID_ILLUSTRATION_ATTEMPT/)
})

test('receipt validation rejects corrupt entries and unknown status/provider/reason values', () => {
  const candidate = point('a')
  const valid = receipt(candidate, 'FAILED')
  const corruptions = [
    { point_id: 'bad' },
    { generation_key: 'bad' },
    { subject_id: '  ' },
    { mode: 'SHADOW' },
    { provider: 'unknown' },
    { provider: 'manual_import' },
    { attempt_no: 0 },
    { attempt_no: 4 },
    { attempt_count: 2 },
    { status: 'SUCCESSISH' },
    { last_status: 'SUCCESSISH' },
    { last_run_at: '2026-09-28' },
    { reason_code: 'provider said something secret' },
    { occurred_at: '2026-09-28' },
    { date_kst: '2026-02-30' },
    { date_kst: '2026-09-29' },
    { counts_toward_daily_generation_cap: false },
    { output_sha256: 'bad' },
    { published_asset_ref: '../private/original.png' },
    { reason_code: null },
  ]
  for (const corrupt of corruptions) {
    assert.throws(() => select({ points: [candidate], attempts: [{ ...valid, ...corrupt }] }), /INVALID_ILLUSTRATION_RECEIPT/)
  }
  assert.throws(() => select({ points: [candidate], attempts: [{ ...receipt(candidate, 'FAILED'), attempt_no: 2 }] }), /INVALID_ILLUSTRATION_ATTEMPT_SEQUENCE/)
})

test('KST 23:59 attempts count for that day and reset at next-day 00:01', () => {
  const points = Array.from({ length: 3 }, (_, index) => point(String.fromCharCode(97 + index)))
  const attempts = points.map((item) => receipt(item, 'FAILED', '2026-09-28T14:59:00.000Z'))
  const beforeMidnight = new Date('2026-09-28T14:59:00.000Z')
  const afterMidnight = new Date('2026-09-28T15:01:00.000Z')
  assert.equal(kstCalendarDay(beforeMidnight), '2026-09-28')
  assert.equal(kstCalendarDay(afterMidnight), '2026-09-29')
  assert.equal(select({ points, attempts, now: beforeMidnight }).generation_attempts_today, 3)
  const nextDay = select({ points, attempts, now: afterMidnight })
  assert.equal(nextDay.generation_attempts_today, 0)
  assert.equal(nextDay.daily_capacity_remaining, 3)
  const retry = appendIllustrationReceipt({ ...emptyReceipts(), attempts }, points[0], {
    provider: 'native_chatgpt', status: 'FAILED', reasonCode: 'GENERATION_FAILED', now: afterMidnight,
  })
  assert.equal(retry.attempts.at(-1).attempt_no, 2)
  assert.equal(retry.attempts.at(-1).date_kst, '2026-09-29')
})

test('durably appends actual failures and reconciles a daily summary without losing earlier attempts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'illustration-attempts-'))
  const receiptsPath = join(directory, 'ILLUSTRATION_RECEIPTS.json')
  await writeFile(receiptsPath, `${JSON.stringify(emptyReceipts(), null, 2)}\n`)
  const points = [point('a'), point('b'), point('c')]
  const outcomes = [
    { status: 'FAILED', reasonCode: 'GENERATION_FAILED' },
    { status: 'SUCCEEDED', reasonCode: null, outputSha256: 'f'.repeat(64) },
    { status: 'FAILED', reasonCode: 'PROVIDER_UNAVAILABLE' },
  ]
  try {
    for (let index = 0; index < 3; index++) {
      await persistIllustrationAttempt({
        receiptsPath,
        point: points[index],
        provider: 'native_chatgpt',
        ...outcomes[index],
        now: new Date(`2026-09-28T0${index + 1}:00:00.000Z`),
        deferredCandidates: [point('d'), point('e')],
      })
    }
    const storedReceipts = JSON.parse(await readFile(receiptsPath, 'utf8'))
    const summaryPath = join(directory, 'illustration-runs', '2026-09-28.json')
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    assert.equal(storedReceipts.attempts.length, 3)
    assert.equal(summary.generation_attempts, 3)
    assert.equal(summary.failed, 2)
    assert.equal(summary.succeeded, 1)
    assert.equal(summary.deferred, 2)
    assert.equal(summary.daily_generation_cap, 3)
    assert.equal(summary.cap_exhausted, true)
    assert.deepEqual(summary.results.map((item) => item.attempt_no), [1, 1, 1])
    assert.deepEqual(summary.results.map((item) => item.status), ['FAILED', 'SUCCEEDED', 'FAILED'])
    assert.ok(summary.results.every((item) => !Object.hasOwn(item, 'brief')))
    assert.throws(() => appendIllustrationReceipt(storedReceipts, point('f'), {
      provider: 'native_chatgpt', status: 'FAILED', reasonCode: 'GENERATION_FAILED', now: new Date('2026-09-28T04:00:00Z'),
    }), /DAILY_CAP_REACHED/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('daily summary is a receipt projection and does not create empty run history', () => {
  const receipts = emptyReceipts()
  const summary = buildDailyRunSummary(receipts, '2026-09-28')
  assert.deepEqual(summary, {
    date_kst: '2026-09-28', generation_attempts: 0, succeeded: 0, failed: 0, deferred: 0,
    daily_generation_cap: 3, cap_exhausted: false, results: [],
  })
})

test('regular coordinator routes PREPARED through bridge and never generates images', async () => {
  const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
  const router = await readFile(resolve(root, 'docs/automation/ILLUSTRATION_B_NATIVE_WORKER_ROUTER.md'), 'utf8')
  const contract = JSON.parse(await readFile(
    resolve(root, 'archive/automation/illustration-native-worker-runtime-contract.json'), 'utf8',
  ))
  assert.match(router, /Coordinator never generates an image/)
  assert.match(router, /DISPATCH/)
  assert.match(router, /COLLECT/)
  assert.match(router, /PASS handoff does not permit same-run Transfer/)
  assert.deepEqual(contract.workers.reservation_coordinator.handles, ['PREPARED', 'INGESTING', 'REVIEW_PASS_STAGED'])
  assert.ok(contract.workers.reservation_coordinator.forbidden.includes('IMAGE_GENERATION'))
  assert.ok(contract.workers.reservation_coordinator.forbidden.includes('DIRECT_REVIEW_DB_MUTATION'))
  assert.equal(contract.roles.PREPARED.owner, 'RESERVATION_COORDINATOR')
  assert.equal(contract.roles.PREPARED.one_role_per_run, true)
  assert.equal(contract.roles.INGESTING.stop_after_handoff_commit, true)
  assert.equal(contract.roles.REVIEW_PASS_STAGED.re_review, false)
  assert.equal(contract.pass_asset.staging_resume_rpc, 'archive_illustration_review_staging_resume')
})

test('one-shot renderer is physically separated, visual only, and legacy workers remain off', async () => {
  const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
  const contract = JSON.parse(await readFile(
    resolve(root, 'archive/automation/illustration-native-worker-runtime-contract.json'), 'utf8',
  ))
  assert.equal(contract.renderer_context_isolation.enabled, true)
  assert.equal(contract.renderer_context_isolation.scene_input, 'BYTE_EQUIVALENT_DB_PROMPT_PLUS_RESERVATION_RENDER_SUFFIX')
  assert.deepEqual(contract.renderer_context_isolation.allowed_before_image_call,
    ['EXACT_VISUAL_PROMPT', 'FIXED_LIBRARY_SAVE_SUFFIX'])
  assert.equal(contract.workers.isolated_renderer.recurring, false)
  assert.equal(contract.workers.isolated_renderer.prompt_builder, 'buildReservationRendererPrompt')
  assert.deepEqual(contract.workers.isolated_renderer.responsibilities, ['NATIVE_IMAGE_GENERATION', 'LIBRARY_WRITE'])
  assert.equal(contract.workers.legacy_workers.enabled, false)
  assert.equal(contract.workers.legacy_workers.preserve_off_task_ids.length, 2)
  assert.notEqual(contract.workers.reservation_coordinator.task_id, contract.workers.isolated_renderer.task_id)
})

test('preserves approved images and validates the site asset contract', async () => {
  const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
  const manifestPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const catalog = JSON.parse(await readFile(resolve(root, 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'), 'utf8'))
  const assets = manifest.assets
  const publishedSubjects = assets.map((asset) => asset.subject_id)
  assert.deepEqual(publishedSubjects.slice(0, 4), [
    'char-jinwoo', 'char-eunchae', 'char-seojin', 'loc-guild-rear-warehouse',
  ])
  assert.equal(new Set(publishedSubjects).size, publishedSubjects.length)
  // SITE_ASSETS pins the visual catalog used when those assets were published.
  // Archive A may advance VISUALS without republishing unchanged approved assets,
  // so validate current point identity rather than requiring the whole-catalog hash to stay equal.
  assert.match(manifest.visual_catalog_sha256, /^[a-f0-9]{64}$/)
  const catalogBySubject = new Map(catalog.points.map((point) => [point.subject_id, point]))
  const stable = (value) => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
      : value
  const { content_sha256: manifestSha, ...manifestBody } = manifest
  assert.equal(createHash('sha256').update(JSON.stringify(stable(manifestBody))).digest('hex'), manifestSha)
  const approvedDerivatives = {
    'char-jinwoo': ['5112dc7b2e8901aed2fcbe2c4a34736af0fefed2394a5c82e7d08fa6f2d558c8', 153519],
    'char-eunchae': ['d05543a3fb5f3ba23256c5d2d277074ee4650ea9708cd7980e79b7e4fa296314', 168453],
    'char-seojin': ['4b8354b38fcdb4936b770cad7cb0afa733755f5099a6b14dd04b03e055b9b9ae', 172840],
  }
  for (const asset of assets) {
    assert.match(asset.point_id, /^point-[a-f0-9]{64}$/)
    assert.match(asset.generation_key, /^generation-[a-f0-9]{64}$/)
    const currentPoint = catalogBySubject.get(asset.subject_id)
    assert.ok(currentPoint, `missing current visual point for ${asset.subject_id}`)
    assert.equal(currentPoint.point_id, asset.point_id)
    assert.equal(currentPoint.generation_key, asset.generation_key)
    assert.match(asset.public_path, /^\/visual-assets\/[a-f0-9]{64}\.png$/)
    const bytes = await readFile(resolve(root, 'archive/web/public', asset.public_path.slice(1)))
    assert.equal(bytes.length, asset.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256)
    assert.equal(asset.width, 512)
    assert.equal(asset.height, 512)
    if (approvedDerivatives[asset.subject_id]) {
      assert.deepEqual([asset.sha256, asset.bytes], approvedDerivatives[asset.subject_id])
    }
  }
  const warehouse = assets[3]
  assert.equal(warehouse.point_id, 'point-df6dfecbd13bcd0d2fc7de0a0b44d2d4f87c5343b7fa4b343bdaaa67e59e67b5')
  assert.equal(warehouse.generation_key, 'generation-3743c065c28f7621e2c6d3cc01fd4860af12f16f3430481663ed37dc4a2c0f1b')
  assert.equal(warehouse.source_sha256, '2eb7736605c96f23d089af36cbad001b06954989678a296db7a27696fc43e810')
  assert.ok(warehouse.bytes <= 200_000)

  const manualManifest = JSON.parse(await readFile(
    resolve(root, 'archive/content/visuals/C03-AFTERFALL/MANUAL_SITE_ASSETS.json'), 'utf8',
  ))
  assert.equal(manualManifest.version, 'archive-manual-site-assets-v1')
  const westRoad = manualManifest.assets.find((asset) => asset.subject_id === 'loc-west-road')
  assert.ok(westRoad)
  assert.equal(westRoad.source_kind, 'USER_SUPPLIED_REFERENCE')
  assert.equal(westRoad.canon_status, 'ILLUSTRATIVE_NOT_NEW_CANON')
  assert.equal(westRoad.point_id, catalogBySubject.get('loc-west-road').point_id)
  assert.equal(westRoad.generation_key, catalogBySubject.get('loc-west-road').generation_key)
  const westRoadBytes = await readFile(resolve(root, 'archive/web/public', westRoad.public_path.slice(1)))
  assert.equal(westRoadBytes.length, westRoad.bytes)
  assert.equal(createHash('sha256').update(westRoadBytes).digest('hex'), westRoad.sha256)
  assert.equal(westRoad.width, 512)
  assert.equal(westRoad.height, 341)

  const renderer = await readFile(resolve(root, 'archive/web/src/archive/siteVisual.ts'), 'utf8')
  assert.match(renderer, /generatedManifest\.assets as SiteAsset\[\]/)
  assert.match(renderer, /manualManifest\.assets as SiteAsset\[\]/)
  assert.match(renderer, /export function siteVisualFor\(subjectId: string\)/)
})
