import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, symlink, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deflateSync } from 'node:zlib'
import { makeImagePocRequest, validateImagePocRequest, imagePocReceipt, readPocImage, inspectPng, pocDigest } from './image-poc-exchange.mjs'

// Generated locally for parser tests, NOT evidence of model image generation.
function crc(bytes) { let c = 0xffffffff; for (const n of bytes) { c ^= n; for (let b = 0; b < 8; b++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0) }; return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc(body), out.length - 4); return out }
function png(width = 1, height = 1) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  const scanline = Buffer.alloc((width * 3 + 1) * height)
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanline)), chunk('IEND', Buffer.alloc(0))])
}
function point() { const brief = { version: 'visual-brief-v1', point_type: 'CHARACTER', subject: { node_id: 'char-test', label: 'SYNTHETIC TEST ONLY' }, canon_facts: { appearance: { hair: 'test' } }, art_direction: { style_version: 'AFTERFALL_ARCHIVE_V1' } }; return { point_id: `point-${'a'.repeat(64)}`, point_type: 'CHARACTER', subject_id: 'char-test', visibility: 'PUBLIC_ARCHIVE', status: 'READY', brief, generation_key: `generation-${pocDigest(brief)}` } }
const source = { batch_id: `batch-${'b'.repeat(64)}`, source_revision: 'c'.repeat(40) }
const request = () => makeImagePocRequest(point(), source)
const observed = (r) => ({ request_id: r.request_id, point_id: r.point_id, generation_key: r.generation_key, tool_result_id: '00000000-0000-4000-8000-000000000001', tool: 'image_gen.text2im', surface: 'CHATGPT_FOREGROUND', review: 'NOT_REVIEWED' })

test('request is deterministic and authorizes no execution', () => { const a = request(); assert.deepEqual(a, request()); assert.equal(a.execution_authorized, false); assert.equal(a.paid_api_enabled, false); assert.equal(a.scheduled_execution_enabled, false); validateImagePocRequest(a) })
test('request carries an intended brief, not proof of provider prompt delivery', () => assert.equal(request().instruction_delivery, 'CONVERSATION_CONTEXT_NOT_CONFIRMED_PROVIDER_PROMPT'))
test('caller-owned brief is not mutated or retained by reference', () => { const p = point(), r = makeImagePocRequest(p, source); p.brief.subject.label = 'CHANGED'; assert.equal(r.intended_brief.subject.label, 'SYNTHETIC TEST ONLY') })
for (const visibility of [undefined, 'PLAYER_ARCHIVE', 'CORE_PRIVATE']) test(`nonpublic ${visibility} request refused`, () => { const p = point(); p.visibility = visibility; assert.throws(() => makeImagePocRequest(p, source)) })
test('waiting points are not made renderable', () => { const p = point(); p.status = 'WAITING_CANON'; assert.throws(() => makeImagePocRequest(p, source)) })
test('map is outside this portrait POC', () => { const p = point(); p.point_type = 'MAP'; assert.throws(() => makeImagePocRequest(p, source)) })
test('wrong subject binding rejected', () => { const p = point(); p.subject_id = 'char-wrong'; assert.throws(() => makeImagePocRequest(p, source)) })
test('changed brief hash rejected', () => { const p = point(); p.brief.subject.label = 'CHANGED'; assert.throws(() => makeImagePocRequest(p, source)) })
test('mutable revision is not provenance', () => assert.throws(() => makeImagePocRequest(point(), { ...source, source_revision: 'main' })))
test('edited request fields rejected', () => { const r = request(); r.execution_authorized = true; assert.throws(() => validateImagePocRequest(r)) })
test('unknown request override rejected', () => { const r = request(); r.api_key = 'TEST'; assert.throws(() => validateImagePocRequest(r)) })
test('bounded PNG structure and CRC can be checked without model or network', () => { const p = inspectPng(png()); assert.equal(p.width, 1); assert.equal(p.height, 1); assert.equal(p.structure_check, 'SIGNATURE_CHUNKS_CRC_PASS'); assert.equal(p.pixel_decode_check, 'NOT_PERFORMED_BY_THIS_MODULE') })
test('empty or non PNG bytes rejected', () => { assert.throws(() => inspectPng(Buffer.alloc(0))); assert.throws(() => inspectPng(Buffer.from('<svg>'+ ' '.repeat(100) + '</svg>'))) })
test('truncated PNG refused', () => assert.throws(() => inspectPng(png().subarray(0, -5))))
test('bad checksum refused', () => { const p = png(); p[20] ^= 1; assert.throws(() => inspectPng(p), /CRC/) })
test('trailing bytes after IEND refused', () => assert.throws(() => inspectPng(Buffer.concat([png(), Buffer.from('NOT_IMAGE')]))))
test('oversized buffer is refused before chunk decoding', () => assert.throws(() => inspectPng(Buffer.alloc(20*1024*1024+1))))
test('claimed oversized dimensions refused even when CRC is valid', () => { const p = png(); p.writeUInt32BE(9000, 16); p.writeUInt32BE(crc(p.subarray(12, 29)), 29); assert.throws(() => inspectPng(p), /DIMENSIONS/) })
test('observed bytes produce stable local receipt only', () => { const r = request(), o = observed(r); const a = imagePocReceipt(r, png(), o); assert.deepEqual(a, imagePocReceipt(r, png(), o)); assert.equal(a.publication_allowed, false); assert.equal(a.accepted_as_completed_asset, false); assert.equal(a.model_id, null); assert.equal(a.cost_invoice_audited, false) })
test('a matching visual review still is not proof of unattended generation', () => { const r = request(), o = observed(r); o.review = 'MATCHES_INTENDED_BRIEF'; const receipt = imagePocReceipt(r, png(), o); assert.equal(receipt.status, 'LOCAL_SAMPLE_REVIEW_REQUIRED'); assert.equal(receipt.unattended_generation_proven, false); assert.equal(receipt.provider_prompt_equality_proven, false) })
test('semantic mismatch is quarantined despite valid image structure', () => { const r = request(), o = observed(r); o.review = 'REJECTED_REQUEST_MISMATCH'; const receipt = imagePocReceipt(r, png(), o); assert.equal(receipt.status, 'QUARANTINED_NOT_AN_ASSET'); assert.equal(receipt.publication_allowed, false) })
test('wrong canvas proportions are independently quarantined', () => { const r = request(), o = observed(r); o.review = 'MATCHES_INTENDED_BRIEF'; const receipt = imagePocReceipt(r, png(2,1), o); assert.equal(receipt.shape_matches, false); assert.equal(receipt.status, 'QUARANTINED_NOT_AN_ASSET') })
for (const key of ['request_id', 'point_id', 'generation_key']) test(`receipt ${key} mismatch rejected`, () => { const r = request(), o = observed(r); o[key] = 'WRONG'; assert.throws(() => imagePocReceipt(r, png(), o)) })
test('image filename or opaque id is not a tool-result observation', () => { const r = request(), o = observed(r); o.tool_result_id = 'looks-generated.png'; assert.throws(() => imagePocReceipt(r, png(), o)) })
test('scheduler success cannot be inferred from foreground result', () => { const r = request(), o = observed(r); o.surface = 'SCHEDULED'; assert.throws(() => imagePocReceipt(r, png(), o)) })
test('API/codex renderer cannot masquerade as native chat result', () => { const r = request(), o = observed(r); o.tool = 'paid-api'; assert.throws(() => imagePocReceipt(r, png(), o)) })
test('embedded report assertions are not accepted as observer data', () => { const r = request(), o = observed(r); o.PR_merged = true; assert.throws(() => imagePocReceipt(r, png(), o)) })
async function disk(fn) { const root = await mkdtemp(join(tmpdir(), 'poc-test-')); try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) } }
test('reads exact known local file without copying or upload', async () => disk(async (root) => { const file = join(root, 'sample.png'); await writeFile(file, png()); assert.deepEqual(await readPocImage(root, file), png()); assert.deepEqual(await readFile(file), png()) }))
test('URL is never fetched', async () => disk(async (root) => assert.rejects(readPocImage(root, 'https://example.invalid/image.png'))))
test('outside working root refused', async () => disk(async (root) => assert.rejects(readPocImage(root, '/tmp/not-allowed.png'))))
test('symlink refused rather than following it', async () => disk(async (root) => { const file = join(root, 'source.png'); await writeFile(file, png()); const link = join(root, 'alias.png'); await symlink(file, link); await assert.rejects(readPocImage(root, link)) }))
test('missing file is not fabricated', async () => disk(async (root) => assert.rejects(readPocImage(root, join(root, 'missing.png')))))
test('source module has no external requests or paid execution flags', async () => { const text = await readFile(new URL('./image-poc-exchange.mjs', import.meta.url), 'utf8'); assert.doesNotMatch(text, /fetch\s*\(|https?:\/\/|process\.env|provider\.generate|writeFile\s*\(/) })
