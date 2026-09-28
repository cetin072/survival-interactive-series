import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { decideRelease, nextReleaseMarker, validateReleasePolicy } from './lib/production-release.mjs'

const root = resolve(import.meta.dirname, '../..')
const markerRef = 'archive/web/public/release/production.json'
const policyRef = 'archive/automation/release-policy.json'
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

export async function prepare(args) {
  const apply = args.includes('--apply')
  const check = args.includes('--check')
  const force = args.includes('--force')
  if (apply === check) throw new Error('USAGE_APPLY_OR_CHECK')

  const policy = validateReleasePolicy(JSON.parse(await readFile(resolve(root, policyRef), 'utf8')))
  const headSha = git('rev-parse', 'HEAD')
  let marker = null
  let lastReleaseCommit = null
  if (existsSync(resolve(root, markerRef))) {
    marker = JSON.parse(await readFile(resolve(root, markerRef), 'utf8'))
    lastReleaseCommit = git('log', '-1', '--format=%H', '--', markerRef) || null
  }
  const decision = decideRelease({ headSha, lastReleaseCommit, marker, policy, force })
  if (!decision.due) return { ...decision, head_sha: headSha, last_release_commit: lastReleaseCommit }

  const next = nextReleaseMarker({ sourceMainSha: headSha, policy, previousMarker: marker })
  if (apply) {
    await mkdir(dirname(resolve(root, markerRef)), { recursive: true })
    await writeFile(resolve(root, markerRef), JSON.stringify(next, null, 2) + '\n')
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
