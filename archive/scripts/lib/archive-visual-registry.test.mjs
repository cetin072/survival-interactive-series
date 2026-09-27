import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { acceptForegroundLocalCandidate } from './foreground-image-handoff.mjs'
import { planArchiveVisualRegistry, insertPrivateVisualRegistry,
  verifyExistingPrivateVisualRegistry } from './archive-visual-registry.mjs'

const root = new URL('../../', import.meta.url)
const [catalog, observation, approval, originalBytes] = await Promise.all([
  readFile(new URL('content/visuals/C03-AFTERFALL/VISUALS.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('../docs/AUTOMATIC_ARCHIVE_STEP6_FOREGROUND_20260927.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('experiments/step6/char-jinwoo-20260927-owner-approval.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('experiments/step6/char-jinwoo-20260927-foreground.png', root)),
])
const point = catalog.points.find((entry) => entry.point_id === observation.point_id)
const candidate = acceptForegroundLocalCandidate(point, observation, originalBytes, approval)
const storageResult = { status: 'UPLOADED', storage_verified: true,
  bucket: 'survival-archive-originals',
  object_path: `AFTERFALL/${candidate.candidate_id}/${observation.file.sha256}.png`,
  sha256: observation.file.sha256 }
const input = { catalog, observation, approval, originalBytes, candidate, storageResult }

test('accepted stored original plans a private, unpublished registry row', () => {
  const result = planArchiveVisualRegistry(input)
  assert.equal(result.status, 'PRIVATE_REGISTRY_INSERT_REQUIRED')
  assert.equal(result.row.visibility, 'CORE_PRIVATE')
  assert.equal(result.row.status, 'GENERATED')
  assert.equal(result.row.provider_asset_id, null)
  assert.equal(result.database_writes + result.public_assets + result.site_publications, 0)
})
test('same registry row is reusable after upload success and registry retry', () => {
  const planned = planArchiveVisualRegistry(input)
  const existingRows = [{ ...structuredClone(planned.row), created_at: '2026-09-27T00:00:00Z' }]
  assert.equal(planArchiveVisualRegistry({ ...input, existingRows }).status, 'EXISTING_PRIVATE_ASSET_REUSED')
  assert.throws(() => planArchiveVisualRegistry({ ...input,
    existingRows: [{ ...planned.row, object_path: 'survival-archive-originals/other.png' }] }),
  /REGISTRY_EXISTING_ASSET_CONFLICT/)
})
test('existing private registry verification is GET only and rejects mismatched binding', async () => {
  const existing = planArchiveVisualRegistry(input).row
  const calls = []
  const args = { ...input, baseUrl: 'https://example.supabase.co',
    serviceKey: 'synthetic-test-service-key-12345',
    fetchImpl: async (url, request) => {
      calls.push({ url, method: request.method })
      return Response.json([existing])
    } }
  const result = await verifyExistingPrivateVisualRegistry(args)
  assert.equal(result.status, 'EXISTING_PRIVATE_ASSET_REUSED')
  assert.equal(result.database_writes, 0)
  assert.deepEqual(calls.map((call) => call.method), ['GET'])
  assert.match(calls[0].url, /asset_id=eq\.AF-CHAR-/)
  await assert.rejects(verifyExistingPrivateVisualRegistry({ ...args,
    fetchImpl: async () => Response.json([{ ...existing, source: {
      ...existing.source, generation_key: `generation-${'0'.repeat(64)}` } }]) }),
  /REGISTRY_EXISTING_ASSET_CONFLICT/)
  await assert.rejects(verifyExistingPrivateVisualRegistry({ ...args,
    fetchImpl: async () => Response.json([]) }), /REGISTRY_ASSET_NOT_FOUND/)
})
test('fake candidate, approval, storage receipt and duplicate candidate binding are rejected', () => {
  assert.throws(() => planArchiveVisualRegistry({ ...input,
    candidate: { ...candidate, candidate_id: `candidate-${'0'.repeat(64)}` } }))
  assert.throws(() => planArchiveVisualRegistry({ ...input,
    approval: { ...approval, point_id: `point-${'0'.repeat(64)}` } }))
  assert.throws(() => planArchiveVisualRegistry({ ...input,
    storageResult: { ...storageResult, storage_verified: false } }))
  assert.throws(() => planArchiveVisualRegistry({ ...input,
    storageResult: { ...storageResult, object_path: 'AFTERFALL/another.png' } }))
  const planned = planArchiveVisualRegistry(input)
  assert.throws(() => planArchiveVisualRegistry({ ...input,
    existingRows: [{ ...planned.row, asset_id: 'AF-CHAR-DIFFERENT' }] }),
  /REGISTRY_EXISTING_ASSET_CONFLICT/)
  assert.throws(() => planArchiveVisualRegistry({ ...input,
    existingRows: [planned.row, { ...planned.row, asset_id: 'AF-CHAR-DIFFERENT' }] }),
  /REGISTRY_EXISTING_ASSET_CONFLICT/)
})
test('private PostgREST insert is read back and a rerun reuses its exact row', async () => {
  const rows = [], calls = []
  const fetchImpl = async (url, request) => {
    calls.push({ method: request.method, url })
    if (request.method === 'GET') return Response.json(rows)
    rows.push(JSON.parse(request.body))
    return new Response(null, { status: 201 })
  }
  const args = { ...input, baseUrl: 'https://example.supabase.co',
    serviceKey: 'synthetic-test-service-key-12345', fetchImpl }
  assert.equal((await insertPrivateVisualRegistry(args)).status, 'PRIVATE_ASSET_INSERTED')
  assert.equal((await insertPrivateVisualRegistry(args)).status, 'EXISTING_PRIVATE_ASSET_REUSED')
  assert.equal(rows.length, 1)
  assert.deepEqual(calls.map((call) => call.method),
    ['GET', 'GET', 'POST', 'GET', 'GET', 'GET', 'GET'])
  assert.ok(calls.filter((call) => call.method === 'GET')
    .every((call) => !call.url.includes('limit=1000')))
  assert.ok(calls.some((call) => call.url.includes('asset_id=eq.')))
  assert.ok(calls.some((call) => call.url.includes('source=cs.')))
  assert.equal(rows[0].visibility, 'CORE_PRIVATE')
})
test('lost insert response reconciles the private row without a second POST', async () => {
  const rows = [], calls = []
  const fetchImpl = async (_url, request) => {
    calls.push(request.method)
    if (request.method === 'GET') return Response.json(rows)
    rows.push(JSON.parse(request.body))
    throw new Error('simulated timeout')
  }
  const result = await insertPrivateVisualRegistry({ ...input,
    baseUrl: 'https://example.supabase.co', serviceKey: 'synthetic-test-service-key-12345', fetchImpl })
  assert.equal(result.status, 'INSERT_RESPONSE_LOST_ROW_VERIFIED')
  assert.deepEqual(calls, ['GET', 'GET', 'POST', 'GET', 'GET'])
})
