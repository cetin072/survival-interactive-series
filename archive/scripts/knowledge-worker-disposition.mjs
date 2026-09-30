import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { recordKnowledgeDisposition, validateKnowledgeState } from './lib/knowledge-scan.mjs'
import { recordBackfillResult, validateRuntimeState } from './lib/knowledge-worker-runtime.mjs'

const root = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const options = { candidateIds: [], briefIds: [] }
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (!['--mode','--source-ref','--source-sha','--status','--code','--note','--now','--candidate','--brief','--work-key'].includes(arg)) {
    throw new Error('USAGE_DISPOSITION')
  }
  const value = args[++i]
  if (!value || value.startsWith('--')) throw new Error(`MISSING_VALUE:${arg}`)
  if (arg === '--candidate') options.candidateIds.push(value)
  else if (arg === '--brief') options.briefIds.push(value)
  else options[arg.slice(2)] = value
}

if (!['fresh','backfill'].includes(options.mode)) throw new Error('MODE_REQUIRED')
if (!options.status || !options.now) throw new Error('STATUS_AND_NOW_REQUIRED')
if (Number.isNaN(Date.parse(options.now))) throw new Error('INVALID_NOW')

const statePath = resolve(root, 'knowledge/automation/state.json')
const runtimePath = resolve(root, 'knowledge/automation/runtime-state.json')
const state = JSON.parse(await readFile(statePath, 'utf8'))
const runtime = JSON.parse(await readFile(runtimePath, 'utf8'))
validateKnowledgeState(state)
validateRuntimeState(runtime)

if (options.mode === 'fresh') {
  if (!options['source-ref'] || !options['source-sha']) throw new Error('FRESH_SOURCE_REQUIRED')
  if (!['HOLD','HUMAN_REVIEW','PROCESSED'].includes(options.status)) throw new Error('INVALID_FRESH_STATUS')
  recordKnowledgeDisposition(state, {
    sourceManifestRef: options['source-ref'],
    sourceManifestSha256: options['source-sha'],
    status: options.status,
    processedAt: options.now,
    candidateIds: options.candidateIds,
    briefIds: options.briefIds,
    dispositionCode: options.code,
    dispositionNote: options.note,
  })
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n')
  console.log(JSON.stringify({ status: 'FRESH_DISPOSITION_RECORDED', source_manifest_ref: options['source-ref'], disposition: options.status }, null, 2))
} else {
  if (!options['work-key']) throw new Error('BACKFILL_WORK_KEY_REQUIRED')
  if (!['HOLD','HUMAN_REVIEW','NO_CANDIDATE','PR_CREATED','PROCESSED'].includes(options.status)) throw new Error('INVALID_BACKFILL_STATUS')
  recordBackfillResult(runtime, { workKey: options['work-key'], status: options.status, now: options.now })
  await writeFile(runtimePath, JSON.stringify(runtime, null, 2) + '\n')
  console.log(JSON.stringify({ status: 'BACKFILL_DISPOSITION_RECORDED', work_key: options['work-key'], disposition: options.status }, null, 2))
}
