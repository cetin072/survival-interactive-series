/** Validate the pinned public snapshot consumed by the website. No image or write. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateVisualCatalog } from './lib/visual-compiler.mjs'
import { validateSiteAssets } from './lib/site-asset-contract.mjs'

const file = resolve(import.meta.dirname, '../content/visuals/C03-AFTERFALL/VISUALS.json')
const catalog = JSON.parse(await readFile(file, 'utf8'))
validateVisualCatalog(catalog)
const assets = JSON.parse(await readFile(resolve(import.meta.dirname, '../content/visuals/C03-AFTERFALL/SITE_ASSETS.json'), 'utf8'))
const site = await validateSiteAssets(assets, catalog, resolve(import.meta.dirname, '../web/public'))
assert.equal(catalog.anchor.save_version, 253)
assert.equal(catalog.points.length, 34)
assert.equal(catalog.points.filter((point) => point.status === 'READY').length, 30)
assert.equal(catalog.points.filter((point) => point.status === 'WAITING_CANON').length, 4)
assert.equal(catalog.execution.enabled, false)
assert.equal(catalog.points.find((point) => point.subject_id === 'char-jinwoo')?.generation_key,
  'generation-a59f0391ed3fa13bcbcde8ea2123446837e6cc84ef5ab24f93d07f815170f7e8')
process.stdout.write(JSON.stringify({ status: 'PINNED_PUBLIC_VISUAL_CATALOG_VALID',
  briefs_ready: 30, briefs_waiting: 4, accepted_images: 0, site_assets: site.site_assets }) + '\n')
