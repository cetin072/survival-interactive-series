import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { approvedSeasonCatalog } from './approved-reader-sources.mjs'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const stateStatuses = new Set(['PROCESSED', 'HOLD', 'HUMAN_REVIEW', 'BASELINE_PRE_V1'])
const assert = (condition, message) => { if (!condition) throw new Error(`KNOWLEDGE_SCAN_CONTRACT: ${message}`) }

export async function publicKnowledgeInventory(root) {
  const transcriptRoot = join(root, 'archive/content/transcripts/C03-AFTERFALL')
  const found = new Map()
  for (const season of (await readdir(transcriptRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^S\d{2,3}$/.test(entry.name)).map((entry) => entry.name).sort()) {
    const seasonPath = join(transcriptRoot, season, 'MANIFEST.json')
    const seasonBytes = await readFile(seasonPath).catch((error) => { if (error.code === 'ENOENT') return null; throw error })
    if (!seasonBytes) continue
    const manifest = JSON.parse(seasonBytes.toString('utf8'))
    // The Reader public-source contract validates namespace, season/session identity,
    // public safety, part hashes, exact part list, and alternating USER/GM order.
    const parts = await approvedSeasonCatalog(manifest, season, {
      read: (ref) => readFile(join(root, ref)),
      listParts: async (ref) => (await readdir(join(root, ref))).filter((name) => /^PART_\d{3}\.md$/.test(name)),
    })
    for (const part of parts) {
      const source = part.autoPublication
      const ref = source.sourceManifestRef
      if (!found.has(ref)) found.set(ref, {
        chronicle_id: manifest.chronicle_id, season_id: season, session_id: source.sessionId,
        source_manifest_ref: ref, source_manifest_sha256: source.sourceManifestSha256, parts: [],
      })
      const item = found.get(ref)
      assert(item.source_manifest_sha256 === source.sourceManifestSha256, `conflicting manifest ${ref}`)
      item.parts.push({ ref: part.archivePath, sha256: source.rawSha256 })
    }
  }
  return [...found.values()].sort((a, b) => a.source_manifest_ref.localeCompare(b.source_manifest_ref))
}

export function validateKnowledgeState(state) {
  assert(state?.version === 1 && Array.isArray(state.sources), 'invalid state version/sources')
  const refs = new Set()
  for (const item of state.sources) {
    assert(typeof item.source_manifest_ref === 'string' && item.source_manifest_ref.startsWith('archive/content/transcripts/C03-AFTERFALL/'), 'invalid state ref')
    assert(!refs.has(item.source_manifest_ref), `duplicate state ref ${item.source_manifest_ref}`)
    refs.add(item.source_manifest_ref)
    assert(/^[a-f0-9]{64}$/.test(item.source_manifest_sha256) && stateStatuses.has(item.status), 'invalid state sha/status')
    assert(typeof item.processed_at === 'string' && !Number.isNaN(Date.parse(item.processed_at)), 'invalid state time')
    assert(Array.isArray(item.candidate_ids) && Array.isArray(item.brief_ids), 'invalid state result refs')
  }
}

export function scanKnowledge(inventory, state) {
  validateKnowledgeState(state)
  const seen = new Set(), records = new Map(state.sources.map((item) => [item.source_manifest_ref, item]))
  const sources = inventory.map((item) => {
    assert(!seen.has(item.source_manifest_ref), `duplicate inventory ${item.source_manifest_ref}`)
    seen.add(item.source_manifest_ref)
    const previous = records.get(item.source_manifest_ref)
    const status = !previous ? 'PENDING' : previous.source_manifest_sha256 !== item.source_manifest_sha256
      ? 'SOURCE_CHANGED_RESCAN_REQUIRED' : previous.status === 'BASELINE_PRE_V1'
        ? 'NOOP_BASELINE_PRE_V1' : 'NOOP_ALREADY_PROCESSED'
    return { ...item, status }
  })
  return { status: sources.some((item) => item.status === 'SOURCE_CHANGED_RESCAN_REQUIRED') ? 'SOURCE_CHANGED_RESCAN_REQUIRED'
    : sources.some((item) => item.status === 'PENDING') ? 'PENDING' : 'NOOP',
    sources: sources.filter((item) => item.status === 'PENDING' || item.status === 'SOURCE_CHANGED_RESCAN_REQUIRED'),
    ignored: sources.filter((item) => item.status.startsWith('NOOP')).map(({ source_manifest_ref, status }) => ({ source_manifest_ref, status })) }
}

export async function bootstrapKnowledge(root, inventory, state, now) {
  validateKnowledgeState(state)
  const refs = new Set(state.sources.map((item) => item.source_manifest_ref))
  const additions = inventory.filter((item) => !refs.has(item.source_manifest_ref)).map((item) => ({
    source_manifest_ref: item.source_manifest_ref, source_manifest_sha256: item.source_manifest_sha256,
    status: 'BASELINE_PRE_V1', processed_at: now, candidate_ids: [], brief_ids: [],
  }))
  if (additions.length) {
    state.sources.push(...additions)
    state.sources.sort((a, b) => a.source_manifest_ref.localeCompare(b.source_manifest_ref))
    await writeFile(join(root, 'knowledge/automation/state.json'), JSON.stringify(state, null, 2) + '\n')
  }
  return additions.length
}
