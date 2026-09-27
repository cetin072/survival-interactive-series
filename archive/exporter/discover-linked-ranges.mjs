/** Private read-only range inventory. It returns no transcript body or approval. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discoverLinkedRanges } from '../scripts/lib/linked-export-discovery.mjs'
import { requireExporterConnectionString } from './exporter-connection.mjs'

export async function runDiscoveryCli(args, { connectionString = process.env.ARCHIVE_EXPORT_DATABASE_URL,
  ClientClass = null } = {}) {
  if (args.length !== 1 || args[0] !== '--check')
    throw new Error('EXPLICIT_READ_ONLY_MODE_REQUIRED')
  requireExporterConnectionString(connectionString)
  const Client = ClientClass ?? (await import('pg')).default.Client
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: true },
    application_name: 'archive_linked_range_discovery' })
  try {
    await client.connect()
    const plan = await discoverLinkedRanges(client)
    return JSON.stringify({ mode: 'READ_ONLY_LINKED_RANGE_DISCOVERY',
      ...plan, range_count: plan.ranges.length,
      database_writes: 0, publication_allowed: false }, null, 2) + '\n'
  } finally { await client.end() }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(await runDiscoveryCli(process.argv.slice(2))) }
  catch { process.stderr.write('{"ok":false,"error":"LINKED_DISCOVERY_REJECTED","message_bodies_read":0,"database_writes":0,"site_publications":0}\n'); process.exitCode = 1 }
}
