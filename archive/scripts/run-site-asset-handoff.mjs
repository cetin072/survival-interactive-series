/** Verify one accepted foreground image against Storage, registry and the site manifest.
 * This command performs reads only; the evidence mode is for an operator-held readback.
 */
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { acceptForegroundLocalCandidate } from './lib/foreground-image-handoff.mjs'
import { planArchiveVisualRegistry } from './lib/archive-visual-registry.mjs'
import { prepareForegroundSiteAsset } from './lib/site-foreground-handoff.mjs'
import { planSiteAssetAddition } from './lib/site-asset-contract.mjs'
import { commitSiteAssetFromPublicRef } from './lib/site-asset-public-ref.mjs'

const run = promisify(execFile)
const root = resolve(import.meta.dirname, '../..')
const paths = {
  catalog: 'archive/content/visuals/C03-AFTERFALL/VISUALS.json',
  observation: 'docs/AUTOMATIC_ARCHIVE_STEP6_FOREGROUND_20260927.json',
  approval: 'archive/experiments/step6/char-jinwoo-20260927-owner-approval.json',
  original: 'archive/experiments/step6/char-jinwoo-20260927-foreground.png',
  derivative: 'archive/experiments/step8/char-jinwoo-20260927-site-512.png',
  manifest: 'archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json',
  publicRoot: 'archive/web/public',
  transformer: 'archive/scripts/derive-site-original.py',
}
const demand = (ok, code) => { if (!ok) throw new Error(code) }
const json = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'))

async function prepareSiteAssetHandoff({ downloadOriginal, registry,
  deriveFromOriginal } = {}) {
  demand(typeof downloadOriginal === 'function' && typeof deriveFromOriginal === 'function',
    'SITE_HANDOFF_READERS_REQUIRED')
  const [catalog, observation, approval, originalBytes, derivativeBytes, manifest] = await Promise.all([
    json(paths.catalog), json(paths.observation), json(paths.approval),
    readFile(resolve(root, paths.original)), readFile(resolve(root, paths.derivative)),
    json(paths.manifest),
  ])
  const point = catalog.points.find((entry) => entry.point_id === observation.point_id)
  const candidate = acceptForegroundLocalCandidate(point, observation, originalBytes, approval)
  const prepared = await prepareForegroundSiteAsset({ catalog, observation, approval,
    originalBytes, candidate, derivativeBytes, deriveFromOriginal, downloadOriginal,
    registry })
  const plan = await planSiteAssetAddition(manifest, catalog,
    resolve(root, paths.publicRoot), prepared)
  const report = { status: plan.status, asset_id: prepared.asset.registry_asset_id,
    point_id: prepared.asset.point_id, generation_key: prepared.asset.generation_key,
    source_sha256: prepared.asset.source_sha256,
    derivative_sha256: prepared.asset.sha256,
    manifest_sha256: plan.manifest.content_sha256,
    site_asset_current: plan.status === 'EXISTING_SITE_ASSET_REUSED',
    remote_readback_proven: false, execution_code_uploads: 0, database_writes: 0,
    files_written: 0, site_publications: 0 }
  return { report, prepared, derivativeBytes }
}

export async function verifySiteAssetHandoff(options = {}) {
  return (await prepareSiteAssetHandoff(options)).report
}

async function pinnedDerivativeCheck(bytes, python) {
  // prepareForegroundSiteAsset already compares the downloaded bytes to this source.
  demand(Buffer.isBuffer(bytes), 'SITE_SOURCE_BYTES_REQUIRED')
  await run(python, [resolve(root, paths.transformer), resolve(root, paths.original),
    resolve(root, paths.derivative), '--check'], { cwd: root, timeout: 30000 })
  return readFile(resolve(root, paths.derivative))
}

async function readStagingSiteAsset({ baseUrl, serviceKey, fetchImpl = fetch,
  python = 'python', deriveFromOriginal = (bytes) => pinnedDerivativeCheck(bytes, python) } = {}) {
  demand(baseUrl === 'https://jgsxpdflgkqroecfjzxq.supabase.co'
    && typeof serviceKey === 'string' && serviceKey.length > 20,
  'STAGING_SITE_READ_CREDENTIALS_REQUIRED')
  const [catalog, observation, approval, originalBytes] = await Promise.all([
    json(paths.catalog), json(paths.observation), json(paths.approval),
    readFile(resolve(root, paths.original)),
  ])
  const point = catalog.points.find((entry) => entry.point_id === observation.point_id)
  const candidate = acceptForegroundLocalCandidate(point, observation, originalBytes, approval)
  const objectPath = `AFTERFALL/${candidate.candidate_id}/${candidate.file.sha256}.png`
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const response = await fetchImpl(`${baseUrl}/storage/v1/object/authenticated/survival-archive-originals/${objectPath}`,
    { method: 'GET', headers, cache: 'no-store' })
  demand(response.ok, 'SITE_STORAGE_READ_FAILED')
  const readback = Buffer.from(await response.arrayBuffer())
  demand(readback.equals(originalBytes), 'SITE_STORAGE_READBACK_MISMATCH')
  const planned = planArchiveVisualRegistry({ catalog, observation, approval,
    originalBytes, candidate, storageResult: { status: 'EXISTING_OBJECT_REUSED',
      storage_verified: true, bucket: 'survival-archive-originals',
      object_path: objectPath, sha256: candidate.file.sha256 } })
  const registryResponse = await fetchImpl(`${baseUrl}/rest/v1/visual_assets?select=*&worldline_id=eq.AFTERFALL&asset_id=eq.${encodeURIComponent(planned.row.asset_id)}`,
    { method: 'GET', headers: { ...headers, 'Accept-Profile': 'survival_rpg' },
      cache: 'no-store' })
  demand(registryResponse.ok, 'SITE_REGISTRY_READ_FAILED')
  const rows = await registryResponse.json()
  demand(Array.isArray(rows) && rows.length === 1, 'SITE_REGISTRY_ROW_REQUIRED')
  const prepared = await prepareSiteAssetHandoff({ registry: rows[0],
    downloadOriginal: async (bucket, path) => {
      demand(bucket === 'survival-archive-originals' && path === objectPath,
        'SITE_STORAGE_PATH_MISMATCH')
      return readback
    },
    deriveFromOriginal })
  return { ...prepared, report: { ...prepared.report, remote_readback_proven: true } }
}

export async function verifyStagingSiteAsset(options = {}) {
  return (await readStagingSiteAsset(options)).report
}

/** A trusted caller can connect the remote readback to an atomic local proposal. */
export async function proposeStagingSiteAsset({ repoRoot, ref, baseCommit,
  authorizeCommit, gitBinary, ...readOptions } = {}) {
  demand(typeof authorizeCommit === 'function', 'SITE_REF_COMMIT_DISABLED')
  const verified = await readStagingSiteAsset(readOptions)
  const proposal = await commitSiteAssetFromPublicRef({ repoRoot, ref, baseCommit,
    prepared: verified.prepared, derivativeBytes: verified.derivativeBytes,
    authorizeCommit, gitBinary })
  return { ...proposal, remote_readback_proven: true,
    source_sha256: verified.report.source_sha256,
    derivative_sha256: verified.report.derivative_sha256,
    execution_code_uploads: 0, database_writes: 0 }
}

export async function runSiteAssetHandoff(args, environment = process.env) {
  if (args.length === 1 && args[0] === '--verify-staging')
    return verifyStagingSiteAsset({ baseUrl: environment.ARCHIVE_SUPABASE_URL,
      serviceKey: environment.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY,
      python: environment.ARCHIVE_PYTHON ?? 'python' })
  if (args.length === 3 && args[0] === '--verify-evidence') {
    const [readback, registry] = await Promise.all([readFile(resolve(args[1])),
      readFile(resolve(args[2]), 'utf8').then(JSON.parse)])
    const report = await verifySiteAssetHandoff({ registry,
      downloadOriginal: async () => readback,
      deriveFromOriginal: (bytes) => pinnedDerivativeCheck(bytes,
        environment.ARCHIVE_PYTHON ?? 'python') })
    return { ...report, evidence_source: 'OPERATOR_HELD_LOCAL_READBACK' }
  }
  throw new Error('SITE_HANDOFF_MODE_REQUIRED')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(JSON.stringify(await runSiteAssetHandoff(process.argv.slice(2))) + '\n') }
  catch (error) {
    process.stderr.write(JSON.stringify({ status: 'SITE_HANDOFF_REJECTED',
      code: /^[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'UNEXPECTED_ERROR',
      remote_uploads: 0, database_writes: 0, site_publications: 0 }) + '\n')
    process.exitCode = 1
  }
}
