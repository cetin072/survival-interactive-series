import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { findProductionSite, findReadyProductionDeploy } from './lib/netlify-production.mjs'
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
const token = process.env.NETLIFY_AUTH_TOKEN
if (!token) throw new Error('NETLIFY_AUTH_TOKEN_REQUIRED')

const marker = validateReleaseMarker(JSON.parse(await readFile(resolve(root, 'archive/web/public/release/production.json'), 'utf8')))
if (marker.source_main_sha !== options.sourceSha) throw new Error('RELEASE_SOURCE_MISMATCH')

const headers = { Authorization: `Bearer ${token}`, 'User-Agent': 'survival-diary-release-verifier' }
async function netlify(path) {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, { headers })
  if (!response.ok) throw new Error(`NETLIFY_API_FAILED:${response.status}`)
  return response.json()
}
const site = findProductionSite(await netlify('/sites'))

let deploy = null
for (let attempt = 0; attempt < 48; attempt += 1) {
  const deploys = await netlify(`/sites/${encodeURIComponent(site.id)}/deploys?per_page=100`)
  deploy = findReadyProductionDeploy(deploys, options.releaseSha)
  if (deploy) break
  await new Promise((resolveWait) => setTimeout(resolveWait, 5000))
}
if (!deploy) throw new Error('EXACT_PRODUCTION_DEPLOY_NOT_READY')

async function publicJson(path) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`https://survival-diary-archive.netlify.app${path}?verify=${options.releaseSha.slice(0, 12)}`,
      { cache: 'no-store', headers: { 'User-Agent': 'survival-diary-release-verifier' } })
    if (response.ok) return response.json()
    await new Promise((resolveWait) => setTimeout(resolveWait, 3000))
  }
  throw new Error('PRODUCTION_MARKER_NOT_READY')
}
const publishedMarker = validateReleaseMarker(await publicJson('/release/production.json'))
if (publishedMarker.source_main_sha !== options.sourceSha) throw new Error('PUBLISHED_RELEASE_SOURCE_MISMATCH')

const manifestResponse = await fetch(`https://survival-diary-archive.netlify.app/archive-release-manifest.json?verify=${options.releaseSha.slice(0, 12)}`,
  { cache: 'no-store', headers: { 'User-Agent': 'survival-diary-release-verifier' } })
if (!manifestResponse.ok) throw new Error('PRODUCTION_RELEASE_MANIFEST_NOT_READY')

console.log(JSON.stringify({
  status: 'PRODUCTION_VERIFIED',
  source_main_sha: options.sourceSha,
  release_sha: options.releaseSha,
  deploy_id: deploy.id,
  deploy_commit_ref: deploy.commit_ref,
  marker: publishedMarker,
}, null, 2))
