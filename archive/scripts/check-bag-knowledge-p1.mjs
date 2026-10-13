// Browser acceptance for the isolated, script-free P1 article.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_DIR ? resolve(process.env.PLAYWRIGHT_MODULE_DIR, 'playwright') : 'playwright');
const root = resolve(import.meta.dirname, '../web/dist');
const report = resolve(import.meta.dirname, '../reports/bag-knowledge-p1');
await mkdir(report, { recursive: true });
let server;
let base = process.env.BAG_P1_BASE_URL;
if (!base) {
  server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = resolve(root, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
    if (!target.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' })[extname(target)] || 'application/octet-stream');
      res.end(await readFile(target));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;
}
const path = '/knowledge/bag/waterproof-document-pouch/';
const results = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ko-KR' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(String(err)));
    // The Netlify drawer is tooling, not product content.
    const suffix = '?ntl-drawer-state=hidden';
    const response = await page.goto(base + path + suffix, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    if (process.env.BAG_P1_BASE_URL) assert.match(response.headers()['x-robots-tag'] || '', /noindex/);
    assert.equal(await page.locator('h1').textContent(), '방수 서류 파우치는 왜 생존가방에 필요할까?');
    assert.equal(await page.locator('main h2').count(), 7);
    assert.doesNotMatch(await page.locator('main').innerText(), /DRAFT|catalogId|guide-\d|reviewedAt|sourceReview|linkReview|Automation C|변경 이력|검수|돌아가기/);
    assert.equal(await page.locator('a[href*="bag-lab"],a[href*="guide-"],main script').count(), 0);
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex,nofollow/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(report, `${width}.png`), fullPage: true });
    // Isolated synthetic browser data survives link navigation and browser Back.
    await page.evaluate(async () => {
      localStorage.setItem('p1-synthetic-record', 'preserve');
      await new Promise((done, fail) => {
        const r = indexedDB.open('p1-synthetic-record', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('items');
        r.onerror = fail;
        r.onsuccess = () => { const db = r.result; const tx = db.transaction('items', 'readwrite'); tx.objectStore('items').put('preserve', 'item'); tx.oncomplete = () => { db.close(); done(); }; };
      });
    });
    await page.locator('main a[href="/knowledge/emergency-supplies-inventory/"]').click();
    await page.waitForLoadState('networkidle');
    assert.match(await page.locator('h1').innerText(), /비상/);
    await page.goBack({ waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => localStorage.getItem('p1-synthetic-record')), 'preserve');
    assert.equal(await page.evaluate(() => new Promise(done => {
      const r = indexedDB.open('p1-synthetic-record');
      r.onsuccess = () => { const db = r.result; const q = db.transaction('items').objectStore('items').get('item'); q.onsuccess = () => { db.close(); done(q.result); }; };
    })), 'preserve');
    assert.deepEqual(errors, []);
    results.push({ width, status: 'PASS', overflow: false, relatedLinkAndBack: true, syntheticStoragePreserved: true });
    await context.close();
  }
  console.log(JSON.stringify({ base, results }));
  await writeFile(resolve(report, 'browser.json'), JSON.stringify({ base, results }, null, 2));
} finally { await browser?.close(); server?.close(); }
