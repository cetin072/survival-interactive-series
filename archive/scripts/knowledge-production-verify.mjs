import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { verifyProductionPublication } from './lib/knowledge-release.mjs'
import { isExactProductionDeployMeta } from './lib/knowledge-production.mjs'

const root = resolve(import.meta.dirname, '../..')
const shaPattern = /^[a-f0-9]{40}$/
const args = process.argv.slice(2)
const options = {}
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (!['--brief', '--merge-sha'].includes(arg)) throw new Error('Usage: knowledge-production-verify.mjs --brief K-... --merge-sha SHA')
  const value = args[++i]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
  if (arg === '--brief') options.briefId = value
  else options.mergeSha = value
}
if (!/^K-\d+$/.test(options.briefId ?? '')) throw new Error('Invalid --brief')
if (!shaPattern.test(options.mergeSha ?? '')) throw new Error('Invalid --merge-sha')

const brief = JSON.parse(await readFile(join(root, 'knowledge/content/briefs', `${options.briefId}.json`), 'utf8'))
const config = JSON.parse(await readFile(join(root, 'knowledge/automation/config.json'), 'utf8'))
if (brief.id !== options.briefId || brief.status !== 'PUBLISHED') throw new Error('PUBLISHED_BRIEF_REQUIRED')
if (config.publication_mode !== 'AUTO_LOW_RISK' || config.auto_publish_enabled !== true) throw new Error('AUTO_PUBLICATION_NOT_ENABLED')

const origin = config.site_origin
async function publicResponse(target) {
  const joiner = target.includes('?') ? '&' : '?'
  return fetch(`${origin}${target}${joiner}verify=${options.mergeSha.slice(0, 12)}-${Date.now()}`, {
    headers: { 'User-Agent': 'survival-diary-knowledge-verifier' },
    cache: 'no-store',
  })
}

let deployMeta = null
for (let attempt = 0; attempt < 48; attempt += 1) {
  try {
    const response = await publicResponse('/deploy-meta.json')
    if (response.ok) {
      const candidate = await response.json()
      if (isExactProductionDeployMeta(candidate, options.mergeSha)) {
        deployMeta = candidate
        break
      }
    }
  } catch {}
  await new Promise((resolveWait) => setTimeout(resolveWait, 5000))
}
if (!deployMeta) throw new Error('EXACT_PRODUCTION_DEPLOY_NOT_READY')

const path = `/knowledge/${brief.slug}/`
async function publicText(target) {
  let lastStatus = 0
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await publicResponse(target)
    lastStatus = response.status
    if (response.ok) return response.text()
    await new Promise((resolveWait) => setTimeout(resolveWait, 3000))
  }
  throw new Error(`PRODUCTION_HTTP_NOT_READY:${target}:${lastStatus}`)
}
const [article, index, sitemap] = await Promise.all([
  publicText(path),
  publicText('/knowledge/'),
  publicText('/sitemap.xml'),
])

const result = verifyProductionPublication({
  deployStatus: 'READY',
  deployCommitSha: deployMeta.commit_ref,
  mergeSha: options.mergeSha,
  pageReachable: article.includes(brief.title),
  indexContains: index.includes(path),
  sitemapContains: sitemap.includes(path),
})
if (result.status !== 'PUBLISHED') throw new Error(`PRODUCTION_VERIFY_FAILED:${result.reasons.join(',')}`)

console.log(JSON.stringify({
  status: result.status,
  brief_id: brief.id,
  slug: brief.slug,
  merge_sha: options.mergeSha,
  production_provider: deployMeta.provider,
  production_context: deployMeta.context,
  production_commit_ref: deployMeta.commit_ref,
  build_id: deployMeta.build_id,
  article_path: path,
  index_contains: true,
  sitemap_contains: true,
}, null, 2))
