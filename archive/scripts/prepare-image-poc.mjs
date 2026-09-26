/** Prepare one actual Step 5 portrait request. No tool call, generation or file write. */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { snapshotFromPublishedS02 } from './dry-run-publication.mjs'
import { prepareVisualPublication } from './run-visual-publication.mjs'
import { validateVisualCatalog } from './lib/visual-compiler.mjs'
import { makeImagePocRequest, validateImagePocRequest } from './lib/image-poc-exchange.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
export async function prepareImagePoc() {
  const source_revision = git('rev-parse', 'HEAD').trim()
  const manifest = JSON.parse(git('show', `${source_revision}:archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json`))
  const snapshot = snapshotFromPublishedS02(manifest, source_revision)
  const { catalog } = await prepareVisualPublication(snapshot)
  validateVisualCatalog(catalog)
  const point = catalog.points.find((p) => p.subject_id === 'char-jinwoo')
  const request = makeImagePocRequest(point, { batch_id: catalog.batch_id, source_revision })
  validateImagePocRequest(request)
  return request
}
async function run(args) {
  if (args.length !== 1 || !['--check', '--request'].includes(args[0])) throw new Error('EXPLICIT_POC_MODE_REQUIRED')
  const request = await prepareImagePoc()
  if (args[0] === '--request') return request
  assert.deepEqual(request, await prepareImagePoc())
  assert.equal(request.subject_id, 'char-jinwoo')
  assert.equal(request.intended_brief.canon_facts.appearance.hair, '자연스럽게 내려오는 검은 앞머리')
  assert.equal(request.intended_brief.canon_facts.appearance.voice, undefined)
  assert.equal(request.paid_api_enabled, false)
  assert.equal(request.scheduled_execution_enabled, false)
  assert.equal(request.intended_output.images, 1)
  const corrupted = structuredClone(request); corrupted.execution_authorized = true
  assert.throws(() => validateImagePocRequest(corrupted))
  return { status: 'REAL_PUBLIC_BRIEF_REQUEST_CHECK_PASS', request_id: request.request_id,
    point_id: request.point_id, generation_key: request.generation_key, subject_id: request.subject_id,
    same_request_twice: true, image_calls: 0, external_calls: 0, files_written: 0,
    unattended_generation_proven: false, note: 'CI checks request preparation only, never a real image generation.' }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(JSON.stringify(await run(process.argv.slice(2)), null, 2) + '\n') }
  catch { process.stderr.write('{"ok":false,"error":"IMAGE_POC_REQUEST_REJECTED","image_calls":0}\n'); process.exitCode = 1 }
}
