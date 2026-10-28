import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chapterHash, hashPolicyBytes } from './knowledge-semantic-jobs.mjs'
import { readVerifiedArchivedRaw, readVerifiedStrongholdRaw } from './knowledge-semantic-source-alias.mjs'
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = JSON.stringify
const safeRef = (value) => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('..') && !value.includes('\\')

export async function readPinnedSourceBytes({ base, ref, expectedHash, read = readFile, readWorldline = (ref) => execFileSync('git', ['show', `origin/worldline/afterfall-rpg:${ref}`], {cwd:base,stdio:['ignore','pipe','pipe']}) }) {
  try { return await read(join(base,ref)) }
  catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause
    const stronghold = await readVerifiedStrongholdRaw({base,ref,expectedSha256:expectedHash,read})
    if (stronghold) return stronghold
    if (!ref.startsWith('worldlines/AFTERFALL/')) throw cause
    try { return await readWorldline(ref) }
    catch {
      const archived = await readVerifiedArchivedRaw({base,ref,expectedSha256:expectedHash,read})
      if (archived) return archived
      throw new Error('SEMANTIC_SOURCE_UNAVAILABLE')
    }
  }
}

export async function verifyPins(job, base) {
  const context = job.semantic_context ?? job.context
  if (!context?.source || !context?.target || !Array.isArray(context.source.refs) || !Array.isArray(context.source.hashes)
      || context.source.refs.length !== context.source.hashes.length) throw new Error('SEMANTIC_SOURCE_CONTEXT_INVALID')
  if (context.source.kind !== job.source_kind || context.source.ref !== job.source_ref || context.source.sha256 !== job.source_sha256) throw new Error('SEMANTIC_SOURCE_BINDING_MISMATCH')
  const [policyBytes, configBytes, editorialBytes] = await Promise.all([
    readFile(join(base, 'knowledge/automation/worker-policy.json')),
    readFile(join(base, 'knowledge/automation/config.json')),
    readFile(join(base, 'docs/KNOWLEDGE_BRIEF_EDITORIAL_SPEC_V1.md')),
  ])
  const policyHash = hashPolicyBytes(policyBytes, configBytes, editorialBytes)
  if (policyHash !== job.policy_sha256 || job.policy_pin?.sha256 !== policyHash) throw new Error('SEMANTIC_POLICY_PIN_CHANGED')
  const config = JSON.parse(configBytes.toString('utf8'))
  if (context.policy?.publication_mode !== config.publication_mode || context.policy?.auto_publish_enabled !== config.auto_publish_enabled) throw new Error('SEMANTIC_CONFIG_PIN_CHANGED')

  const verifyFile = async (ref, expectedHash) => {
    if (!safeRef(ref) || !/^[a-f0-9]{64}$/.test(expectedHash ?? '')) throw new Error('SEMANTIC_SOURCE_REFERENCE_INVALID')
    if (sha(await readPinnedSourceBytes({ base, ref, expectedHash })) !== expectedHash) throw new Error('SEMANTIC_SOURCE_SHA_CHANGED')
  }
  if (job.source_kind === 'PUBLIC_ARCHIVE') {
    await verifyFile(job.source_ref, job.source_sha256)
    for (let index = 0; index < context.source.refs.length; index += 1) await verifyFile(context.source.refs[index], context.source.hashes[index])
  } else if (job.source_kind === 'PUBLIC_READER') {
    const chapterId = context.source.chapter_id
    const readerBookRef = context.source.reader_book_ref ?? 'archive/content/stories/C03-AFTERFALL/BOOK.json'
    if (!chapterId || context.source.chapter_sha256 !== job.source_sha256) throw new Error('SEMANTIC_READER_PIN_INVALID')
    if (!/^archive\/content\/stories\/C\d{2,}-[A-Z0-9-]+\/BOOK\.json$/.test(readerBookRef)) throw new Error('SEMANTIC_READER_BOOK_REF_INVALID')
    const book = JSON.parse(await readFile(join(base, readerBookRef), 'utf8'))
    const chapter = book.chapters?.find((item) => item.id === chapterId)
    if (!chapter || chapter.sourceKind !== 'VERIFIED_GM_NARRATIVE' || chapterHash(chapter) !== job.source_sha256) throw new Error('SEMANTIC_SOURCE_SHA_CHANGED')
    if (job.source_ref !== `${readerBookRef}#${chapterId}`
      || json(chapter.sourceRefs) !== json(context.source.refs) || json(chapter.sourceHashes) !== json(context.source.hashes)) throw new Error('SEMANTIC_READER_PROVENANCE_CHANGED')
    for (let index = 0; index < context.source.refs.length; index += 1) await verifyFile(context.source.refs[index], context.source.hashes[index])
  } else if (job.source_kind === 'USER_REPORTED_EXPERIENCE') {
    if (!/^knowledge\/content\/experience-seeds\/EX-[0-9]{3,}-[a-z0-9-]+\.json$/.test(job.source_ref) || context.source.refs.length !== 0) throw new Error('SEMANTIC_EXPERIENCE_SOURCE_INVALID')
    const bytes = await readPinnedSourceBytes({ base, ref:job.source_ref, expectedHash:job.source_sha256 })
    if (sha(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')) !== job.source_sha256) throw new Error('SEMANTIC_SOURCE_SHA_CHANGED')
  } else throw new Error('SEMANTIC_SOURCE_KIND_INVALID')
  return { context, config }
}
