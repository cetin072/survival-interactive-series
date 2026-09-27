import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { readLinkedRange } from './linked-export-runner.mjs'
import { runLinkedExportCli } from '../../exporter/check-linked-export.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const uuid = (tail) => `00000000-0000-4000-8000-${String(tail).padStart(12, '0')}`
const sessionId = uuid(1)
function exportFixture() {
  const contents = ['SYNTHETIC_USER', '## 2099년 1월 1일 10:00\n\nSYNTHETIC_GM']
  const messages = contents.map((content, index) => ({ id: uuid(101 + index),
    idempotency_key: uuid(201 + index), turn_no: 1, message_order: index,
    role: index ? 'GM' : 'USER', content, content_sha256: hash(content),
    save_version: 253, public_safe: true, source_type: 'LIVE',
    game_time: index ? '2099-01-01 10:00' : '2099-01-01 09:59' }))
  return { version: 'afterfall-linked-export-v1',
    session: { id: sessionId, worldline_id: 'AFTERFALL', chronicle_id: 'C03',
      season_id: 'S03', status: 'OPEN', last_message_order: 3 },
    range: { start_order: 0, end_order: 1 }, messages,
    links: [{ turn_no: 1, user_message_id: messages[0].id, gm_message_id: messages[1].id,
      outcome: 'NO_STATE_CHANGE', user_save_version: 253, gm_save_version: 253,
      linked_save_version: 253 }] }
}
const role = () => ({ role_name: 'archive_exporter', session_role: 'archive_exporter',
  read_only: 'on', rolsuper: false, rolbypassrls: false, rolcreaterole: false,
  rolcreatedb: false, rolreplication: false, rolinherit: false,
  has_role_membership: false, service_member: false,
  postgres_member: false, can_insert: false, can_update: false,
  can_delete: false, can_insert_session: false, can_update_session: false,
  can_delete_session: false, can_insert_link: false, can_update_link: false,
  can_delete_link: false, can_update_save: false })

class FakeClient {
  constructor(options = {}, identity = role(), exported = exportFixture()) {
    this.options = options; this.identity = identity; this.exported = exported; this.calls = []
    FakeClient.last = this
  }
  async connect() { this.connected = true }
  async end() { this.ended = true }
  async query(command) {
    this.calls.push(command)
    if (typeof command === 'object') return { rows: [{ linked_capture_export: this.exported }] }
    if (command.startsWith('select current_user')) return { rows: [this.identity] }
    return { rows: [] }
  }
}

test('restricted read-only session checks role before parameterized export and commits once', async () => {
  const client = new FakeClient()
  const result = await readLinkedRange(client, { sessionId, startOrder: 0, endOrder: 1 })
  assert.equal(result.report.exporter_authenticated, true)
  assert.equal(result.report.transaction_snapshot_verified, true)
  assert.equal(result.candidate.publication_allowed, false)
  assert.equal(result.report.database_writes, 0)
  assert.equal(client.calls[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.deepEqual(client.calls[3].values, [sessionId, 0, 1])
  assert.match(client.calls[3].text, /m\.public_safe is true/)
  assert.equal(client.calls.at(-1), 'COMMIT')
})
test('broad role, writable transaction and unlinked payload roll back without export success', async () => {
  const invalid = new FakeClient()
  await assert.rejects(readLinkedRange(invalid, { sessionId, startOrder: 1, endOrder: 2 }),
    /INVALID_EXPORT_RANGE/)
  assert.deepEqual(invalid.calls, [])
  for (const changed of [{ role_name: 'service_role' }, { read_only: 'off' },
    { can_insert: true }, { can_update_save: true }, { service_member: true },
    { rolbypassrls: true }, { rolinherit: true }, { has_role_membership: true }]) {
    const client = new FakeClient({}, { ...role(), ...changed })
    await assert.rejects(readLinkedRange(client, { sessionId, startOrder: 0, endOrder: 1 }),
      /RESTRICTED_EXPORT_ROLE_REQUIRED/)
    assert.equal(client.calls.at(-1), 'ROLLBACK')
    assert.equal(client.calls.some((call) => typeof call === 'object'), false)
  }
  const exported = exportFixture(); exported.links = []
  const client = new FakeClient({}, role(), exported)
  await assert.rejects(readLinkedRange(client, { sessionId, startOrder: 0, endOrder: 1 }))
  assert.equal(client.calls.at(-1), 'ROLLBACK')
})
test('CLI prints only bounded metadata and rejects broad or insecure connection strings', async () => {
  const args = ['--session', sessionId, '--start', '0', '--end', '1', '--check']
  const url = 'postgresql://archive_exporter:secret@db.example.supabase.co:5432/postgres'
  const output = await runLinkedExportCli(args, { connectionString: url, ClientClass: FakeClient })
  const value = JSON.parse(output)
  assert.equal(value.publication_allowed, false)
  assert.ok(!output.includes('SYNTHETIC_GM'))
  assert.ok(!output.includes('secret'))
  assert.equal(FakeClient.last.connected, true)
  assert.equal(FakeClient.last.ended, true)
  assert.equal(FakeClient.last.options.ssl.rejectUnauthorized, true)
  for (const bad of [
    'postgresql://service_role:secret@db.example.supabase.co/postgres',
    `${url}?sslmode=disable`,
    'postgresql://archive_exporter:secret@localhost/postgres',
  ]) await assert.rejects(runLinkedExportCli(args, { connectionString: bad, ClientClass: FakeClient }))
})
test('opt-in inventory check links restricted read to a pending proposal without writing text', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'archive-pending-inventory-'))
  const path = join(directory, 'inventory.json')
  const inventory = { version: 'pending-segment-inventory-v1',
    chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S03',
    segments: [], reserved_session_ids: ['SESSION_009'] }
  const args = ['--session', sessionId, '--start', '0', '--end', '1', '--check', '--inventory', path]
  const connectionString = 'postgresql://archive_exporter:secret@db.example.supabase.co:5432/postgres'
  try {
    await writeFile(path, JSON.stringify(inventory))
    const output = await runLinkedExportCli(args, { connectionString, ClientClass: FakeClient })
    const value = JSON.parse(output)
    assert.equal(value.mode, 'READ_ONLY_UNAPPROVED_SEGMENT_PLAN')
    assert.equal(value.status, 'PENDING_PUBLIC_APPROVAL')
    assert.equal(value.session_id, 'SESSION_010')
    assert.equal(value.inventory_authenticated, false)
    assert.equal(value.inventory_git_pinned, false)
    assert.equal(value.publication_allowed, false)
    assert.equal(value.files_written, 0)
    assert.ok(!output.includes('SYNTHETIC_GM'))
    assert.ok(!output.includes('secret'))
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), inventory)
    assert.equal(FakeClient.last.calls.at(-1), 'COMMIT')
    assert.equal(FakeClient.last.ended, true)
    const commit = 'a'.repeat(40)
    const pinned = JSON.parse(await runLinkedExportCli(
      [...args, '--inventory-commit', commit], {
        connectionString, ClientClass: FakeClient,
        readPinned: async () => ({ inventory, inventory_commit: commit,
          inventory_sha256: hash(JSON.stringify(inventory)) }),
      }))
    assert.equal(pinned.inventory_git_pinned, true)
    assert.equal(pinned.inventory_authenticated, false)
    assert.equal(pinned.inventory_commit, commit)
    assert.equal(pinned.publication_allowed, false)
    const fromPublished = JSON.parse(await runLinkedExportCli(
      [...args.slice(0, 7), '--published-season', 'S03', '--inventory-commit', commit], {
        connectionString, ClientClass: FakeClient,
        readPublished: async (season, revision) => {
          assert.equal(season, 'S03'); assert.equal(revision, commit)
          return { inventory, inventory_commit: commit,
            inventory_sha256: hash(JSON.stringify(inventory)) }
        },
      }))
    assert.equal(fromPublished.inventory_source, 'PUBLISHED_SEASON_MANIFESTS')
    assert.equal(fromPublished.inventory_git_pinned, true)
    assert.equal(fromPublished.inventory_authenticated, false)
    assert.equal(fromPublished.publication_allowed, false)
    await assert.rejects(runLinkedExportCli(
      [...args.slice(0, 7), '--published-season', 'S03', '--inventory-commit', commit], {
        connectionString, ClientClass: FakeClient,
        readPublished: async () => ({ inventory: { ...inventory, season_id: 'S02' },
          inventory_commit: commit, inventory_sha256: hash('other') }),
      }), /PUBLISHED_SEASON_MISMATCH/)
    await assert.rejects(runLinkedExportCli([...args, '--inventory-commit', 'bad'],
      { connectionString, ClientClass: FakeClient }), /INVALID_INVENTORY_COMMIT/)
    await assert.rejects(runLinkedExportCli([...args.slice(0, -1), 'relative.json'],
      { connectionString, ClientClass: FakeClient }), /ABSOLUTE_INVENTORY_PATH_REQUIRED/)
    const priorClient = FakeClient.last
    await writeFile(path, JSON.stringify({ ...inventory, unexpected: 'PRIVATE' }))
    await assert.rejects(runLinkedExportCli(args, { connectionString, ClientClass: FakeClient }),
      /INVALID_INVENTORY_ENVELOPE/)
    assert.equal(FakeClient.last, priorClient)
    await writeFile(path, JSON.stringify({ ...inventory, season_id: 'S02' }))
    await assert.rejects(runLinkedExportCli(args, { connectionString, ClientClass: FakeClient }),
      /INVENTORY_SEASON_MISMATCH/)
  } finally {
    await unlink(path)
    await rmdir(directory)
  }
})
