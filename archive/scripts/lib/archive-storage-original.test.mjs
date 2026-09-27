import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { acceptForegroundLocalCandidate } from './foreground-image-handoff.mjs'
import { uploadAndVerifyArchiveOriginal, verifyExistingArchiveOriginal } from './archive-storage-original.mjs'

// Real committed source bytes; HTTP responses are synthetic and are not a Supabase upload proof.
const root = new URL('../../', import.meta.url)
const [catalog, observation, approval, originalBytes] = await Promise.all([
  readFile(new URL('content/visuals/C03-AFTERFALL/VISUALS.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('../docs/AUTOMATIC_ARCHIVE_STEP6_FOREGROUND_20260927.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('experiments/step6/char-jinwoo-20260927-owner-approval.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('experiments/step6/char-jinwoo-20260927-foreground.png', root)),
])
const point = catalog.points.find((entry) => entry.point_id === observation.point_id)
const candidate = acceptForegroundLocalCandidate(point, observation, originalBytes, approval)
const base = { baseUrl: 'https://example.supabase.co', serviceKey: 'synthetic-test-service-key-12345',
  catalog, observation, approval, candidate, originalBytes }
const response = (status, body = '') => new Response(body, { status })
function fakeStorage(uploadStatus = 200, stored = originalBytes) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method })
    if (init.method === 'POST') return response(uploadStatus)
    return stored === null ? response(404) : response(200, stored)
  }
  return { calls, fetchImpl }
}

test('real accepted bytes are bound before one upload and exact private readback', async () => {
  const storage = fakeStorage()
  const result = await uploadAndVerifyArchiveOriginal({ ...base, fetchImpl: storage.fetchImpl })
  assert.equal(result.status, 'UPLOADED')
  assert.equal(result.storage_verified, true)
  assert.equal(result.sha256, observation.file.sha256)
  assert.deepEqual(storage.calls.map((call) => call.method), ['POST', 'GET'])
  assert.equal(storage.calls[1].url.includes('/object/authenticated/survival-archive-originals/'), true)
})
test('existing content is reused after registry failure without overwriting or duplicate upload', async () => {
  const storage = fakeStorage(409)
  const result = await uploadAndVerifyArchiveOriginal({ ...base, fetchImpl: storage.fetchImpl })
  assert.equal(result.status, 'EXISTING_OBJECT_REUSED')
  assert.deepEqual(storage.calls.map((call) => call.method), ['POST', 'GET'])
})
test('existing object verification sends only GET and rejects changed or absent bytes', async () => {
  const storage = fakeStorage(200)
  const result = await verifyExistingArchiveOriginal({ ...base, fetchImpl: storage.fetchImpl })
  assert.equal(result.status, 'EXISTING_OBJECT_REUSED')
  assert.equal(result.upload_attempts, 0)
  assert.deepEqual(storage.calls.map((call) => call.method), ['GET'])
  const changed = fakeStorage(200, Buffer.from('changed'))
  await assert.rejects(verifyExistingArchiveOriginal({ ...base, fetchImpl: changed.fetchImpl }),
    /STORAGE_READBACK_HASH_MISMATCH/)
  assert.deepEqual(changed.calls.map((call) => call.method), ['GET'])
  const absent = fakeStorage(200, null)
  await assert.rejects(verifyExistingArchiveOriginal({ ...base, fetchImpl: absent.fetchImpl }),
    /STORAGE_OBJECT_NOT_FOUND/)
  assert.deepEqual(absent.calls.map((call) => call.method), ['GET'])
})
test('lost upload response reconciles readback and never sends a second POST', async () => {
  const calls = []
  const fetchImpl = async (_url, init) => {
    calls.push(init.method)
    if (init.method === 'POST') throw new Error('simulated timeout')
    return response(200, originalBytes)
  }
  const result = await uploadAndVerifyArchiveOriginal({ ...base, fetchImpl })
  assert.equal(result.status, 'UPLOAD_RESPONSE_LOST_OBJECT_VERIFIED')
  assert.deepEqual(calls, ['POST', 'GET'])
  const absent = fakeStorage(200, null)
  const unknown = await uploadAndVerifyArchiveOriginal({ ...base, fetchImpl: async (url, init) => {
    if (init.method === 'POST') throw new Error('simulated timeout')
    return absent.fetchImpl(url, init)
  } })
  assert.equal(unknown.status, 'UPLOAD_OUTCOME_UNKNOWN_RECONCILE_LATER')
  assert.equal(unknown.storage_verified, false)
})
test('fake candidate, reused approval and changed stored bytes fail closed', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return response(200, originalBytes) }
  await assert.rejects(uploadAndVerifyArchiveOriginal({ ...base,
    candidate: { ...candidate, candidate_id: `candidate-${'0'.repeat(64)}` }, fetchImpl }))
  await assert.rejects(uploadAndVerifyArchiveOriginal({ ...base,
    approval: { ...approval, generation_key: `generation-${'0'.repeat(64)}` }, fetchImpl }))
  assert.equal(calls, 0)
  const storage = fakeStorage(200, Buffer.from('different'))
  await assert.rejects(uploadAndVerifyArchiveOriginal({ ...base, fetchImpl: storage.fetchImpl }),
    /STORAGE_READBACK_HASH_MISMATCH/)
})
