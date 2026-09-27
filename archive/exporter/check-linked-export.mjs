/** Opt-in, read-only linked capture check. Never prints transcript bodies. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readLinkedRange, validateExportRange } from '../scripts/lib/linked-export-runner.mjs'

function inputs(args, connectionString) {
  if (args.length !== 7 || args[0] !== '--session' || args[2] !== '--start'
    || args[4] !== '--end' || args[6] !== '--check') throw new Error('EXPLICIT_READ_ONLY_MODE_REQUIRED')
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
  return range
}

export async function runLinkedExportCli(args, { connectionString = process.env.ARCHIVE_EXPORT_DATABASE_URL,
  ClientClass = null } = {}) {
  const range = inputs(args, connectionString)
  const Client = ClientClass ?? (await import('pg')).default.Client
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: true },
    application_name: 'archive_readonly_export_check' })
  try {
    await client.connect()
    const prepared = await readLinkedRange(client, range)
    const { partBytes, ...safe } = prepared
    return JSON.stringify({ mode: 'READ_ONLY_UNAPPROVED_CANDIDATE',
      candidate_id: safe.candidate.candidate_id, ...safe.report,
      part_bytes_verified_in_memory: partBytes.length }, null, 2) + '\n'
  } finally { await client.end() }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(await runLinkedExportCli(process.argv.slice(2))) }
  catch { process.stderr.write('{"ok":false,"error":"LINKED_EXPORT_CHECK_REJECTED","database_writes":0,"site_publications":0}\n'); process.exitCode = 1 }
}
