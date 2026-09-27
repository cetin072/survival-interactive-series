/** Explicit one-shot operation. No schedule or public promotion is enabled. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runDailyNoop } from '../scripts/lib/daily-noop-runner.mjs'
import { requireExporterConnectionString } from './exporter-connection.mjs'

export function requireRunnerConnectionString(connectionString) {
  if (!connectionString) throw new Error('RUNNER_CREDENTIAL_NOT_CONFIGURED')
  const url = new URL(connectionString)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !/^archive_publication_runner(?:\.[a-z0-9]+)?$/.test(decodeURIComponent(url.username))
    || !/\.supabase\.co$|\.pooler\.supabase\.com$/.test(url.hostname)
    || ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some((key) => url.searchParams.has(key))) {
    throw new Error('DEDICATED_RUNNER_DATABASE_URL_REQUIRED')
  }
  return url
}

export async function runDailyNoopCli(args, {
  exportConnectionString = process.env.ARCHIVE_EXPORT_DATABASE_URL,
  runnerConnectionString = process.env.ARCHIVE_RUNNER_DATABASE_URL,
  ClientClass = null,
} = {}) {
  if (args.length !== 2 || args[0] !== '--date' || !/^\d{4}-\d{2}-\d{2}$/.test(args[1]))
    throw new Error('EXPLICIT_DATE_REQUIRED')
  requireExporterConnectionString(exportConnectionString)
  requireRunnerConnectionString(runnerConnectionString)
  const Client = ClientClass ?? (await import('pg')).default.Client
  const exporter = new Client({ connectionString: exportConnectionString,
    ssl: { rejectUnauthorized: true }, application_name: 'archive_daily_source_check' })
  const runner = new Client({ connectionString: runnerConnectionString,
    ssl: { rejectUnauthorized: true }, application_name: 'archive_daily_noop' })
  try {
    await exporter.connect()
    await runner.connect()
    return JSON.stringify({ mode: 'ONE_SHOT_DAILY_NOOP',
      ...await runDailyNoop({ exporter, runner, scheduledDate: args[1] }) }, null, 2) + '\n'
  } finally {
    await Promise.allSettled([exporter.end(), runner.end()])
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(await runDailyNoopCli(process.argv.slice(2))) }
  catch { process.stderr.write('{"ok":false,"error":"DAILY_NOOP_REJECTED","site_publications":0}\n'); process.exitCode = 1 }
}
