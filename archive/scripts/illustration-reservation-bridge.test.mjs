import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { inspectReservationPng, runReservationBridge } from './illustration-reservation-bridge.mjs'
import { buildReservationDispatch, RESERVATION_OUTPUT_PATH } from './lib/illustration-reservation-handoff.mjs'

test('PNG inspection fully decodes real bytes and rejects truncated or mislabeled data', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'reservation-png-'))
  t.after(() => rm(folder, { recursive: true, force: true }))
  const png = join(folder, 'current.png')
  const created = spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON ?? 'python3', ['-c',
    'from PIL import Image; import sys; Image.new("RGB",(32,24),(25,45,65)).save(sys.argv[1],format="PNG")', png])
  assert.equal(created.status, 0)
  const raw = await readFile(png)
  const fileId = `file_${'a'.repeat(32)}`
  const evidence = inspectReservationPng(png, fileId)
  assert.equal(evidence.fully_decoded, true)
  assert.equal(evidence.sha256, createHash('sha256').update(raw).digest('hex'))
  assert.equal(evidence.file_id, fileId)
  assert.deepEqual([evidence.width, evidence.height, evidence.size_bytes], [32, 24, raw.length])
  const promptText = '현대 한국의 작은 시설. 차분한 회색 자연광과 붓터치가 있는 풍경.'
  const job = {
    job_id: 'illustration-local-validation-123456', main_sha: 'a'.repeat(40),
    point_id: `point-${'b'.repeat(64)}`, generation_key: `generation-${'c'.repeat(64)}`,
    subject_id: 'loc-test', review_context_sha256: 'd'.repeat(64),
    prompt_sha256: createHash('sha256').update(promptText).digest('hex'),
    status: 'PREPARED', active_provider: 'native_chatgpt', created_at: '2026-10-05T01:00:00Z',
  }
  const rendererId = 'test-renderer'
  const dispatched = buildReservationDispatch({ job, promptText, rendererId, baselineFile: null,
    requestedAt: '2026-10-05T01:01:00Z' })
  const input = {
    job, promptText, rendererId, receipt: dispatched.receipt, scheduledPrompt: dispatched.renderer_prompt,
    imagePath: png, observedAt: '2026-10-05T01:03:00Z',
    currentFile: { path: RESERVATION_OUTPUT_PATH, file_id: fileId,
      library_file_id: `libfile_${'b'.repeat(32)}`, version_id: null,
      modified_at: '2026-10-05T01:02:00Z', mime_type: 'image/png', size_bytes: raw.length },
    pngEvidence: { fully_decoded: true, sha256: 'forged' },
  }
  assert.equal(runReservationBridge('collect', input).source_sha256, evidence.sha256)
  assert.throws(() => runReservationBridge('collect', {
    ...input, currentFile: { ...input.currentFile, sha256: 'f'.repeat(64) },
  }), /LOCAL_FILE_SHA_MISMATCH/)
  await writeFile(png, raw.subarray(0, 67))
  assert.throws(() => inspectReservationPng(png, fileId), /PNG_INVALID/)
  assert.throws(() => runReservationBridge('collect', input), /PNG_INVALID/)
  await writeFile(png, 'This is not a PNG.'.repeat(10))
  assert.throws(() => inspectReservationPng(png, fileId), /PNG_INVALID/)
})
