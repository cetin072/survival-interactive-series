import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { isExactProductionDeployMeta } from './lib/knowledge-production.mjs'
import { validateReleaseMarker } from './lib/production-release.mjs'

const SITE = 'https://survival-diary-archive.netlify.app'
const SUPABASE_ORIGIN = 'https://jgsxpdflgkqroecfjzxq.supabase.co'
const SHA = /^[a-f0-9]{40}$/

export function validateOperatorSmoke({ status, csp, robots, html, bundle }) {
  const errors = []
  if (status !== 200) errors.push('OPERATOR_ROUTE_UNAVAILABLE')
  if (!csp) errors.push('CSP_MISSING')
  const connect = csp?.split(';').map((part) => part.trim()).find((part) => part.startsWith('connect-src '))
  if (connect !== `connect-src 'self' ${SUPABASE_ORIGIN}`) errors.push('CSP_SUPABASE_ORIGIN_INVALID')
  const sources = connect?.split(/\s+/).slice(1) ?? []
  if (sources.some((source) => source === '*' || source === 'https:' || source === 'wss:' || source.includes('*'))) errors.push('CSP_CONNECT_SRC_TOO_BROAD')
  if (!robots?.toLowerCase().includes('noindex')) errors.push('OPERATOR_NOINDEX_MISSING')
  if (!/assets\/[\w.-]+\.js/.test(html ?? '') || !bundle?.includes(SUPABASE_ORIGIN)) errors.push('OPERATOR_SUPABASE_CONFIG_MISSING')
  if (/service_role/i.test(bundle ?? '')) errors.push('SERVICE_ROLE_MARKER_IN_CLIENT_BUNDLE')
  return { ok: errors.length === 0, errors }
}

async function request(path, releaseSha, fetchImpl) {
  const separator = path.includes('?') ? '&' : '?'
  return fetchImpl(`${SITE}${path}${separator}archive-smoke=${releaseSha.slice(0, 12)}-${Date.now()}`, {
    cache: 'no-store', headers: { 'User-Agent': 'survival-diary-batched-release-smoke' },
  })
}

async function json(response, code) {
  if (!response.ok) throw new Error(`${code}:${response.status}`)
  return response.json()
}

export async function runProductionSmoke({ sourceSha, releaseSha, fetchImpl = fetch }) {
  if (!SHA.test(sourceSha ?? '') || !SHA.test(releaseSha ?? '')) throw new Error('PRODUCTION_SMOKE_SHA_INVALID')
  const deployMeta = await json(await request('/deploy-meta.json', releaseSha, fetchImpl), 'DEPLOY_META_UNAVAILABLE')
  if (!isExactProductionDeployMeta(deployMeta, releaseSha) || deployMeta.context !== 'production') throw new Error('DEPLOY_META_EXACT_RELEASE_MISMATCH')
  const marker = validateReleaseMarker(await json(await request('/release/production.json', releaseSha, fetchImpl), 'RELEASE_MARKER_UNAVAILABLE'))
  if (marker.source_main_sha !== sourceSha) throw new Error('RELEASE_MARKER_SOURCE_SHA_MISMATCH')

  const routes = [
    '/',
    '/?view=chronicle&chronicle=C01-HAN-JUNHO',
    '/?view=chronicle&chronicle=C02-STRONGHOLD',
    '/?view=chronicle&chronicle=C03-AFTERFALL',
    '/knowledge/',
    '/operator/',
  ]
  const responses = new Map()
  for (const route of routes) {
    const response = await request(route, releaseSha, fetchImpl)
    if (!response.ok) throw new Error(`PRODUCTION_ROUTE_FAILED:${route}:${response.status}`)
    responses.set(route, response)
  }
  const operatorResponse = responses.get('/operator/')
  const operatorHtml = await operatorResponse.text()
  const jsPath = operatorHtml.match(/<script[^>]+src="([^"]+\.js)"/)?.[1]
  if (!jsPath) throw new Error('OPERATOR_APP_BUNDLE_MISSING')
  const jsHeaders = { 'User-Agent': 'survival-diary-batched-release-smoke' }
  const jsResponse = await fetchImpl(new URL(jsPath, SITE), { cache: 'no-store', headers: jsHeaders })
  if (!jsResponse.ok) throw new Error(`OPERATOR_APP_BUNDLE_UNAVAILABLE:${jsResponse.status}`)
  const clientBundles = [await jsResponse.text()]
  const lazyChunks = [...new Set([...clientBundles[0].matchAll(/[\x60"'](?:\.\/|\/assets\/)?([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{6,}\.js)[\x60"']/g)].map((match) => match[1]))]
  if (lazyChunks.length > 32) throw new Error('OPERATOR_LAZY_BUNDLE_COUNT_INVALID')
  for (const chunk of lazyChunks) {
    const chunkResponse = await fetchImpl(new URL(`/assets/${chunk}`, SITE), { cache: 'no-store', headers: jsHeaders })
    if (!chunkResponse.ok) throw new Error(`OPERATOR_LAZY_BUNDLE_UNAVAILABLE:${chunk}:${chunkResponse.status}`)
    clientBundles.push(await chunkResponse.text())
  }
  const smoke = validateOperatorSmoke({
    status: operatorResponse.status,
    csp: operatorResponse.headers.get('content-security-policy'),
    robots: operatorResponse.headers.get('x-robots-tag'),
    html: operatorHtml,
    bundle: clientBundles.join('\n'),
  })
  if (!smoke.ok) throw new Error(`OPERATOR_SMOKE_FAILED:${smoke.errors.join(',')}`)
  return { status: 'PRODUCTION_SMOKE_PASS', source_sha: sourceSha, release_sha: releaseSha, routes, operator: smoke }
}

async function main() {
  const args = process.argv.slice(2)
  const options = {}
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i], value = args[++i]
    if (!value || value.startsWith('--')) throw new Error(`MISSING_VALUE:${key}`)
    if (key === '--source-sha') options.sourceSha = value
    else if (key === '--release-sha') options.releaseSha = value
    else throw new Error(`UNKNOWN_ARGUMENT:${key}`)
  }
  console.log(JSON.stringify(await runProductionSmoke(options), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
