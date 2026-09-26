/** Cooperative single-file local graph transaction, including first creation. */
import { open, readFile, lstat, mkdir, rename, link, unlink } from 'node:fs/promises'
import { dirname, basename, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const same = (a, b) => a === null || b === null ? a === b : Buffer.from(a).equals(Buffer.from(b))
async function current(file) {
  try { if (!(await lstat(file)).isFile()) throw new Error('GRAPH_NOT_REGULAR_FILE'); return await readFile(file) }
  catch (e) { if (e.code === 'ENOENT') return null; throw e }
}
async function safeDirectory(path) {
  const absolute = resolve(path), parent = dirname(absolute)
  if (parent !== absolute) await safeDirectory(parent)
  try { if (!(await lstat(absolute)).isDirectory()) throw new Error('GRAPH_PARENT_NOT_DIRECTORY') }
  catch (e) { if (e.code !== 'ENOENT') throw e; await mkdir(absolute).catch((error) => { if (error.code !== 'EEXIST') throw error }); if (!(await lstat(absolute)).isDirectory()) throw new Error('GRAPH_PARENT_NOT_DIRECTORY') }
}
export async function writeGraphAtomically(file, expected, replacement, { beforeCommit } = {}) {
  await safeDirectory(dirname(file))
  const lockPath = `${file}.publication-lock`, temporary = join(dirname(file), `.${basename(file)}.${randomUUID()}.tmp`)
  const lock = await open(lockPath, 'wx', 0o600)
  let created = false
  try {
    if (!same(await current(file), expected)) throw new Error('GRAPH_CONCURRENT_CHANGE')
    if (same(expected, replacement)) return { status: 'NOOP', files_written: 0 }
    const output = await open(temporary, 'wx', 0o644); created = true
    try { await output.writeFile(replacement); await output.sync() } finally { await output.close() }
    if (beforeCommit) await beforeCommit()
    if (!same(await current(file), expected)) throw new Error('GRAPH_CONCURRENT_CHANGE')
    if (expected === null) { await link(temporary, file); await unlink(temporary) } // EEXIST never overwrites a concurrent creation.
    else await rename(temporary, file)
    created = false
    return { status: 'UPDATED_LOCAL_GRAPH', files_written: 1 }
  } finally {
    if (created) await unlink(temporary).catch(() => {})
    await lock.close(); await unlink(lockPath)
  }
}
