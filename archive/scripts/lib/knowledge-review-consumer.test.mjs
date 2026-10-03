import test from 'node:test'
import assert from 'node:assert/strict'
import {
  inspectApprovedReview,
  listApprovedReview,
  recordReviewConsumption,
  validateReviewIdentity,
} from '../knowledge-review-consumer.mjs'

const item = {
  id: '11111111-1111-4111-8111-111111111111',
  decision: 'APPROVED',
  decided_at: '2026-09-30T00:00:00Z',
  source_ref: `https://github.com/cetin072/survival-interactive-series/blob/${'a'.repeat(40)}/knowledge/content/briefs/K-104.json`,
  payload: {
    brief_id: 'K-104',
    head_sha: 'a'.repeat(40),
    pr_number: 321,
    head_ref: 'knowledge/worker/fresh-example',
  },
}

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

test('validates exact review identity', () => {
  assert.equal(validateReviewIdentity(item).ok, true)
  assert.equal(validateReviewIdentity({ ...item, source_ref: 'https://example.com' }).reason, 'REVIEW_SOURCE_REF_MISMATCH')
  assert.equal(validateReviewIdentity({ ...item, payload: { ...item.payload, pr_number: null } }).reason, 'REVIEW_PR_NUMBER_MISSING')
})

test('empty approved queue is a NOOP', async () => {
  const result = await inspectApprovedReview({
    projectUrl: 'https://project.supabase.co',
    serviceRoleKey: 'server-key',
    githubToken: 'github-token',
    fetchImpl: async (url) => {
      assert.match(url, /archive_worker_list_approved_reviews/)
      return response([])
    },
  })
  assert.deepEqual(result, { status: 'NOOP' })
})

test('approved exact head is READY only when current main is its ancestor', async () => {
  const calls = []
  const result = await inspectApprovedReview({
    projectUrl: 'https://project.supabase.co',
    serviceRoleKey: 'server-key',
    githubToken: 'github-token',
    fetchImpl: async (url) => {
      calls.push(url)
      if (url.includes('archive_worker_list_approved_reviews')) return response([item])
      if (url.endsWith('/pulls/321')) return response({
        state: 'open',
        base: { ref: 'main' },
        head: { sha: 'a'.repeat(40), ref: 'knowledge/worker/fresh-example', repo: { full_name: 'cetin072/survival-interactive-series' } },
      })
      if (url.endsWith('/git/ref/heads/main')) return response({ object: { sha: 'b'.repeat(40) } })
      if (url.includes('/compare/')) return response({ status: 'ahead' })
      throw new Error('unexpected URL: ' + url)
    },
  })
  assert.equal(result.status, 'READY')
  assert.equal(result.brief_id, 'K-104')
  assert.equal(result.current_main, 'b'.repeat(40))
  assert.equal(calls.length, 4)
})


test('prepared human-review commit is resumable instead of treated as stale', async () => {
  const prepared = 'c'.repeat(40)
  const result = await inspectApprovedReview({
    projectUrl: 'https://project.supabase.co',
    serviceRoleKey: 'server-key',
    githubToken: 'github-token',
    fetchImpl: async (url) => {
      if (url.includes('archive_worker_list_approved_reviews')) return response([item])
      if (url.endsWith('/pulls/321')) return response({
        state: 'open',
        body: '<!-- knowledge-worker-phase-v1:PUBLICATION_HANDOFF -->',
        base: { ref: 'main' },
        head: { sha: prepared, ref: 'knowledge/worker/fresh-example', repo: { full_name: 'cetin072/survival-interactive-series' } },
      })
      if (url.endsWith('/git/ref/heads/main')) return response({ object: { sha: 'b'.repeat(40) } })
      if (url.includes('/compare/' + 'a'.repeat(40) + '...' + prepared)) return response({
        status: 'ahead',
        ahead_by: 1,
        behind_by: 0,
        commits: [{ commit: { message: 'knowledge: prepare K-104 human-approved publication' } }],
        files: [
          { filename: 'knowledge/content/briefs/K-104.json' },
          { filename: 'archive/web/public/knowledge/example/index.html' },
          { filename: 'archive/web/public/knowledge/index.html' },
          { filename: 'archive/web/public/sitemap.xml' },
        ],
      })
      throw new Error('unexpected URL: ' + url)
    },
  })
  assert.equal(result.status, 'RESUME_PREPARED')
  assert.equal(result.prepared_head_sha, prepared)
})

test('main drift blocks a stale approval', async () => {
  const result = await inspectApprovedReview({
    projectUrl: 'https://project.supabase.co',
    serviceRoleKey: 'server-key',
    githubToken: 'github-token',
    fetchImpl: async (url) => {
      if (url.includes('archive_worker_list_approved_reviews')) return response([item])
      if (url.endsWith('/pulls/321')) return response({
        state: 'open',
        base: { ref: 'main' },
        head: { sha: 'a'.repeat(40), ref: 'knowledge/worker/fresh-example', repo: { full_name: 'cetin072/survival-interactive-series' } },
      })
      if (url.endsWith('/git/ref/heads/main')) return response({ object: { sha: 'b'.repeat(40) } })
      if (url.includes('/compare/')) return response({ status: 'diverged' })
      throw new Error('unexpected URL')
    },
  })
  assert.equal(result.status, 'BLOCKED')
  assert.equal(result.reason, 'REVIEW_APPROVAL_STALE_MAIN_MOVED')
})

test('consumption receipt uses server-only credential and exact approval timestamp', async () => {
  let request
  const result = await recordReviewConsumption({
    projectUrl: 'https://project.supabase.co',
    serviceRoleKey: 'server-key',
    itemId: item.id,
    decidedAt: item.decided_at,
    outcome: 'CONSUMED',
    result: { merge_sha: 'c'.repeat(40) },
    fetchImpl: async (url, init) => {
      request = { url, init }
      return response({ item_id: item.id, outcome: 'CONSUMED' })
    },
  })
  assert.match(request.url, /archive_worker_record_review_consumption/)
  assert.equal(request.init.headers.apikey, 'server-key')
  const body = JSON.parse(request.init.body)
  assert.equal(body.p_decided_at, item.decided_at)
  assert.equal(body.p_result.merge_sha, 'c'.repeat(40))
  assert.equal(result.outcome, 'CONSUMED')
})

test('list requires server configuration', async () => {
  await assert.rejects(listApprovedReview({ projectUrl: '', serviceRoleKey: '' }), /ARCHIVE_SUPABASE_URL_REQUIRED/)
})


test('operator draft approval metadata is exact and partial bindings fail closed', () => {
  const operator = {
    ...item,
    payload: {
      ...item.payload,
      operator_job_id: '22222222-2222-4222-8222-222222222222',
      operator_draft_revision: 3,
      operator_draft_sha256: 'd'.repeat(64),
    },
  }
  const identity = validateReviewIdentity(operator)
  assert.equal(identity.ok, true)
  assert.equal(identity.operatorJobId, operator.payload.operator_job_id)
  assert.equal(identity.operatorDraftRevision, 3)
  assert.equal(identity.operatorDraftSha256, 'd'.repeat(64))

  const partial = {
    ...item,
    payload: { ...item.payload, operator_job_id: operator.payload.operator_job_id },
  }
  assert.equal(validateReviewIdentity(partial).reason, 'REVIEW_OPERATOR_DRAFT_REVISION_INVALID')

  const badSha = {
    ...item,
    payload: {
      ...operator.payload,
      operator_draft_sha256: 'not-a-sha',
    },
  }
  assert.equal(validateReviewIdentity(badSha).reason, 'REVIEW_OPERATOR_DRAFT_SHA_INVALID')
})

test('READY approval carries exact operator draft identity to the workflow boundary', async () => {
  const operator = {
    ...item,
    payload: {
      ...item.payload,
      operator_job_id: '22222222-2222-4222-8222-222222222222',
      operator_draft_revision: 2,
      operator_draft_sha256: 'e'.repeat(64),
    },
  }
  const result = await inspectApprovedReview({
    projectUrl: 'https://project.supabase.co',
    serviceRoleKey: 'server-key',
    githubToken: 'github-token',
    fetchImpl: async (url) => {
      if (url.includes('archive_worker_list_approved_reviews')) return response([operator])
      if (url.endsWith('/pulls/321')) return response({
        state: 'open',
        base: { ref: 'main' },
        head: { sha: 'a'.repeat(40), ref: 'knowledge/worker/fresh-example', repo: { full_name: 'cetin072/survival-interactive-series' } },
      })
      if (url.endsWith('/git/ref/heads/main')) return response({ object: { sha: 'b'.repeat(40) } })
      if (url.includes('/compare/')) return response({ status: 'ahead' })
      throw new Error('unexpected URL: ' + url)
    },
  })
  assert.equal(result.status, 'READY')
  assert.equal(result.operator_job_id, operator.payload.operator_job_id)
  assert.equal(result.operator_draft_revision, 2)
  assert.equal(result.operator_draft_sha256, 'e'.repeat(64))
})
