/** Native worker handoff and validation only; never persists Graph or marks a source done. */
import { readFile, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discoverWikiSource } from './lib/wiki-semantic-jobs.mjs'
import { buildWikiFactJob, buildWikiFactReviewJob, compileWikiFactProposal, validateWikiFactReview } from './lib/wiki-fact-extractor.mjs'

async function readResult(root, ref) {
  const path = resolve(root, ref)
  const stat = await lstat(path)
  if (!stat.isFile() || stat.size > 4_000_000) throw new Error('WIKI_RESULT_FILE_INVALID')
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function runWikiFactCli(args, { root = resolve(import.meta.dirname, '../..'), discover = discoverWikiSource } = {}) {
  const prepare = args.length === 1 && args[0] === '--prepare'
  const check = args.length === 3 && args[0] === '--result' && args[2] === '--check'
  const prepareReview = args.length === 3 && args[0] === '--proposal' && args[2] === '--prepare-review'
  const checkReview = args.length === 5 && args[0] === '--proposal' && args[2] === '--review' && args[4] === '--check'
  if (!prepare && !check && !prepareReview && !checkReview) throw new Error('WIKI_FACT_CLI_ARGUMENTS_INVALID')
  let source
  try { source = await discover(root) }
  catch (error) {
    if (error.message !== 'WIKI_NO_PENDING_SOURCE') throw error
    return JSON.stringify({ status: 'NOOP', reason: error.message, source_marked_processed: false, graph_changed: false }) + '\n'
  }
  const graph = JSON.parse(await readFile(resolve(root, 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'), 'utf8'))
  const job = buildWikiFactJob(source, graph)
  if (prepare) return JSON.stringify(job, null, 2) + '\n'
  if (check) {
    const result = await readResult(root, args[1])
    return JSON.stringify(compileWikiFactProposal(job, result), null, 2) + '\n'
  }
  const proposal = await readResult(root, args[1])
  const reviewJob = buildWikiFactReviewJob(job, proposal)
  if (prepareReview) return JSON.stringify(reviewJob, null, 2) + '\n'
  const review = await readResult(root, args[3])
  return JSON.stringify(validateWikiFactReview(reviewJob, review), null, 2) + '\n'
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(await runWikiFactCli(process.argv.slice(2))) }
  catch (error) {
    const code = /^WIKI_[A-Z0-9_]+$/.test(error.message) ? error.message : 'WIKI_FACT_EXTRACTION_REJECTED'
    process.stderr.write(JSON.stringify({ status: 'REJECTED', code, graph_changed: false, source_marked_processed: false }) + '\n')
    process.exitCode = 1
  }
}
