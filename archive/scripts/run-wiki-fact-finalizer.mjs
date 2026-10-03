import { readFile, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { finalizeWikiFactProposal } from './lib/wiki-fact-finalizer.mjs'

async function readJson(path) {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.size > 4_000_000) throw new Error('WIKI_FINALIZER_INPUT_FILE_INVALID')
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function runWikiFinalizerCli(args, { root = resolve(import.meta.dirname, '../..') } = {}) {
  const mode = args.at(-1)
  if (!['--check', '--apply'].includes(mode)) throw new Error('WIKI_FINALIZER_MODE_REQUIRED')
  const jobIndex = args.indexOf('--job')
  const proposalIndex = args.indexOf('--proposal')
  const reviewIndex = args.indexOf('--review')
  if (jobIndex < 0 || proposalIndex < 0 || reviewIndex < 0
    || !args[jobIndex + 1] || !args[proposalIndex + 1] || !args[reviewIndex + 1]) {
    throw new Error('WIKI_FINALIZER_ARGUMENTS_INVALID')
  }
  const job = await readJson(resolve(root, args[jobIndex + 1]))
  const proposal = await readJson(resolve(root, args[proposalIndex + 1]))
  const review = await readJson(resolve(root, args[reviewIndex + 1]))
  const result = await finalizeWikiFactProposal({ root, job, proposal, review, apply: mode === '--apply' })
  return JSON.stringify(result, null, 2) + '\n'
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(await runWikiFinalizerCli(process.argv.slice(2))) }
  catch (error) {
    const code = /^WIKI_[A-Z0-9_]+$/.test(error.message) ? error.message : 'WIKI_FINALIZER_REJECTED'
    process.stderr.write(JSON.stringify({ status: 'REJECTED', code, graph_changed: false, source_marked_processed: false }) + '\n')
    process.exitCode = 1
  }
}
