/** Read a season inventory from one immutable Git commit, without checkout writes.
 * A Git pin proves bytes at that commit; it does not prove review or publication approval.
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const defaultRepoRoot = resolve(import.meta.dirname, '..', '..')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

export async function readPinnedInventory(path, commit, {
  repoRoot = defaultRepoRoot, gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git',
} = {}) {
  if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('INVALID_INVENTORY_COMMIT')
  }
  const rel = relative(resolve(repoRoot), resolve(path)).replaceAll('\\', '/')
  if (!/^archive\/content\/transcripts\/C03-AFTERFALL\/S\d{2,3}\/SEGMENT_INVENTORY\.json$/.test(rel)) {
    throw new Error('INVALID_PINNED_INVENTORY_PATH')
  }
  const options = { cwd: repoRoot, encoding: 'buffer', maxBuffer: 1_000_000,
    timeout: 10_000, windowsHide: true }
  const kind = await run(gitBinary, ['cat-file', '-t', commit], options)
  if (kind.stdout.toString('utf8').trim() !== 'commit') {
    throw new Error('INVENTORY_REVISION_NOT_COMMIT')
  }
  const result = await run(gitBinary, ['show', `${commit}:${rel}`], options)
  const bytes = result.stdout
  if (bytes.length > 1_000_000) throw new Error('INVALID_INVENTORY_FILE')
  return { inventory: JSON.parse(bytes.toString('utf8')),
    inventory_commit: commit, inventory_sha256: digest(bytes) }
}
