/** Atomic per-book local replacement, not a remote publish or a multi-book transaction. */
import { open, readFile, lstat, rename, unlink } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
const same = (a, b) => Buffer.from(a).equals(Buffer.from(b))

export async function replaceBookAtomically(file, expected, replacement, { beforeCommit } = {}) {
  if (!(await lstat(file)).isFile()) throw new Error('BOOK_NOT_REGULAR_FILE')
  const lockPath = `${file}.publication-lock`
  // Never remove somebody else's lock, including on EEXIST. Stale locks require review.
  const lock = await open(lockPath, 'wx', 0o600)
  const temporary = join(dirname(file), `.${basename(file)}.${randomUUID()}.tmp`)
  let created = false
  try {
    if (!same(await readFile(file), expected)) throw new Error('BOOK_CONCURRENT_CHANGE')
    if (same(expected, replacement)) return { status: 'NOOP', files_written: 0 }
    const output = await open(temporary, 'wx', 0o600)
    created = true
    try { await output.writeFile(replacement); await output.sync() } finally { await output.close() }
    // Test-only hook; production runner does not accept executable callbacks from JSON.
    if (beforeCommit) await beforeCommit()
    if (!(await lstat(file)).isFile() || !same(await readFile(file), expected)) throw new Error('BOOK_CONCURRENT_CHANGE')
    await rename(temporary, file)
    created = false
    return { status: 'UPDATED_LOCAL_BOOK', files_written: 1 }
  } finally {
    if (created) await unlink(temporary).catch(() => {})
    await lock.close()
    await unlink(lockPath)
  }
}
