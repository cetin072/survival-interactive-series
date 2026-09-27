import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
