import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { readPinnedInventory } from './pinned-inventory.mjs'

const run = promisify(execFile)
const gitBinary = process.env.TEST_GIT_BINARY || 'git'
const git = (root, ...args) => run(gitBinary, ['-C', root, ...args], { windowsHide: true })

test('pinned inventory reads committed bytes rather than a changed working file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archive-git-inventory-'))
  const rel = 'archive/content/transcripts/C03-AFTERFALL/S03/SEGMENT_INVENTORY.json'
  const path = join(root, ...rel.split('/'))
  try {
    await mkdir(resolve(path, '..'), { recursive: true })
    const inventory = { version: 'pending-segment-inventory-v1',
      chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S03',
      segments: [], reserved_session_ids: [] }
    await writeFile(path, JSON.stringify(inventory))
    await git(root, 'init', '-q')
    await git(root, 'config', 'user.name', 'Archive Test')
    await git(root, 'config', 'user.email', 'archive-test@example.invalid')
    await git(root, 'add', '--', rel)
    await git(root, 'commit', '-qm', 'synthetic inventory fixture')
    const commit = (await git(root, 'rev-parse', 'HEAD')).stdout.trim()
    await writeFile(path, JSON.stringify({ ...inventory, reserved_session_ids: ['SESSION_999'] }))
    const pinned = await readPinnedInventory(path, commit, { repoRoot: root, gitBinary })
    assert.deepEqual(pinned.inventory, inventory)
    assert.equal(pinned.inventory_commit, commit)
    assert.match(pinned.inventory_sha256, /^[a-f0-9]{64}$/)
    assert.notDeepEqual(JSON.parse(await readFile(path, 'utf8')), pinned.inventory)
    await assert.rejects(readPinnedInventory(path, '0'.repeat(40),
      { repoRoot: root, gitBinary }))
    await assert.rejects(readPinnedInventory(join(root, 'other.json'), commit,
      { repoRoot: root, gitBinary }), /INVALID_PINNED_INVENTORY_PATH/)
  } finally {
    const target = resolve(root), temp = resolve(tmpdir()) + sep
    assert.ok(target.startsWith(temp), 'temporary Git fixture must stay inside OS temp')
    await rm(target, { recursive: true, force: true })
  }
})
