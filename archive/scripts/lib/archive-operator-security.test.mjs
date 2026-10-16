import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runProductionSmoke, validateOperatorSmoke } from '../archive-production-smoke.mjs'

const root = resolve(import.meta.dirname, '../../..')
const netlifyConfig = await readFile(resolve(root, 'archive/web/netlify.toml'), 'utf8')
const operatorSource = await Promise.all(['OperatorConsole.tsx', 'supabaseClient.ts'].map((name) => readFile(resolve(root, 'archive/web/src/archive', name), 'utf8')))
const csp = netlifyConfig.match(/Content-Security-Policy\s*=\s*"([^"]+)"/)?.[1]

test('Archive CSP allows only the configured Supabase origin for browser connections', () => {
  assert.ok(csp, 'CSP header exists')
  const connect = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('connect-src '))
  assert.equal(connect, "connect-src 'self' https://jgsxpdflgkqroecfjzxq.supabase.co")
  const sources = connect.split(/\s+/).slice(1)
  assert.equal(sources.some((source) => source === '*' || source === 'https:' || source === 'wss:' || source.includes('*')), false)
  assert.equal(csp.includes('service_role'), false)
  assert.ok(operatorSource.every((source) => !/service_role|serviceRole|SERVICE_ROLE/.test(source)), 'service role credential markers stay out of client source')
  for (const defense of ["default-src 'self'", "img-src 'self' data:", "style-src 'self' 'unsafe-inline'", "script-src 'self'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'none'"]) {
    assert.ok(csp.includes(defense), `retains ${defense}`)
  }
})

test('Operator route stays noindex and CSP remains globally applied', () => {
  assert.match(netlifyConfig, /for\s*=\s*"\/\*"[\s\S]*?Content-Security-Policy/)
  assert.match(netlifyConfig, /for\s*=\s*"\/operator\*"[\s\S]*?X-Robots-Tag\s*=\s*"noindex, nofollow, noarchive"/)
})

test('production Operator smoke rejects a missing project config or broad connection policy', () => {
  const html = '<script type="module" src="/assets/index-1234.js"></script>'
  const exact = validateOperatorSmoke({ status: 200, csp: "default-src 'self'; connect-src 'self' https://jgsxpdflgkqroecfjzxq.supabase.co", robots: 'noindex, nofollow', html, bundle: 'https://jgsxpdflgkqroecfjzxq.supabase.co' })
  assert.equal(exact.ok, true)
  const broad = validateOperatorSmoke({ status: 200, csp: "default-src 'self'; connect-src *", robots: 'noindex', html, bundle: 'https://jgsxpdflgkqroecfjzxq.supabase.co' })
  assert.equal(broad.ok, false)
  assert.ok(broad.errors.includes('CSP_SUPABASE_ORIGIN_INVALID'))
})

test('batched Production smoke checks the Hub, three Chronicle routes, Knowledge, Operator and exact release identity', async () => {
  const sourceSha = 'a'.repeat(40)
  const releaseSha = 'b'.repeat(40)
  const seen = []
  const fetchImpl = async (input) => {
    const url = new URL(input)
    seen.push(url.pathname + url.search.replace(/[?&]archive-smoke=[^&]+/, ''))
    if (url.pathname === '/deploy-meta.json') return Response.json({ version: 1, provider: 'netlify', context: 'production', commit_ref: releaseSha })
    if (url.pathname === '/release/production.json') return Response.json({ version: 'production-release-v1', site: 'survival-diary-archive', source_main_sha: sourceSha, released_on_kst: '2026-09-30', interval_days: 2, release_attempt: 2, policy: 'BATCHED_PRODUCTION' })
    if (url.pathname === '/operator/') return new Response('<script type="module" src="/assets/index-12345678.js"></script>', { status: 200, headers: { 'content-security-policy': "default-src 'self'; connect-src 'self' https://jgsxpdflgkqroecfjzxq.supabase.co", 'x-robots-tag': 'noindex, nofollow, noarchive' } })
    if (url.pathname === '/assets/index-12345678.js') return new Response('import(`./OperatorConsole-12345678.js`)')
    if (url.pathname === '/assets/OperatorConsole-12345678.js') return new Response('const SUPABASE_URL="https://jgsxpdflgkqroecfjzxq.supabase.co"')
    return new Response('<!doctype html>', { status: 200 })
  }

  const result = await runProductionSmoke({ sourceSha, releaseSha, fetchImpl })
  assert.equal(result.status, 'PRODUCTION_SMOKE_PASS')
  assert.equal(result.release_sha, releaseSha)
  assert.deepEqual(result.routes, [
    '/',
    '/?view=chronicle&chronicle=C01-HAN-JUNHO',
    '/?view=chronicle&chronicle=C02-STRONGHOLD',
    '/?view=chronicle&chronicle=C03-AFTERFALL',
    '/knowledge/',
    '/operator/',
  ])
  assert.ok(seen.includes('/deploy-meta.json'))
  assert.ok(seen.includes('/release/production.json'))
})
