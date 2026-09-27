/** Read one frozen capture range through a restricted PostgreSQL session.
 * No public approval, file write, database mutation or scheduling authority.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { admitLinkedCaptureExport } from './linked-capture-admission.mjs'

const queryFile = resolve(import.meta.dirname, '..', 'sql', 'afterfall-linked-capture-export.sql')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const demand = (ok, code) => { if (!ok) throw new Error(code) }

export function validateExportRange({ sessionId, startOrder, endOrder }) {
  demand(typeof sessionId === 'string' && uuid.test(sessionId), 'INVALID_EXPORT_SESSION_ID')
  demand(Number.isSafeInteger(startOrder) && startOrder >= 0 && startOrder % 2 === 0
    && Number.isSafeInteger(endOrder) && endOrder >= startOrder && endOrder % 2 === 1
    && endOrder - startOrder + 1 <= 10000, 'INVALID_EXPORT_RANGE')
}

/** `client` follows the node-postgres Client query interface and is caller-owned. */
export async function readLinkedRange(client, { sessionId, startOrder, endOrder }) {
  validateExportRange({ sessionId, startOrder, endOrder })
  let begun = false
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    begun = true
    await client.query("SET LOCAL statement_timeout = '10s'")
    const identity = await client.query(`select current_user::text as role_name,
      session_user::text as session_role,
      current_setting('transaction_read_only')::text as read_only,
      r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, r.rolreplication,
      r.rolinherit,
      exists (select 1 from pg_auth_members as am where am.member = r.oid) as has_role_membership,
      pg_has_role(current_user, 'service_role', 'member') as service_member,
      pg_has_role(current_user, 'postgres', 'member') as postgres_member,
      has_table_privilege(current_user, 'survival_rpg.transcript_messages', 'INSERT') as can_insert,
      has_table_privilege(current_user, 'survival_rpg.transcript_messages', 'UPDATE') as can_update,
      has_table_privilege(current_user, 'survival_rpg.transcript_messages', 'DELETE') as can_delete,
      has_table_privilege(current_user, 'survival_rpg.transcript_sessions', 'INSERT') as can_insert_session,
      has_table_privilege(current_user, 'survival_rpg.transcript_sessions', 'UPDATE') as can_update_session,
      has_table_privilege(current_user, 'survival_rpg.transcript_sessions', 'DELETE') as can_delete_session,
      has_table_privilege(current_user, 'survival_rpg.transcript_turn_state_links', 'INSERT') as can_insert_link,
      has_table_privilege(current_user, 'survival_rpg.transcript_turn_state_links', 'UPDATE') as can_update_link,
      has_table_privilege(current_user, 'survival_rpg.transcript_turn_state_links', 'DELETE') as can_delete_link,
      has_table_privilege(current_user, 'survival_rpg.saves', 'UPDATE') as can_update_save
    from pg_roles as r where r.rolname = current_user`)
    const role = identity.rows?.[0]
    demand(identity.rows?.length === 1 && role.role_name === 'archive_exporter'
      && role.session_role === 'archive_exporter' && role.read_only === 'on'
      && role.rolsuper === false && role.rolbypassrls === false
      && role.rolcreaterole === false && role.rolcreatedb === false
      && role.rolreplication === false && role.rolinherit === false
      && role.has_role_membership === false
      && role.service_member === false && role.postgres_member === false
      && role.can_insert === false && role.can_update === false && role.can_delete === false
      && role.can_insert_session === false && role.can_update_session === false
      && role.can_delete_session === false && role.can_insert_link === false
      && role.can_update_link === false && role.can_delete_link === false
      && role.can_update_save === false,
    'RESTRICTED_EXPORT_ROLE_REQUIRED')
    const sql = await readFile(queryFile, 'utf8')
    const result = await client.query({ text: sql, values: [sessionId, startOrder, endOrder] })
    demand(result.rows?.length === 1 && result.rows[0]?.linked_capture_export,
      'LINKED_EXPORT_QUERY_EMPTY')
    const prepared = admitLinkedCaptureExport(result.rows[0].linked_capture_export)
    await client.query('COMMIT')
    begun = false
    return { ...prepared, report: { ...prepared.report,
      exporter_authenticated: true, transaction_snapshot_verified: true,
      database_writes: 0, site_publications: 0, publication_allowed: false } }
  } catch (error) {
    if (begun) await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}
