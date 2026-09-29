import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReviewQueuePayload, enqueueReview } from '../knowledge-review-sync.mjs'

test('Automation C queue payload is metadata-only and stable for an exact brief/head', () => {
  const brief = { id: 'K-004', title: 'A reviewed title', risk_level: 'HIGH', risk_domains: ['GENERATOR'], sources: [{ id: 'S1', note: 'private note' }] }
  const result = { decision: 'HUMAN_REVIEW_REQUIRED', reasons: ['HIGH_RISK_DOMAIN:GENERATOR'] }
  const first = buildReviewQueuePayload({ brief, result, headSha: 'a'.repeat(40) })
  const retry = buildReviewQueuePayload({ brief, result, headSha: 'a'.repeat(40) })
  assert.deepEqual(first, retry)
  assert.equal(first.p_idempotency_key, `C_KNOWLEDGE:K-004:${'a'.repeat(40)}`)
  assert.equal(first.p_source_ref, `https://github.com/cetin072/survival-interactive-series/blob/${'a'.repeat(40)}/knowledge/content/briefs/K-004.json`)
  assert.deepEqual(first.p_payload.source_ids, ['S1'])
  assert.equal(JSON.stringify(first).includes('private note'), false)
})

test('enqueue uses the server-only key in headers and returns a safe response', async () => {
  let request
  const result = await enqueueReview({ p_idempotency_key: 'C_KNOWLEDGE:K-004:abc' }, {
    projectUrl: 'https://project.supabase.co/', serviceRoleKey: 'server-secret',
    fetchImpl: async (url, init) => {
      request = { url, init }
      return { ok: true, json: async () => ({ status: 'PENDING', created: true }) }
    },
  })
  assert.equal(request.url, 'https://project.supabase.co/rest/v1/rpc/archive_worker_enqueue_review_item')
  assert.equal(request.init.headers.apikey, 'server-secret')
  assert.equal(request.init.headers.Authorization, 'Bearer server-secret')
  assert.deepEqual(result, { status: 'PENDING', created: true })
})

test('enqueue rejects missing service configuration and failed HTTP responses', async () => {
  await assert.rejects(enqueueReview({}, { projectUrl: '', serviceRoleKey: '' }), /SECRETS_MISSING/)
  await assert.rejects(enqueueReview({}, {
    projectUrl: 'https://project.supabase.co', serviceRoleKey: 'secret',
    fetchImpl: async () => ({ ok: false, status: 403 }),
  }), /ENQUEUE_FAILED:403/)
})
