import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { decideRelease, nextReleaseMarker, validateReleasePolicy } from './lib/production-release.mjs'

const root = resolve(import.meta.dirname, '../..')
const markerRef = 'archive/web/public/release/production.json'
const policyRef = 'archive/automation/release-policy.json'
// Inputs to this site's Vite/static Knowledge build. Operational workers and
// release bookkeeping do not change the public site by themselves.
const siteInputs = [
  'archive/web', 'archive/content', 'knowledge/content', 'knowledge/automation/config.json',
  'archive/scripts/build-knowledge.mjs',
  'archive/scripts/lib/knowledge-content.mjs', 'archive/scripts/lib/knowledge-public.mjs',
  'archive/scripts/lib/knowledge-release.mjs', 'archive/scripts/lib/wiki-public-sources.mjs',
  'archive/scripts/lib/approved-reader-sources.mjs', 'archive/scripts/lib/reader-transform.mjs',
  ':(exclude)archive/web/public/release/production.json',
  ':(exclude)archive/web/public/deploy-meta.json',
]

export async function prepare(args, { cwd = root, now = new Date() } = {}) {
  const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const apply = args.includes('--apply')
  const check = args.includes('--check')
  const force = args.includes('--force')
  if (apply === check) throw new Error('USAGE_APPLY_OR_CHECK')

  const policy = validateReleasePolicy(JSON.parse(await readFile(resolve(cwd, policyRef), 'utf8')))
  const headSha = git('rev-parse', 'HEAD')
  let marker = null
  let lastReleaseCommit = null
  if (existsSync(resolve(cwd, markerRef))) {
    marker = JSON.parse(await readFile(resolve(cwd, markerRef), 'utf8'))
    lastReleaseCommit = git('log', '-1', '--format=%H', '--', markerRef) || null
  }
  const hasSiteChanges = !marker || Boolean(git('diff', '--name-only', marker.source_main_sha, headSha, '--', ...siteInputs))
  const decision = decideRelease({ headSha, lastReleaseCommit, marker, policy, force, now, hasSiteChanges })
  if (!decision.due) return { ...decision, head_sha: headSha, last_release_commit: lastReleaseCommit }

  const next = nextReleaseMarker({ sourceMainSha: headSha, policy, previousMarker: marker, now })
  if (apply) {
    await mkdir(dirname(resolve(cwd, markerRef)), { recursive: true })
    await writeFile(resolve(cwd, markerRef), JSON.stringify(next, null, 2) + '\n')
  }
  return {
    status: apply ? 'RELEASE_PREPARED' : 'WOULD_RELEASE',
    due: true,
    reason: decision.reason,
    source_main_sha: headSha,
    last_release_commit: lastReleaseCommit,
    marker: next,
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(JSON.stringify(await prepare(process.argv.slice(2)), null, 2) + '\n') }
  catch (error) { process.stderr.write(JSON.stringify({ status: error.message }) + '\n'); process.exitCode = 1 }
}
