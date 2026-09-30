import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateKnowledgeState } from './lib/knowledge-scan.mjs'
import { validateRuntimeState } from './lib/knowledge-worker-runtime.mjs'
import { validateWorkerPolicy, validateProviderConfig } from './lib/knowledge-worker-config.mjs'

const root = resolve(import.meta.dirname, '../..')
const read = async (ref) => JSON.parse(await readFile(resolve(root, ref), 'utf8'))
const policy = await read('knowledge/automation/worker-policy.json')
const provider = await read('knowledge/automation/provider-config.json')
const state = await read('knowledge/automation/state.json')
const runtime = await read('knowledge/automation/runtime-state.json')
validateWorkerPolicy(policy)
validateProviderConfig(provider)
validateKnowledgeState(state)
validateRuntimeState(runtime)
console.log(JSON.stringify({ status: 'KNOWLEDGE_WORKER_STATE_VALID', sources: state.sources.length, backfill_reviewed: runtime.backfill.reviewed_items.length }))
