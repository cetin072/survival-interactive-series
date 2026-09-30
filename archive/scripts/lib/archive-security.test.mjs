import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const expectedOrigin = 'https://jgsxpdflgkqroecfjzxq.supabase.co'

test('Archive CSP permits only the exact Supabase operator origin', async () => {
  const text = await readFile(resolve(root, 'archive/web/netlify.toml'), 'utf8')
  const match = /Content-Security-Policy = "([^"]+)"/.exec(text)
  assert.ok(match, 'CSP header must exist')
  const csp = match[1]
  const connect = /(?:^|; )connect-src ([^;]+)/.exec(csp)
  assert.ok(connect, 'connect-src must be explicit')
  const tokens = connect[1].split(/\s+/)
  assert.ok(tokens.includes("'self'"))
  assert.ok(tokens.includes(expectedOrigin))
  assert.equal(tokens.includes('*'), false)
  assert.equal(tokens.includes('https:'), false)
  assert.equal(tokens.includes('wss:'), false)
  assert.equal(/service[_-]?role/i.test(csp), false)
})
