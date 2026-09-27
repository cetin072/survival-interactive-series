/** Validate the pinned public snapshot consumed by the website. No image or write. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateVisualCatalog } from './lib/visual-compiler.mjs'
import { validateSiteAssetInventory, reconcileSiteAssets } from './lib/site-asset-contract.mjs'

const file = resolve(import.meta.dirname, '../content/visuals/C03-AFTERFALL/VISUALS.json')
const catalog = JSON.parse(await readFile(file, 'utf8'))
validateVisualCatalog(catalog)
const assets = JSON.parse(await readFile(resolve(import.meta.dirname, '../content/visuals/C03-AFTERFALL/SITE_ASSETS.json'), 'utf8'))
const publicRoot = resolve(import.meta.dirname, '../web/public')
const site = await validateSiteAssetInventory(assets, catalog, publicRoot)
const currentReconciliation = await reconcileSiteAssets(assets, catalog, catalog, publicRoot)
assert.deepEqual(currentReconciliation.manifest, assets)
assert.equal(currentReconciliation.files_written, 0)
assert.equal(catalog.execution.enabled, false)
const briefsReady = catalog.points.filter((point) => point.status === 'READY').length
const briefsWaiting = catalog.points.filter((point) => point.status === 'WAITING_CANON').length
process.stdout.write(JSON.stringify({ status: 'PINNED_PUBLIC_VISUAL_CATALOG_VALID',
  source_save_version: catalog.anchor.save_version, briefs_ready: briefsReady,
  briefs_waiting: briefsWaiting, accepted_images: site.site_assets, site_assets: site.site_assets,
  reconciliation_retained: currentReconciliation.retained, reconciliation_writes: 0 }) + '\n')
