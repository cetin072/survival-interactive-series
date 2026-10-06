import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  assertReservationPromptReadback,
  buildReservationDispatch,
  buildReservationRendererPrompt,
  collectReservationResult,
  routeReservationJob,
} from './lib/illustration-reservation-handoff.mjs'

// Reuses the verify/reopen pattern and limits from derive_site_original.py.
// This inspects the original bytes; it neither edits nor transfers the image.
export function inspectReservationPng(imagePath, fileId) {
  if (typeof imagePath !== 'string' || !/^file_[A-Za-z0-9_-]{16,80}$/.test(fileId ?? '')) {
    throw new Error('ILLUSTRATION_RESERVATION_PNG_INPUT_INVALID')
  }
  const result = spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON ?? 'python3', ['-c', `
import hashlib, io, json, sys
from pathlib import Path
from PIL import Image
p = Path(sys.argv[1])
if not 67 <= p.stat().st_size <= 20 * 1024 * 1024:
    raise ValueError('PNG_SIZE_INVALID')
raw = p.read_bytes()
with Image.open(io.BytesIO(raw)) as im:
    if im.format != 'PNG' or not (0 < im.width <= 8192 and 0 < im.height <= 8192):
        raise ValueError('PNG_FORMAT_OR_DIMENSIONS_INVALID')
    width, height = im.size
    im.verify()
with Image.open(io.BytesIO(raw)) as im:
    im.load()
print(json.dumps(dict(format='PNG', fully_decoded=True, width=width, height=height,
    size_bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())))
`, resolve(imagePath)], { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30000 })
  if (result.error || result.status !== 0) throw new Error('ILLUSTRATION_RESERVATION_PNG_INVALID')
  return { ...JSON.parse(result.stdout), file_id: fileId }
}

export function runReservationBridge(action, input) {
  if (action === 'route') return routeReservationJob(input)
  if (action === 'prompt') {
    const renderer_prompt = buildReservationRendererPrompt(input.promptText, input.promptSha256)
    return { renderer_prompt, renderer_prompt_sha256: createHash('sha256').update(renderer_prompt).digest('hex') }
  }
  if (action === 'inspect') return inspectReservationPng(input.imagePath, input.fileId)
  if (action === 'dispatch') {
    if (routeReservationJob(input).role !== 'DISPATCH') {
      throw new Error('ILLUSTRATION_RESERVATION_UNRESOLVED_DISPATCH')
    }
    return buildReservationDispatch(input)
  }
  if (action === 'readback') {
    assertReservationPromptReadback(input)
    return { status: 'EXACT_PROMPT_CONFIRMED' }
  }
  if (action === 'collect') {
    // Caller-supplied evidence is deliberately ignored. Decode this exact file.
    const pngEvidence = input.job?.status === 'PREPARED'
      ? inspectReservationPng(input.imagePath, input.currentFile?.file_id) : null
    if (pngEvidence && input.currentFile.sha256 !== undefined
      && input.currentFile.sha256 !== pngEvidence.sha256) {
      throw new Error('ILLUSTRATION_RESERVATION_LOCAL_FILE_SHA_MISMATCH')
    }
    return collectReservationResult({
      ...input,
      currentFile: pngEvidence ? { ...input.currentFile, sha256: pngEvidence.sha256 } : input.currentFile,
      pngEvidence,
    })
  }
  throw new Error('ILLUSTRATION_RESERVATION_ACTION_INVALID')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, inputPath] = process.argv.slice(2)
    if (!inputPath) throw new Error('ILLUSTRATION_RESERVATION_INPUT_FILE_REQUIRED')
    const input = JSON.parse(await readFile(resolve(inputPath), 'utf8'))
    process.stdout.write(JSON.stringify(runReservationBridge(action, input), null, 2) + '\n')
  } catch (error) {
    process.stderr.write(JSON.stringify({ status: 'BLOCKED', error: error.message }) + '\n')
    process.exitCode = 1
  }
}
