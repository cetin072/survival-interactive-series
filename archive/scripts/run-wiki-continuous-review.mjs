/** Local/program handoff CLI. No DB, scheduler, Graph or publication mutations.
 * Ledger writes require an explicit path outside the source tree and an exclusive lock.
 */
import { readFile, open, rename, unlink, realpath, lstat } from 'node:fs/promises'
import { resolve, sep, dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadWikiReviewSources } from './lib/wiki-review-sources.mjs'
import { emptyReviewLedger, enqueueReviewWork, reviewQueueSummary,
  submitReviewExtraction, submitIndependentReview, validateReviewLedger } from './lib/wiki-continuous-review.mjs'

export async function externalReviewLedgerPath(input, sourceRoot = resolve(import.meta.dirname, '../..')) {
  const path = resolve(input)
  const actualRoot = await realpath(sourceRoot)
  const parent = await realpath(dirname(path))
  const actualPath = resolve(parent, basename(path))
  if (actualPath === actualRoot || actualPath.startsWith(actualRoot + sep)) {
    throw new Error('WIKI_REVIEW_LEDGER_MUST_BE_OUTSIDE_SOURCE_TREE')
  }
  try {
    if (!(await lstat(actualPath)).isFile()) throw new Error('WIKI_REVIEW_LEDGER_NOT_REGULAR_FILE')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  return actualPath
}

export async function runContinuousReview(args = process.argv.slice(2)) {
  const allowed = new Set(['--scan', '--enqueue', '--extract', '--review', '--ledger', '--result', '--execution'])
  for (const arg of args.filter(a => a.startsWith('--'))) if (!allowed.has(arg)) throw new Error('WIKI_REVIEW_UNKNOWN_ARGUMENT')
  const modes = ['--scan', '--enqueue', '--extract', '--review'].filter(m => args.includes(m))
  if (modes.length !== 1) throw new Error('WIKI_REVIEW_ONE_MODE_REQUIRED')
  const value = flag => {
    const i = args.indexOf(flag)
    if (i < 0) return null
    if (!args[i + 1] || args[i + 1].startsWith('--') || args.lastIndexOf(flag) !== i) {
      throw new Error('WIKI_REVIEW_ARGUMENT_VALUE_REQUIRED')
    }
    return args[i + 1]
  }
  const ledgerPath = value('--ledger') && await externalReviewLedgerPath(value('--ledger'))
  if (!args.includes('--scan') && !ledgerPath) throw new Error('WIKI_REVIEW_LEDGER_REQUIRED')
  const lock = ledgerPath && !args.includes('--scan') ? await open(ledgerPath + '.lock', 'wx', 0o600) : null
  try {
    let ledger = emptyReviewLedger()
    if (ledgerPath) {
      try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    validateReviewLedger(ledger)
    const discovery = await loadWikiReviewSources()
    let result = { status: 'SCAN_ONLY' }
    if (args.includes('--enqueue')) {
      result = enqueueReviewWork(discovery, ledger, new Date().toISOString())
      ledger = result.ledger
    }
    if (args.includes('--extract') || args.includes('--review')) {
      if (!value('--result') || !value('--execution')) throw new Error('WIKI_REVIEW_RESULT_AND_EXECUTION_REQUIRED')
      const body = JSON.parse(await readFile(resolve(value('--result')), 'utf8'))
      const job = ledger.events.findLast(e => e.job_id === body.job_id)?.job
      const scope = discovery.scopes.find(s => s.chronicle_id === job?.chronicle_id && s.source_id === job?.scope.source_id)
      if (!scope) throw new Error('WIKI_REVIEW_SOURCE_UNAVAILABLE')
      ledger = (args.includes('--extract') ? submitReviewExtraction : submitIndependentReview)(
        ledger, body.job_id, scope, body, value('--execution'), new Date().toISOString())
      result = ledger.events.at(-1)
    }
    if (lock) {
      const temp = ledgerPath + '.next'
      const file = await open(temp, 'wx', 0o600)
      try { await file.writeFile(JSON.stringify(ledger, null, 2) + '\n'); await file.sync() }
      finally { await file.close() }
      await rename(temp, ledgerPath)
    }
    return { status: result.status, job: result.job ?? null,
      summary: reviewQueueSummary(discovery, ledger), exclusions: discovery.exclusions,
      warning: 'Local candidate handoff only; existing scheduled Native Worker is not connected to this contract.' }
  } finally {
    if (lock) { await lock.close(); await unlink(ledgerPath + '.lock') }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runContinuousReview(), null, 2)) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
