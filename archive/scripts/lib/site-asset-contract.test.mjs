import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deflateSync } from 'node:zlib'
import { visualDigest } from './visual-compiler.mjs'
import { validateSiteAssets } from './site-asset-contract.mjs'

// Generated test bytes only; no model image, real acceptance or publication.
function crc(bytes) { let c = 0xffffffff; for (const n of bytes) { c ^= n; for (let b = 0; b < 8; b++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0) }; return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc(body), out.length - 4); return out }
function png() { const head = Buffer.alloc(13); head.writeUInt32BE(1); head.writeUInt32BE(1, 4); head[8] = 8; head[9] = 2; return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', head), chunk('IDAT', deflateSync(Buffer.alloc(4))), chunk('IEND', Buffer.alloc(0))]) }
const catalog = JSON.parse(await readFile(new URL('../../content/visuals/C03-AFTERFALL/VISUALS.json', import.meta.url), 'utf8'))
const point = catalog.points.find((entry) => entry.subject_id === 'char-jinwoo')
function seal(body) { return { ...body, content_sha256: visualDigest(body) } }
function manifest(assets) { return seal({ version: 'archive-site-assets-v1', chronicle_id: catalog.chronicle_id,
  worldline_id: catalog.worldline_id, visibility: 'PUBLIC_ARCHIVE', visual_catalog_sha256: catalog.content_sha256, assets }) }
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'site-assets-'))
  try {
    await mkdir(join(root, 'visual-assets'))
    const bytes = png(), sha256 = createHash('sha256').update(bytes).digest('hex')
    await writeFile(join(root, 'visual-assets', `${sha256}.png`), bytes)
    const asset = { point_id: point.point_id, generation_key: point.generation_key, subject_id: point.subject_id,
      accepted_candidate_id: `candidate-${'a'.repeat(64)}`, source_sha256: 'b'.repeat(64),
      public_path: `/visual-assets/${sha256}.png`, sha256, bytes: bytes.length, width: 1, height: 1, mime_type: 'image/png' }
    await fn({ root, asset, bytes })
  } finally { await rm(root, { recursive: true, force: true }) }
}

test('empty committed manifest is valid but proves zero assets', async () => {
  const empty = JSON.parse(await readFile(new URL('../../content/visuals/C03-AFTERFALL/SITE_ASSETS.json', import.meta.url), 'utf8'))
  assert.equal((await validateSiteAssets(empty, catalog, join(tmpdir(), 'unused-public-root'))).site_assets, 0)
})
test('synthetic local PNG can satisfy the site-ready contract only by exact bytes and current point', async () => fixture(async ({ root, asset }) => {
  const result = await validateSiteAssets(manifest([asset]), catalog, root)
  assert.equal(result.site_assets, 1)
  assert.equal(result.site_publications, 0)
}))
test('stale generation, tampered pixels and path escape are refused', async () => fixture(async ({ root, asset }) => {
  await assert.rejects(validateSiteAssets(manifest([{ ...asset, generation_key: `generation-${'0'.repeat(64)}` }]), catalog, root))
  await assert.rejects(validateSiteAssets(manifest([{ ...asset, public_path: '/../private.png' }]), catalog, root))
  await writeFile(join(root, 'visual-assets', `${asset.sha256}.png`), Buffer.from('not an image'))
  await assert.rejects(validateSiteAssets(manifest([asset]), catalog, root))
}))
test('duplicate point and unsealed metadata are refused', async () => fixture(async ({ root, asset }) => {
  await assert.rejects(validateSiteAssets(manifest([asset, asset]), catalog, root))
  await assert.rejects(validateSiteAssets({ ...manifest([asset]), secret: 'unreviewed' }, catalog, root))
}))
