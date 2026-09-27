/** One candidate's resumable private handoff. No site publication or image generation. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { acceptForegroundLocalCandidate, planForegroundLocalIngest } from './lib/foreground-image-handoff.mjs'
import { uploadAndVerifyArchiveOriginal } from './lib/archive-storage-original.mjs'
import { insertPrivateVisualRegistry } from './lib/archive-visual-registry.mjs'

const root = resolve(import.meta.dirname, '../..')
const json = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'))

export async function runForegroundIngest(mode, environment = process.env) {
  if (!['--check', '--upload-only', '--register-private'].includes(mode))
    throw new Error('INGEST_MODE_REQUIRED')
  const [catalog, observation, approval, originalBytes] = await Promise.all([
    json('archive/content/visuals/C03-AFTERFALL/VISUALS.json'),
    json('docs/AUTOMATIC_ARCHIVE_STEP6_FOREGROUND_20260927.json'),
    json('archive/experiments/step6/char-jinwoo-20260927-owner-approval.json'),
    readFile(resolve(root, 'archive/experiments/step6/char-jinwoo-20260927-foreground.png')),
  ])
  const point = catalog.points.find((entry) => entry.point_id === observation.point_id)
  const candidate = acceptForegroundLocalCandidate(point, observation, originalBytes, approval)
  const plan = planForegroundLocalIngest(candidate, catalog, observation, originalBytes)
  if (mode === '--check') return { status: 'PRIVATE_INGEST_CHECK_ONLY',
    candidate_id: candidate.candidate_id, source_sha256: candidate.file.sha256,
    plan_id: plan.plan_id, storage_writes: 0, database_writes: 0, site_publications: 0 }
  const baseUrl = environment.ARCHIVE_SUPABASE_URL
  const serviceKey = environment.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY
  if (baseUrl !== 'https://jgsxpdflgkqroecfjzxq.supabase.co')
    throw new Error('STAGING_PROJECT_URL_REQUIRED')
  const storageResult = await uploadAndVerifyArchiveOriginal({ baseUrl, serviceKey,
    catalog, observation, approval, candidate, originalBytes })
  if (mode === '--upload-only' || !storageResult.storage_verified)
    return { status: storageResult.status, candidate_id: candidate.candidate_id,
      source_sha256: candidate.file.sha256, bucket: storageResult.bucket,
      object_path: storageResult.object_path, storage_verified: storageResult.storage_verified,
      registry_writes: 0, site_publications: 0 }
  const registryResult = await insertPrivateVisualRegistry({ baseUrl, serviceKey,
    catalog, observation, approval, candidate, originalBytes, storageResult })
  return { status: registryResult.status, candidate_id: candidate.candidate_id,
    source_sha256: candidate.file.sha256, bucket: storageResult.bucket,
    object_path: storageResult.object_path, storage_verified: true,
    asset_id: registryResult.asset_id, registry_writes: registryResult.database_writes,
    site_publications: 0 }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await runForegroundIngest(process.argv[2])
    process.stdout.write(JSON.stringify(result) + '\n')
  } catch (error) {
    // The public log never includes a service key, lease token, or private state.
    process.stderr.write(JSON.stringify({ status: 'INGEST_FAILED',
      code: /^[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'UNEXPECTED_ERROR' }) + '\n')
    process.exitCode = 1
  }
}
