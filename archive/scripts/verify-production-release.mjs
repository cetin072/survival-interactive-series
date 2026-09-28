import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isExactProductionDeployMeta } from './lib/knowledge-production.mjs'
import { validateReleaseMarker } from './lib/production-release.mjs'

const root = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const options = {}
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (!['--source-sha', '--release-sha'].includes(arg)) throw new Error('USAGE_SOURCE_AND_RELEASE_SHA')
  const value = args[++i]
  if (!value || value.startsWith('--')) throw new Error('MISSING_RELEASE_ARG')
  if (arg === '--source-sha') options.sourceSha = value
  else options.releaseSha = value
}
if (!/^[a-f0-9]{40}$/.test(options.sourceSha ?? '') || !/^[a-f0-9]{40}$/.test(options.releaseSha ?? '')) {
  throw new Error('INVALID_RELEASE_SHA')
}

const localMarker = validateReleaseMarker(JSON.parse(
  await readFile(resolve(root, 'archive/web/public/release/production.json'), 'utf8')))
if (localMarker.source_main_sha !== options.sourceSha) throw new Error('RELEASE_SOURCE_MISMATCH')

async function publicResponse(path) {
  const joiner = path.includes('?') ? '&' : '?'
  return fetch(`https://survival-diary-archive.netlify.app${path}${joiner}verify=${options.releaseSha.slice(0, 12)}-${Date.now()}`,
    { cache: 'no-store', headers: { 'User-Agent': 'survival-diary-release-verifier' } })
}

let deployMeta = null
for (let attempt = 0; attempt < 48; attempt += 1) {
  try {
    const response = await publicResponse('/deploy-meta.json')
    if (response.ok) {
      const candidate = await response.json()
      if (isExactProductionDeployMeta(candidate, options.releaseSha)) {
        deployMeta = candidate
        break
      }
    }
  } catch {}
  await new Promise((resolveWait) => setTimeout(resolveWait, 5000))
}
if (!deployMeta) throw new Error('EXACT_PRODUCTION_DEPLOY_NOT_READY')

let publishedMarker = null
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    const response = await publicResponse('/release/production.json')
    if (response.ok) {
      const candidate = validateReleaseMarker(await response.json())
      if (candidate.source_main_sha === options.sourceSha) {
        publishedMarker = candidate
        break
      }
    }
  } catch {}
  await new Promise((resolveWait) => setTimeout(resolveWait, 3000))
}
if (!publishedMarker) throw new Error('PUBLISHED_RELEASE_SOURCE_MISMATCH')

const manifest = await publicResponse('/archive-release-manifest.json')
if (!manifest.ok) throw new Error('PRODUCTION_RELEASE_MANIFEST_NOT_READY')

console.log(JSON.stringify({
  status: 'PRODUCTION_VERIFIED',
  source_main_sha: options.sourceSha,
  release_sha: options.releaseSha,
  production_provider: deployMeta.provider,
  production_context: deployMeta.context,
  production_commit_ref: deployMeta.commit_ref,
  build_id: deployMeta.build_id,
  marker: publishedMarker,
}, null, 2))
