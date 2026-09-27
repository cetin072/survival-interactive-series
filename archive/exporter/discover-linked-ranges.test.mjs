import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runDiscoveryCli } from './discover-linked-ranges.mjs'

const connectionString = 'postgresql://archive_exporter:fixture-only@db.example.supabase.co:5432/postgres'
const role = { role_name: 'archive_exporter', session_role: 'archive_exporter',
  read_only: 'on', rolsuper: false, rolbypassrls: false,
  rolcreaterole: false, rolcreatedb: false, rolreplication: false,
  rolinherit: false, has_role_membership: false, service_member: false,
  postgres_member: false, can_insert: false, can_update: false,
  can_delete: false, can_insert_session: false, can_update_session: false,
  can_delete_session: false, can_insert_link: false,
  can_update_link: false, can_delete_link: false, can_update_save: false }

test('private discovery CLI returns bounded no-op without content or writes', async () => {
  const calls = []
  class Client {
    constructor(options) { assert.equal(options.ssl.rejectUnauthorized, true) }
    async connect() { calls.push('connect') }
    async query(sql) {
      calls.push(sql)
      if (sql.includes('select current_user::text')) return { rows: [role] }
      return { rows: [] }
    }
    async end() { calls.push('end') }
  }
  const output = await runDiscoveryCli(['--check'], { connectionString, ClientClass: Client })
  const result = JSON.parse(output)
  assert.equal(result.status, 'NO_LINKED_RANGES')
  assert.equal(result.exporter_authenticated, true)
  assert.equal(result.range_count, 0)
  assert.equal(result.message_bodies_read + result.database_writes, 0)
  assert.equal(result.publication_allowed, false)
  assert.equal(output.includes('fixture-only'), false)
  assert.equal(calls.at(-1), 'end')
})

test('discovery CLI refuses broad credentials and write mode before connecting', async () => {
  class MustNotConnect { constructor() { throw new Error('CONNECTED') } }
  await assert.rejects(runDiscoveryCli(['--check'], { connectionString:
    'postgresql://service_role:secret@db.example.supabase.co/postgres',
  ClientClass: MustNotConnect }), /DEDICATED_EXPORT_DATABASE_URL_REQUIRED/)
  await assert.rejects(runDiscoveryCli(['--apply'], { connectionString,
    ClientClass: MustNotConnect }), /EXPLICIT_READ_ONLY_MODE_REQUIRED/)
})
