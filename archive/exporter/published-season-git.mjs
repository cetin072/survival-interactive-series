/** Derive a pending inventory from public manifests at one immutable Git commit.
 * The commit pin identifies bytes, not owner approval for future publication.
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { inventoryFromPublishedSeason } from './published-season-inventory.mjs'

const run = promisify(execFile)
const defaultRepoRoot = resolve(import.meta.dirname, '..', '..')

export async function readPinnedPublishedSeason(seasonId, commit, {
  repoRoot = defaultRepoRoot, gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git',
} = {}) {
  if (!/^S\d{2,3}$/.test(seasonId)) throw new Error('INVALID_PUBLISHED_SEASON_ID')
  if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('INVALID_INVENTORY_COMMIT')
  }
  const options = { cwd: repoRoot, encoding: 'buffer', maxBuffer: 1_000_000,
    timeout: 10_000, windowsHide: true }
  const kind = await run(gitBinary, ['cat-file', '-t', commit], options)
  if (kind.stdout.toString('utf8').trim() !== 'commit') {
    throw new Error('INVENTORY_REVISION_NOT_COMMIT')
  }
  const prefix = `archive/content/transcripts/C03-AFTERFALL/${seasonId}/`
  const readJson = async (relative) => {
    const bytes = (await run(gitBinary, ['show', `${commit}:${prefix}${relative}`], options)).stdout
    if (bytes.length > 1_000_000) throw new Error('INVALID_PUBLISHED_MANIFEST')
    return JSON.parse(bytes.toString('utf8'))
  }
  const manifest = await readJson('MANIFEST.json')
  if (manifest.season_id !== seasonId) throw new Error('PUBLISHED_SEASON_MISMATCH')
  const inventory = await inventoryFromPublishedSeason(manifest, readJson)
  const hash = createHash('sha256').update(JSON.stringify(inventory)).digest('hex')
  return { inventory, inventory_commit: commit, inventory_sha256: hash }
}
