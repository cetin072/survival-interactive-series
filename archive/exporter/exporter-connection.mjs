/** Accept only a dedicated private PostgreSQL exporter login. */
export function requireExporterConnectionString(connectionString) {
  if (!connectionString) throw new Error('EXPORT_CREDENTIAL_NOT_CONFIGURED')
  const url = new URL(connectionString)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !/^archive_exporter(?:\.[a-z0-9]+)?$/.test(decodeURIComponent(url.username))
    || !/\.supabase\.co$|\.pooler\.supabase\.com$/.test(url.hostname)
    || ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some((key) => url.searchParams.has(key))) {
    throw new Error('DEDICATED_EXPORT_DATABASE_URL_REQUIRED')
  }
  return url
}
