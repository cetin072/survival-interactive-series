/** Private read-only batch check. Logs counts, never transcript bodies or IDs. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkLinkedExportBatch } from '../scripts/lib/linked-export-batch.mjs'
import { requireExporterConnectionString } from './exporter-connection.mjs'

export async function runBatchCheckCli(args, {
  connectionString = process.env.ARCHIVE_EXPORT_DATABASE_URL,
  ClientClass = null,
} = {}) {
  if (args.length !== 1 || args[0] !== '--check')
    throw new Error('EXPLICIT_READ_ONLY_MODE_REQUIRED')
  requireExporterConnectionString(connectionString)
  const Client = ClientClass ?? (await import('pg')).default.Client
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: true },
    application_name: 'archive_linked_batch_check' })
  try {
    await client.connect()
    return JSON.stringify({ mode: 'READ_ONLY_LINKED_BATCH_CHECK',
      ...await checkLinkedExportBatch(client) }, null, 2) + '\n'
  } finally { await client.end() }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(await runBatchCheckCli(process.argv.slice(2))) }
  catch { process.stderr.write('{"ok":false,"error":"LINKED_BATCH_CHECK_REJECTED","database_writes":0,"site_publications":0}\n'); process.exitCode = 1 }
}
