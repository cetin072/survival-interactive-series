import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { prepareRenderJob } from './prepare-illustration-render-job.mjs'

const mainSha = 'a'.repeat(40)

test('preview compiles the real next candidate without a network call or enqueue', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error('PREVIEW_MUST_NOT_CALL_NETWORK') }
  t.after(() => { globalThis.fetch = originalFetch })
  const result = await prepareRenderJob({ mainSha, previewOnly: true, attemptHistory: [] })
  assert.equal(result.status, 'PREVIEW_ONLY')
  assert.equal(result.active_provider, 'native_chatgpt')
  assert.equal(result.job.main_sha, mainSha)
  assert.equal(result.job.prompt_sha256,
    createHash('sha256').update(result.job.prompt_text, 'utf8').digest('hex'))
  assert.match(result.job.review_context_sha256, /^[a-f0-9]{64}$/)
  assert.equal(result.job.status, undefined)
})

test('live Prep refuses supplied attempt history and keeps its DB authority', async () => {
  await assert.rejects(prepareRenderJob({ mainSha, attemptHistory: [] }),
    /ILLUSTRATION_PREP_HISTORY_OVERRIDE_REQUIRES_PREVIEW/)
})

test('ordinary Prep still returns the daily-success gate without preview output', async (t) => {
  const previousFetch = globalThis.fetch
  const previousUrl = process.env.ARCHIVE_SUPABASE_URL
  const previousKey = process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY
  process.env.ARCHIVE_SUPABASE_URL = 'https://jgsxpdflgkqroecfjzxq.supabase.co'
  process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY = 'TEST_ONLY_NOT_A_REAL_CREDENTIAL'
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) })
    if (url.endsWith('/archive_illustration_render_attempt_history')) {
      return new Response(JSON.stringify([]), { status: 200 })
    }
    assert.ok(url.endsWith('/archive_illustration_render_job_enqueue'))
    return new Response(JSON.stringify({ status: 'DAILY_SUCCESS_TARGET_REACHED', date_kst: '2026-10-05' }),
      { status: 200 })
  }
  t.after(() => {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.ARCHIVE_SUPABASE_URL
    else process.env.ARCHIVE_SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY
    else process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY = previousKey
  })
  const result = await prepareRenderJob({ mainSha })
  assert.equal(result.status, 'DAILY_SUCCESS_TARGET_REACHED')
  assert.equal(result.job, undefined)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].body.p_job.main_sha, mainSha)
  assert.equal(calls[1].body.p_job.previewOnly, undefined)
})

test('live Prep preserves the single Renderer slot while a reviewed PASS predecessor is BLOCKED', async (t) => {
  const oldFetch = globalThis.fetch
  const oldUrl = process.env.ARCHIVE_SUPABASE_URL
  const oldKey = process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY
  process.env.ARCHIVE_SUPABASE_URL = 'https://jgsxpdflgkqroecfjzxq.supabase.co'
  process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY = 'TEST_ONLY_NOT_A_REAL_CREDENTIAL'
  const history = [{
    point_id: 'point-' + 'a'.repeat(64),
    generation_key: 'generation-' + 'b'.repeat(64),
    subject_id: 'char-hyerin',
    attempt_no: 1,
    status: 'BLOCKED',
    review_decision: 'PASS',
  }]
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) })
    if (url.endsWith('/archive_illustration_render_attempt_history')) {
      return new Response(JSON.stringify(history), { status: 200 })
    }
    throw new Error('MUST_NOT_ENQUEUE_NEW_JOB_WHILE_REVIEWED_ASSET_UNRESOLVED')
  }
  t.after(() => {
    globalThis.fetch = oldFetch
    if (oldUrl === undefined) delete process.env.ARCHIVE_SUPABASE_URL
    else process.env.ARCHIVE_SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY
    else process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY = oldKey
  })
  const blocked = await prepareRenderJob({ mainSha })
  assert.deepEqual(blocked, {
    status: 'PREVIOUS_FINALIZER_RECOVERY',
    subject_id: 'char-hyerin',
    point_id: history[0].point_id,
    active_provider: 'native_chatgpt',
  })
  assert.equal(calls.length, 1, 'a blocked reviewed image must never enqueue a successor')
  assert.equal(calls[0].url.endsWith('/archive_illustration_render_attempt_history'), true)

  // After the Program Finalizer recovers that exact image, ordinary Prep is
  // unblocked and the existing DB daily-success gate still makes the decision.
  history[0].status = 'SUCCEEDED'
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) })
    if (url.endsWith('/archive_illustration_render_attempt_history')) {
      return new Response(JSON.stringify(history), { status: 200 })
    }
    assert.ok(url.endsWith('/archive_illustration_render_job_enqueue'))
    return new Response(JSON.stringify({ status: 'DAILY_SUCCESS_TARGET_REACHED' }), { status: 200 })
  }
  const resumed = await prepareRenderJob({ mainSha })
  assert.equal(resumed.status, 'DAILY_SUCCESS_TARGET_REACHED')
  assert.equal(calls.length, 3)
})
