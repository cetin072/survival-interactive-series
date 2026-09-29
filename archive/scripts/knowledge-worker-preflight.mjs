import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { planWorkerPreflight } from './lib/knowledge-worker-runtime.mjs'
import { validateWorkerPolicy, validateProviderConfig } from './lib/knowledge-worker-config.mjs'

const root = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const options = {}
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (!['--scanner-json', '--open-prs-json', '--checks-json', '--now'].includes(arg)) throw new Error('USAGE_PREFLIGHT_INPUTS')
  const value = args[++i]
  if (!value || value.startsWith('--')) throw new Error(`MISSING_VALUE:${arg}`)
  options[arg.slice(2)] = value
}
if (!options['scanner-json'] || !options.now) throw new Error('SCANNER_AND_NOW_REQUIRED')

const readJson = async (path) => JSON.parse(await readFile(resolve(path), 'utf8'))
const policy = JSON.parse(await readFile(resolve(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
const providerConfig = JSON.parse(await readFile(resolve(root, 'knowledge/automation/provider-config.json'), 'utf8'))
const runtimeState = JSON.parse(await readFile(resolve(root, 'knowledge/automation/runtime-state.json'), 'utf8'))
validateWorkerPolicy(policy)
validateProviderConfig(providerConfig)

const scannerResult = await readJson(options['scanner-json'])
const openPrs = options['open-prs-json'] ? await readJson(options['open-prs-json']) : []
const checksByPr = options['checks-json'] ? await readJson(options['checks-json']) : {}
console.log(JSON.stringify(planWorkerPreflight({ policy, providerConfig, runtimeState, scannerResult, openPrs, checksByPr, now: options.now }), null, 2))

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {}
