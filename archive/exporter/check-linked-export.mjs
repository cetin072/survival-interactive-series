/** Opt-in, read-only linked capture check. Never prints transcript bodies. */
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readLinkedRange, validateExportRange } from '../scripts/lib/linked-export-runner.mjs'
import { planPendingSegment } from '../scripts/lib/pending-segment-inventory.mjs'

function inputs(args, connectionString) {
  if (![7, 9].includes(args.length) || args[0] !== '--session' || args[2] !== '--start'
    || args[4] !== '--end' || args[6] !== '--check') throw new Error('EXPLICIT_READ_ONLY_MODE_REQUIRED')
  const inventoryPath = args.length === 9 && args[7] === '--inventory' ? args[8] : null
  if (args.length === 9 && (!inventoryPath || !isAbsolute(inventoryPath))) {
    throw new Error('ABSOLUTE_INVENTORY_PATH_REQUIRED')
  }
  if (!connectionString) throw new Error('EXPORT_CREDENTIAL_NOT_CONFIGURED')
  const url = new URL(connectionString)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !/^archive_exporter(?:\.[a-z0-9]+)?$/.test(decodeURIComponent(url.username))
    || !/\.supabase\.co$|\.pooler\.supabase\.com$/.test(url.hostname)
    || ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some((key) => url.searchParams.has(key))) {
    throw new Error('DEDICATED_EXPORT_DATABASE_URL_REQUIRED')
  }
  const range = { sessionId: args[1], startOrder: Number(args[3]), endOrder: Number(args[5]) }
  validateExportRange(range)
  return { range, inventoryPath }
}

async function localInventory(path) {
  const metadata = await stat(path)
  if (!metadata.isFile() || metadata.size > 1_000_000) throw new Error('INVALID_INVENTORY_FILE')
  const bytes = await readFile(path)
  if (bytes.length > 1_000_000) throw new Error('INVALID_INVENTORY_FILE')
  return JSON.parse(bytes.toString('utf8'))
}

function validateInventory(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== 6
    || !['version', 'chronicle_id', 'worldline_id', 'season_id', 'segments',
      'reserved_session_ids'].every((key) => Object.hasOwn(input, key))
    || input.version !== 'pending-segment-inventory-v1'
    || input.chronicle_id !== 'C03-AFTERFALL'
    || input.worldline_id !== 'AFTERFALL' || !/^S\d{2,3}$/.test(input.season_id)
    || !Array.isArray(input.segments) || !Array.isArray(input.reserved_session_ids)) {
    throw new Error('INVALID_INVENTORY_ENVELOPE')
  }
  return input
}

export async function runLinkedExportCli(args, { connectionString = process.env.ARCHIVE_EXPORT_DATABASE_URL,
  ClientClass = null, readInventory = localInventory } = {}) {
  const { range, inventoryPath } = inputs(args, connectionString)
  // Validate caller-supplied metadata before touching the private database.
  const inventory = inventoryPath ? validateInventory(await readInventory(inventoryPath)) : null
  const Client = ClientClass ?? (await import('pg')).default.Client
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: true },
    application_name: 'archive_readonly_export_check' })
  try {
    await client.connect()
    const prepared = await readLinkedRange(client, range)
    const { partBytes, ...safe } = prepared
    if (inventoryPath) {
      if (inventory.season_id !== safe.candidate.season_id) throw new Error('INVENTORY_SEASON_MISMATCH')
      const plan = planPendingSegment(safe.candidate, partBytes,
        inventory.segments, inventory.reserved_session_ids)
      return JSON.stringify({ mode: 'READ_ONLY_UNAPPROVED_SEGMENT_PLAN',
        status: plan.status, session_id: plan.session_id,
        candidate_id: safe.candidate.candidate_id,
        source_manifest_ref: plan.source_manifest_ref ?? null,
        inventory_authenticated: false, exporter_authenticated: true,
        transaction_snapshot_verified: true, publication_allowed: false,
        part_bytes_verified_in_memory: partBytes.length,
        files_written: 0, database_writes: 0, site_publications: 0 }, null, 2) + '\n'
    }
    return JSON.stringify({ mode: 'READ_ONLY_UNAPPROVED_CANDIDATE',
      candidate_id: safe.candidate.candidate_id, ...safe.report,
      part_bytes_verified_in_memory: partBytes.length }, null, 2) + '\n'
  } finally { await client.end() }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(await runLinkedExportCli(process.argv.slice(2))) }
  catch { process.stderr.write('{"ok":false,"error":"LINKED_EXPORT_CHECK_REJECTED","database_writes":0,"site_publications":0}\n'); process.exitCode = 1 }
}
