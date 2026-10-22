import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { archivedS03RawLocation, readVerifiedArchivedS03Raw } from './knowledge-semantic-source-alias.mjs'
import { chapterHash, hashPolicyBytes } from './knowledge-semantic-jobs.mjs'
import { verifyPins } from '../knowledge-semantic-finalize.mjs'

const root = resolve(import.meta.dirname, '../../..')
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const raw = (session) => `worldlines/AFTERFALL/seasons/S03/raw_transcript/SESSION_${session}/PART_001.md`
const cases = [
  ['001', '6048547fc3db3f06758ca22c6951eb838a04ce713f07b7c7837a88ab8ce6646d'],
  ['002', '8147a5929b04f445c519328c320a49d908ea9c1a55e785c73ee75c30ce0a9af8'],
  ['003', '3dc61364456b3c08c11c985f2f35df92ff518c033d00b931f60369d94217c0c0'],
  ['004', 'f07fe21c2c186d5783759a2ec3b94133b924bdc09e55b53ad201f80f46919247'],
  ['006', '5e9482a9a273fe104c329701ca3d56592fa2f2beb5f04858946a9ae0e71ec4ed'],
  ['007', 'efa893c97eda7900061d6afde8809233199155851ee49773d4dcee30eb645210'],
  ['008', '4f3f927f3a5cee583d47cc94dc375d43467c92bd54930426a8b434a12e2dfa2f'],
]

for (const [session, expectedSha256] of cases) {
  test(`real C03 S03 archive ${session} is byte-identical to the pinned RAW source`, async () => {
    const ref = raw(session)
    const alias = archivedS03RawLocation(ref)
    assert.equal(alias.sessionId, `SESSION_${session}`)
    const archivedBytes = await readVerifiedArchivedS03Raw({ base: root, ref, expectedSha256 })
    assert.equal(sha(archivedBytes), expectedSha256)
  })
}

test('only exact C03 S03 RAW refs can use the public Archive fallback', async () => {
  for (const ref of [
    'worldlines/AFTERFALL/seasons/S02/raw_transcript/SESSION_001/PART_001.md',
    'worldlines/AFTERFALL/seasons/S03/raw_transcript/SESSION_001/../../secret.md',
    'worldlines/STRONGHOLD/seasons/S03/raw_transcript/SESSION_001/PART_001.md',
    'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_001/PART_001.md',
  ]) {
    assert.equal(archivedS03RawLocation(ref), null)
    assert.equal(await readVerifiedArchivedS03Raw({base:root,ref,expectedSha256:'a'.repeat(64)}),null)
  }
})

test('archive alias fails closed for missing manifest, false public-safe metadata, and corrupt bytes', async () => {
  const ref = raw('002')
  const expectedSha256 = cases[1][1]
  const alias = archivedS03RawLocation(ref)
  const manifest = JSON.parse(await readFile(join(root,alias.manifestRef),'utf8'))
  const bytes = await readFile(join(root,alias.partRef))
  const dir = await mkdtemp(join(tmpdir(),'knowledge-s03-archive-'))
  try {
    await assert.rejects(
      readVerifiedArchivedS03Raw({base:dir,ref,expectedSha256}),
      /SEMANTIC_SOURCE_UNAVAILABLE/
    )
    await mkdir(dirname(join(dir,alias.manifestRef)),{recursive:true})
    await writeFile(join(dir,alias.manifestRef),JSON.stringify({...manifest,public_safe_only:false}))
    await writeFile(join(dir,alias.partRef),bytes)
    await assert.rejects(
      readVerifiedArchivedS03Raw({base:dir,ref,expectedSha256}),
      /SEMANTIC_ARCHIVE_PROVENANCE_INVALID/
    )
    await writeFile(join(dir,alias.manifestRef),JSON.stringify(manifest))
    await assert.rejects(
      readVerifiedArchivedS03Raw({base:dir,ref,expectedSha256:'f'.repeat(64)}),
      /SEMANTIC_ARCHIVE_PROVENANCE_INVALID/
    )
    await writeFile(join(dir,alias.partRef),'corrupted public copy')
    await assert.rejects(
      readVerifiedArchivedS03Raw({base:dir,ref,expectedSha256}),
      /SEMANTIC_SOURCE_SHA_CHANGED/
    )
  } finally {
    await rm(dir,{recursive:true,force:true})
  }
})

test('real Finalizer verifyPins accepts the S03 Reader source only via a byte-verified public archive', async () => {
  const readerBookRef = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
  const book = JSON.parse(await readFile(join(root, readerBookRef), 'utf8'))
  const chapter = book.chapters.find((item) => item.sourceKind === 'VERIFIED_GM_NARRATIVE'
    && item.sourceRefs?.includes(raw('002')))
  assert.ok(chapter, 'expected source-pinned public Reader chapter for SESSION_002')
  const chapterSha256 = chapterHash(chapter)
  const [policyBytes, configBytes, editorialBytes] = await Promise.all([
    readFile(join(root, 'knowledge/automation/worker-policy.json')),
    readFile(join(root, 'knowledge/automation/config.json')),
    readFile(join(root, 'docs/KNOWLEDGE_BRIEF_EDITORIAL_SPEC_V1.md')),
  ])
  const policySha256 = hashPolicyBytes(policyBytes, configBytes, editorialBytes)
  const config = JSON.parse(configBytes.toString('utf8'))
  const sourceRef = `${readerBookRef}#${chapter.id}`
  const job = {
    source_kind: 'PUBLIC_READER',
    source_ref: sourceRef,
    source_sha256: chapterSha256,
    policy_sha256: policySha256,
    policy_pin: { sha256: policySha256 },
    semantic_context: {
      source: {
        kind: 'PUBLIC_READER',
        ref: sourceRef,
        sha256: chapterSha256,
        chapter_id: chapter.id,
        chapter_sha256: chapterSha256,
        reader_book_ref: readerBookRef,
        refs: chapter.sourceRefs,
        hashes: chapter.sourceHashes,
      },
      target: { brief_id: 'K-TEST' },
      policy: {
        publication_mode: config.publication_mode,
        auto_publish_enabled: config.auto_publish_enabled,
      },
    },
  }
  const verified = await verifyPins(job, root)
  assert.equal(verified.context.source.sha256, chapterSha256)
  assert.equal(chapter.sourceHashes[chapter.sourceRefs.indexOf(raw('002'))], cases[1][1])
})
