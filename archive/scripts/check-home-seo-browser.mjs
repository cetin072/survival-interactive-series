import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { createRequire } from 'node:module'

// Browser tooling is a verification dependency, never shipped with the app.
const require = createRequire(process.env.PLAYWRIGHT_MODULE_ROOT ? resolve(process.env.PLAYWRIGHT_MODULE_ROOT, 'package.json') : import.meta.url)
const { chromium } = require('playwright')
const dist = resolve(import.meta.dirname, '../web/dist')
let server
let base = process.argv.find(arg => arg.startsWith('--url='))?.slice(6)
if (!base) {
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const client = url.pathname.startsWith('/operator') || (['/', '/index.html'].includes(url.pathname) && url.searchParams.has('view'))
    const path = client ? '/client.html' : url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname
    try {
      const bytes = await readFile(resolve(dist, '.' + path))
      res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.xml': 'application/xml' })[extname(path)] ?? 'application/octet-stream')
      if (client) res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
      res.end(bytes)
    } catch { res.writeHead(404).end() }
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
}
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {})
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 700, hasTouch: width < 700 })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', e => { if (e.type() === 'error' && !e.text().startsWith('Failed to load resource:')) errors.push(e.text()) })
    page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).pathname !== '/favicon.ico') errors.push(`${response.status()} ${response.url()}`) })
    const response = await page.goto(base + '/')
    const source = await response.text()
    assert.ok(source.includes('일상과 비상상황에 필요한 생존 지식'))
    await page.locator('.wiki-home-intro h1').waitFor()
    await page.waitForTimeout(500)
    assert.equal(await page.locator('h1').count(), 1)
    assert.equal(await page.locator('[rel="canonical"]').getAttribute('href'), 'https://survival-diary-archive.netlify.app/')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    await page.getByRole('link', { name: /아파트 정전 범위 확인/ }).first().click()
    await page.locator('h1').waitFor()
    assert.ok(page.url().includes('/knowledge/apartment-power-outage-scope-check/'))
    for (const query of ['?view=story&chronicle=C01-HAN-JUNHO', '?view=wiki-preview&page=worlds']) {
      const routeResponse = await page.goto(base + '/' + query)
      const routeHtml = await routeResponse.text()
      assert.ok(!routeHtml.includes('data-prerendered-home'))
      assert.ok(!routeHtml.includes('rel="canonical"'))
      await page.locator('h1').first().waitFor()
      assert.equal(await page.locator('[rel="canonical"]').count(), 0)
      assert.equal(await page.locator('.wiki-home-intro h1').filter({ hasText: '일상과 비상상황' }).count(), 0)
      assert.ok(await page.evaluate(() => getComputedStyle(document.getElementById('root')).visibility === 'visible'))
    }
    await page.goto(base + '/operator/')
    await page.locator('.operator-page h1').waitFor()
    assert.match(await page.locator('.operator-page h1').textContent(), /운영자 로그인|운영자 설정 필요/)
    assert.equal(await page.locator('[rel="canonical"]').count(), 0)
    assert.ok(await page.locator('meta[name="robots"]').getAttribute('content').then(x => x.includes('noindex')))
    assert.deepEqual(errors, [])
    await context.close()
    console.log(JSON.stringify({ status: 'PASS', width, homeHydration: true, readerWikiOperator: true }))
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } })
  const page = await noJs.newPage()
  await page.goto(base + '/')
  assert.equal(await page.locator('h1').count(), 1)
  for (const slug of ['apartment-power-outage-scope-check', 'emergency-supplies-inventory', 'family-emergency-contact-plan']) assert.ok(await page.locator(`a[href="/knowledge/${slug}/"]`).count() > 0)
  await page.locator('a[href="/knowledge/emergency-supplies-inventory/"]').first().click()
  assert.ok((await page.locator('h1').textContent()).includes('비상용품'))
  await noJs.close()
  console.log(JSON.stringify({ status: 'PASS', javaScriptDisabled: true, base }))
} finally { await browser.close(); server?.close() }
