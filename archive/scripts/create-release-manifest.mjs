/** Create a deterministic, public manifest for the bytes this build publishes. */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const webRoot = resolve(import.meta.dirname, '../web')
const distRoot = resolve(webRoot, 'dist')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const demand = (condition, code) => { if (!condition) throw new Error(code) }

const bundlerManifest = JSON.parse(await readFile(resolve(distRoot, '.vite/manifest.json'), 'utf8'))
function chunkFor(name, source) {
  const entry = Object.values(bundlerManifest).find((candidate) => candidate.file?.split('/').at(-1).startsWith(`${name}-`))
  demand(entry?.file, `MISSING_RELEASE_CHUNK:${source}`)
  return entry.file
}

async function asset(kind, path, source) {
  const bytes = await readFile(resolve(distRoot, path))
  return { kind, path: path.replaceAll('\\', '/'), sha256: hash(bytes), byte_length: bytes.byteLength, ...(source ? { source } : {}) }
}

const assets = [
  await asset('graph', chunkFor('archive-graph', 'src/archive/archiveData.ts'), 'archive/web/src/archive/archiveData.ts'),
  await asset('characters', chunkFor('archive-characters', 'src/archive/characterAppearance.ts'), 'archive/web/src/archive/characterAppearance.ts'),
]

for (const [key, entry] of Object.entries(bundlerManifest)) {
  if (!key.includes('/content/stories/') || !key.includes('BOOK.json')) continue
  const bytes = await readFile(resolve(distRoot, entry.file))
  demand(!bytes.includes(0x0d), 'NONCANONICAL_BOOK_LINE_ENDINGS')
  const book = JSON.parse(bytes.toString('utf8'))
  demand(['C01-HAN-JUNHO', 'C02-STRONGHOLD', 'C03-AFTERFALL'].includes(book.chronicleId), 'UNKNOWN_BOOK_CHRONICLE')
  assets.push({ kind: 'book', chronicle_id: book.chronicleId, path: entry.file, sha256: hash(bytes), byte_length: bytes.byteLength })
}

for (const chronicle of ['C01-HAN-JUNHO', 'C02-STRONGHOLD', 'C03-AFTERFALL']) {
  demand(assets.filter((entry) => entry.kind === 'book' && entry.chronicle_id === chronicle).length === 1, `BOOK_ASSET_CARDINALITY:${chronicle}`)
}
assets.sort((a, b) => {
  const left = `${a.kind}:${a.chronicle_id ?? ''}:${a.path}`
  const right = `${b.kind}:${b.chronicle_id ?? ''}:${b.path}`
  return left < right ? -1 : left > right ? 1 : 0
})

const manifest = {
  schema: 'archive-release-manifest-v1',
  release_id: hash(JSON.stringify(assets)),
  assets,
}
const bytes = JSON.stringify(manifest, null, 2) + '\n'
await writeFile(resolve(distRoot, 'archive-release-manifest.json'), bytes, 'utf8')
process.stdout.write(JSON.stringify({ schema: manifest.schema, release_id: manifest.release_id, assets: assets.map(({ kind, chronicle_id, path, sha256 }) => ({ kind, chronicle_id, path, sha256 })) }) + '\n')

