import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { prepare } from './prepare-production-release.mjs'

const root = resolve(import.meta.dirname, '../..')

function git(...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function runNode(...args) {
  execFileSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
}

export async function runProductionRelease() {
  const decision = await prepare(['--apply'])
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\\n`)

  if (decision.status !== 'RELEASE_PREPARED') {
    return {
      status: decision.status,
      production_release: 'NOOP',
      source_main_sha: decision.source_main_sha ?? null,
    }
  }

  git('add', 'archive/web/public/release/production.json')
  git('config', 'user.name', 'archive-release-bot')
  git('config', 'user.email', 'archive-release-bot@users.noreply.github.com')
  git('commit', '-m', `release: publish batched Production for ${decision.source_main_sha.slice(0, 12)}`)

  const releaseSha = git('rev-parse', 'HEAD')
  git('fetch', 'origin', 'main')
  if (git('rev-parse', 'HEAD^') !== git('rev-parse', 'origin/main')) {
    throw new Error('MAIN_MOVED_RELEASE_ABORTED')
  }

  git('push', 'origin', 'HEAD:main')

  runNode(
    'archive/scripts/verify-production-release.mjs',
    '--source-sha', decision.source_main_sha,
    '--release-sha', releaseSha,
  )

  return {
    status: 'PRODUCTION_RELEASE_VERIFIED',
    source_main_sha: decision.source_main_sha,
    release_sha: releaseSha,
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await runProductionRelease()
    process.stdout.write(`${JSON.stringify(result, null, 2)}\\n`)
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: error.message ?? 'PRODUCTION_RELEASE_FAILED' })}\\n`)
    process.exitCode = 1
  }
}
