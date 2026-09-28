import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createShadowReport, DEFAULT_PROVIDER, readJson, selectIllustrationCandidates } from './lib/illustration-worker.mjs'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const visualPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/VISUALS.json')
const assetsPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json')
const receiptsPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_RECEIPTS.json')

function parseArgs(args) {
  const options = { mode: 'SHADOW', provider: DEFAULT_PROVIDER, subjectIds: null }
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]
    if (flag === '--help') return { help: true }
    if (!['--mode', '--provider', '--subjects'].includes(flag) || !args[index + 1]) throw new Error('INVALID_ILLUSTRATION_ARGUMENTS')
    const value = args[++index]
    if (flag === '--mode') options.mode = value
    if (flag === '--provider') options.provider = value
    if (flag === '--subjects') options.subjectIds = value.split(',').filter(Boolean)
  }
  return options
}

export async function runIllustrationWorker(args = process.argv.slice(2)) {
  const options = parseArgs(args)
  if (options.help) return 'Usage: node archive/scripts/run-illustration-worker.mjs [--mode SHADOW] [--provider shadow|native_chatgpt|api_openai|manual_import] [--subjects subject-id,...]\nSHADOW planning reads VISUALS, SITE_ASSETS, and receipts. It never generates images, uploads files, or changes SITE_ASSETS.\n'
  if (options.mode !== 'SHADOW') throw new Error('LIVE_EXECUTION_DISABLED')
  const [catalog, siteAssets, receipts] = await Promise.all([readJson(visualPath), readJson(assetsPath), readJson(receiptsPath)])
  const plan = selectIllustrationCandidates({ catalog, siteAssets, receipts, subjectIds: options.subjectIds })
  return `${JSON.stringify(createShadowReport(plan, { provider: options.provider, mode: options.mode }), null, 2)}\n`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { process.stdout.write(await runIllustrationWorker()) }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message ?? 'ILLUSTRATION_WORKER_FAILED', site_assets_mutated: false, storage_written: false })}\n`)
    process.exitCode = 1
  }
}
