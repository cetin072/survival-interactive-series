/** Verify the fixed foreground experiment's committed PNG and non-publication state. */
import { readFile, lstat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectPng } from './lib/image-poc-exchange.mjs'
import { snapshotFromPublishedS02 } from './dry-run-publication.mjs'
import { prepareVisualPublication } from './run-visual-publication.mjs'
import { observeForegroundImage } from './lib/foreground-image-handoff.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const evidencePath = resolve(root, 'docs/AUTOMATIC_ARCHIVE_STEP6_FOREGROUND_20260927.json')
const demand = (ok, code) => { if (!ok) throw new Error(code) }

export async function checkForegroundSample({ checkBrief = false } = {}) {
  const record = JSON.parse(await readFile(evidencePath, 'utf8'))
  demand(record.version === 'codex-foreground-image-observation-v1'
    && record.chronicle_id === 'C03-AFTERFALL' && record.worldline_id === 'AFTERFALL'
    && record.visibility === 'PUBLIC_ARCHIVE' && record.subject_id === 'char-jinwoo'
    && record.point_id === 'point-e33f848046b1245234e579828dadc03939faf10d609c15bff315b8c421be1a72'
    && record.generation_key === 'generation-a59f0391ed3fa13bcbcde8ea2123446837e6cc84ef5ab24f93d07f815170f7e8'
    && record.intended_request_id === 'request-a71f9bb12162a6dd03090c01c88cff27c0acf04f9c38c1ca649fd2778f8d9fcd'
    && record.intended_request_source_tree === '403f41e8cdc273618373e19b43831f6b971b7b1e',
  'SAMPLE_IDENTITY_MISMATCH')
  demand(record.tool === 'image_gen.imagegen' && record.surface === 'CODEX_BUILTIN_FOREGROUND'
    && record.output_artifact_basename === 'exec-5a2f2170-34ca-41e8-980b-ccf43d27c7ea.png'
    && record.review.single_subject === true && record.review.no_embedded_text_observed === true
    && record.review.public_brief_appearance_match_observed === true
    && record.review.status === 'LOCAL_SAMPLE_REVIEWED_NOT_ACCEPTED'
    && record.review.final_canon_approval === false
    && record.provider_prompt_equality_proven === false
    && record.unattended_generation_proven === false
    && record.zero_added_cost_invoice_audited === false
    && record.paid_api_calls === 0 && record.credit_purchase_actions === 0
    && record.storage_uploads === 0 && record.database_writes === 0 && record.site_publications === 0,
  'SAMPLE_FALSE_SUCCESS_CLAIM')
  demand(record.workspace_file === 'archive/experiments/step6/char-jinwoo-20260927-foreground.png', 'SAMPLE_PATH_INVALID')
  const filePath = resolve(root, record.workspace_file)
  demand((await lstat(filePath)).isFile(), 'SAMPLE_NOT_REGULAR_FILE')
  const bytes = await readFile(filePath), inspected = inspectPng(bytes)
  demand(inspected.sha256 === 'f4882707c0272d1eb7123493bb46dc7193e0235ceba778d3582d0112a087a78d'
    && inspected.sha256 === record.file.sha256 && inspected.bytes === 1880742 && inspected.bytes === record.file.bytes
    && inspected.width === 1254 && inspected.height === 1254
    && inspected.width === record.file.width && inspected.height === record.file.height
    && inspected.format === 'PNG' && record.file.structure_check === inspected.structure_check,
  'SAMPLE_BYTES_MISMATCH')
  let handoff = null
  if (checkBrief) {
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
    const sourceRevision = git('rev-parse', 'HEAD').trim()
    const manifest = JSON.parse(git('show', `${sourceRevision}:archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json`))
    const snapshot = snapshotFromPublishedS02(manifest, sourceRevision)
    const { catalog } = await prepareVisualPublication(snapshot)
    const point = catalog.points.find((item) => item.point_id === record.point_id)
    handoff = observeForegroundImage(point, record, bytes)
  }
  return { status: 'LOCAL_SAMPLE_BYTES_VERIFIED_NOT_ACCEPTED', point_id: record.point_id,
    generation_key: record.generation_key, sha256: inspected.sha256, bytes: inspected.bytes,
    handoff, accepted_images: 0, provider_calls_during_check: 0,
    database_writes: 0, storage_uploads: 0, site_publications: 0 }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2)
    demand(args.length === 0 || args.length === 1 && args[0] === '--brief', 'INVALID_CHECK_MODE')
    process.stdout.write(JSON.stringify(await checkForegroundSample({ checkBrief: args[0] === '--brief' }), null, 2) + '\n')
  }
  catch { process.stderr.write('{"ok":false,"error":"FOREGROUND_SAMPLE_REJECTED","accepted_images":0}\n'); process.exitCode = 1 }
}
