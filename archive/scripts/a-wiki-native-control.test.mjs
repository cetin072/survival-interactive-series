import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { discoverWikiSources } from './lib/wiki-semantic-jobs.mjs'
import { byteHash, reconcilePublicGraph } from './lib/publication-graph.mjs'
import {
  buildWikiFactJob, buildWikiFactReviewJob, validateWikiFactReview, WIKI_REVIEW_VERSION,
} from './lib/wiki-fact-extractor.mjs'
import {
  compileAWikiVisualCatalog, compileSubmittedExtractor, inspectSubmittedReview, mergedPublication, confirmMergedPublication,
  prepareNativeJob, publicationBranch, consumeNativeJob,
} from './a-wiki-native-control.mjs'

const NS = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
const ANCHOR = { save_version: 10, game_time: '2027-01-01 12:00' }
const seed = {
  id: 'char-existing', label: '기존인물', type: 'character',
  subtitle: '기존 역할', summary: '기존 공개 설명', tags: ['기존태그'],
  source: 'SYNTHETIC_TEST_ONLY',
}
const book = { chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', chapters: [] }
const bookSource = { source_ref: 'archive/content/stories/C03-AFTERFALL/BOOK.json', source_sha256: 'b'.repeat(64) }

function batch(anchor) {
  return {
    batch_id: 'batch-' + 'a'.repeat(64),
    snapshot: { ...NS, season_id: 'S03', source_save_version: anchor.save_version, source_game_time: anchor.game_time },
  }
}

function syntheticPackage() {
  const facts = {
    version: 'public-graph-facts-v1', ...NS, season_id: 'S03', anchor: ANCHOR,
    nodes: [seed], relations: [],
  }
  const graph = reconcilePublicGraph({
    batch: batch(ANCHOR),
    facts,
    source: {
      source_ref: 'archive/content/public-facts/C03-AFTERFALL/S03/TEST.json',
      source_sha256: 'a'.repeat(64),
    },
    book,
    bookSource,
  }).graph

  const body = '제어시험인물은 제어시험작업장에서 일한다.'
  const source = {
    sourceSession: { session_id: 'SESSION_999' },
    sourceManifestRef: 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_999/SOURCE_MANIFEST.json',
    sourceDigest: 'c'.repeat(64),
    rawRef: 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_999/PART_001.md',
    rawSha256: byteHash(body),
    anchor: { save_version: 11, game_time: '2027-01-02 12:00' },
    gmBlocks: [{ messageLabel: '001', body }],
  }
  const job = buildWikiFactJob(source, graph)
  const proof = (fields) => Object.fromEntries(fields.map((field) => [field, ['q1']]))
  const result = {
    version: 'wiki-fact-result-v1',
    job_id: job.job_id,
    decision: 'FACTS_READY',
    coverage: { status: 'COMPLETE', reviewed_blocks: ['001'] },
    nodes: [
      {
        key: 'new:person', existing_id: null, type: 'character', label: '제어시험인물',
        changes: { subtitle: '작업자', summary: '제어시험작업장에서 일한다.' },
        evidence: proof(['type', 'label', 'subtitle', 'summary']),
      },
      {
        key: 'new:place', existing_id: null, type: 'location', label: '제어시험작업장',
        changes: { subtitle: '작업 장소', summary: '제어시험인물의 작업 장소다.' },
        evidence: proof(['type', 'label', 'subtitle', 'summary']),
      },
    ],
    relations: [
      { from: 'new:person', to: 'new:place', kind: 'works_at', label: '근무', evidence: ['q1'] },
    ],
    citations: [
      { id: 'q1', block_id: '001', quote: body },
    ],
    deferred: [],
    note: 'SYNTHETIC_TEST_ONLY',
  }
  return { job, result }
}

test('submitted Extractor compiles into one REVIEW_READY package', () => {
  const { job, result } = syntheticPackage()
  const compiled = compileSubmittedExtractor({
    status: 'EXTRACTOR_SUBMITTED',
    prepared_job: job,
    extractor_result: result,
  })
  assert.equal(compiled.action, 'REVIEW_READY')
  assert.equal(compiled.proposal.coverage.status, 'COMPLETE')
  assert.equal(compiled.reviewJob.prepared_job.job_id, job.job_id)
  assert.equal(compiled.reviewJob.proposal.proposal_sha256, compiled.proposal.proposal_sha256)
  assert.equal(compiled.reviewJob.prepared_job.source.gm_blocks.length, 1)
})

test('submitted independent APPROVE review advances to publication', () => {
  const { job, result } = syntheticPackage()
  const compiled = compileSubmittedExtractor({
    status: 'EXTRACTOR_SUBMITTED',
    prepared_job: job,
    extractor_result: result,
  })
  const review = {
    version: WIKI_REVIEW_VERSION,
    proposal_sha256: compiled.proposal.proposal_sha256,
    decision: 'APPROVE',
    note: 'Test-only independent full-source review.',
  }
  const disposition = inspectSubmittedReview({
    status: 'REVIEW_SUBMITTED',
    review_job: compiled.reviewJob,
    review_result: review,
  })
  assert.equal(disposition.action, 'PUBLISH')
})

test('submitted HUMAN_REVIEW never reaches publication', () => {
  const { job, result } = syntheticPackage()
  const compiled = compileSubmittedExtractor({
    status: 'EXTRACTOR_SUBMITTED',
    prepared_job: job,
    extractor_result: result,
  })
  const review = {
    version: WIKI_REVIEW_VERSION,
    proposal_sha256: compiled.proposal.proposal_sha256,
    decision: 'HUMAN_REVIEW',
    note: 'Material durable fact may be missing.',
  }
  const disposition = inspectSubmittedReview({
    status: 'REVIEW_SUBMITTED',
    review_job: compiled.reviewJob,
    review_result: review,
  })
  assert.equal(disposition.action, 'HUMAN_REVIEW')
})

test('review package rejects a mutated proposal', () => {
  const { job, result } = syntheticPackage()
  const compiled = compileSubmittedExtractor({
    status: 'EXTRACTOR_SUBMITTED',
    prepared_job: job,
    extractor_result: result,
  })
  const alteredProposal = structuredClone(compiled.proposal)
  alteredProposal.note += ' changed'
  assert.throws(() => buildWikiFactReviewJob(job, alteredProposal), /WIKI_REVIEW_PROPOSAL_HASH_INVALID/)
})

test('merged publication recovery accepts only the exact publication branch and main target', () => {
  const branch = 'automation/a-wiki-publish-006-14675b020602'
  const result = mergedPublication({
    number: 372,
    state: 'MERGED',
    headRefName: branch,
    headRefOid: '4'.repeat(40),
    baseRefName: 'main',
    mergeCommit: { oid: 'a'.repeat(40) },
  }, branch)
  assert.deepEqual(result, {
    status: 'MERGED',
    branch,
    prNumber: 372,
    headSha: '4'.repeat(40),
    mergeSha: 'a'.repeat(40),
  })
  assert.throws(() => mergedPublication({
    number: 372,
    state: 'MERGED',
    headRefName: 'other-branch',
    headRefOid: '4'.repeat(40),
    baseRefName: 'main',
    mergeCommit: { oid: 'a'.repeat(40) },
  }, branch), /A_WIKI_MERGED_PR_BINDING_INVALID/)
  assert.equal(mergedPublication({ state: 'OPEN' }, branch), null)
})

test('publication identity keeps legacy branches and separates seasons and graph revisions', () => {
  const { job } = syntheticPackage()
  const legacy = publicationBranch(job)
  assert.match(legacy, /^automation\/a-wiki-publish-999-c{12}$/)
  assert.notEqual(publicationBranch({ ...job, season_id: 'S04' }), legacy)
  assert.notEqual(publicationBranch(job, true), legacy)
  assert.notEqual(publicationBranch({ ...job, graph_sha256: 'e'.repeat(64) }, true), publicationBranch(job, true))
})

const base = resolve(import.meta.dirname, '../..')
async function currentSourceRow(status = 'EXTRACTOR_READY') {
  const source = (await discoverWikiSources(base)).find((item) => item.seasonId === 'S03'
    && item.sourceSession.session_id === 'SESSION_007')
  assert.ok(source)
  return { source, row: { status, job_id: 'test-db-job', session_id: source.sourceSession.session_id,
    source_ref: source.sourceManifestRef, source_sha256: source.sourceDigest,
    prepared_job: { season_id: source.seasonId }, graph_sha256: 'f'.repeat(64) } }
}

test('prepare reconciles a completed stale ledger before admitting the next pending source and does not reconcile twice', async () => {
  const { row } = await currentSourceRow()
  let completed = false
  let nextActive = null
  const calls = []
  const requestRpc = async (name, args) => {
    calls.push(name)
    if (name === 'archive_a_wiki_native_job_recovery_current') {
      if (!completed) return row
      return nextActive ?? { status: 'NO_JOB' }
    }
    if (name === 'archive_a_wiki_native_job_reconcile_publication') {
      assert.equal(args.p_expected_status, 'EXTRACTOR_READY')
      assert.deepEqual(args.p_evidence, { verified: true })
      completed = true
      return { status: 'PUBLISHED' }
    }
    if (name === 'archive_a_wiki_native_job_prepare') {
      assert.equal(args.p_job.season_id, 'S04')
      assert.equal(args.p_job.source.session_id, 'SESSION_001')
      nextActive = {
        status: 'EXTRACTOR_READY',
        job_id: 'next-job',
        session_id: args.p_job.source.session_id,
        source_ref: args.p_job.source.manifest_ref,
        source_sha256: args.p_job.source.manifest_sha256,
        prepared_job: args.p_job,
        graph_sha256: args.p_job.graph_sha256,
      }
      return { status: 'EXTRACTOR_READY', job_id: 'next-job' }
    }
    assert.fail(`Unexpected RPC ${name}`)
  }
  let originalCollections = 0
  const collectCompletion = async ({ row: candidate }) => {
    if (candidate.job_id === row.job_id) {
      originalCollections++
      return { verified: true }
    }
    return null
  }
  const first = await prepareNativeJob({ base, requestRpc, collectCompletion })
  assert.equal(first.status, 'EXTRACTOR_READY')
  assert.equal(first.job_id, 'next-job')
  assert.equal(first.reconciled_job_id, row.job_id)
  const second = await prepareNativeJob({ base, requestRpc, collectCompletion })
  assert.equal(second.status, 'EXTRACTOR_READY')
  assert.equal(second.job_id, 'next-job')
  assert.equal(second.reconciled_job_id, undefined)
  assert.equal(originalCollections, 1)
  assert.deepEqual(calls, [
    'archive_a_wiki_native_job_recovery_current',
    'archive_a_wiki_native_job_reconcile_publication',
    'archive_a_wiki_native_job_prepare',
    'archive_a_wiki_native_job_recovery_current',
  ])
})

test('invalid receipt evidence blocks prepare without faking completion or hiding it as NO_JOB', async () => {
  const { row } = await currentSourceRow()
  const calls = []
  await assert.rejects(prepareNativeJob({ base,
    requestRpc: async (name) => { calls.push(name); return row },
    collectCompletion: async () => { throw new Error('A_WIKI_COMPLETION_FACT_HASH_MISMATCH') },
  }), /FACT_HASH_MISMATCH/)
  assert.deepEqual(calls, ['archive_a_wiki_native_job_recovery_current'])
})

test('unfinished graph drift creates a fresh source-bound job instead of mutating approved work', async () => {
  const { row } = await currentSourceRow('BLOCKED')
  row.blocker_code = 'A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED'
  const original = structuredClone(row)
  const graph = JSON.parse(await readFile(resolve(base, 'archive/content/graphs/C03-AFTERFALL/GRAPH.json')))
  let replacements = 0
  const result = await prepareNativeJob({ base, collectCompletion: async () => null,
    requestRpc: async (name, args) => {
      if (name === 'archive_a_wiki_native_job_recovery_current') return row
      assert.equal(name, 'archive_a_wiki_native_job_supersede_reprepare')
      assert.equal(args.p_job.source.manifest_ref, row.source_ref)
      assert.equal(args.p_job.source.manifest_sha256, row.source_sha256)
      assert.equal(args.p_job.graph_sha256, graph.content_sha256)
      replacements++
      return { status: 'EXTRACTOR_READY', job_id: 'replacement-job' }
    },
  })
  assert.equal(result.superseded_job_id, row.job_id)
  assert.equal(result.job_id, 'replacement-job')
  assert.equal(replacements, 1)
  assert.deepEqual(row, original)
})

test('consumer records graph drift then requests a fresh main preparation without retrying stale approval', async () => {
  const row = { job_id: 'old-job', session_id: 'SESSION_999', status: 'FINALIZING' }
  const changes = []
  const requestRpc = async (name, args) => {
    if (name === 'archive_a_wiki_native_job_program_current') return row
    assert.equal(name, 'archive_a_wiki_native_job_advance')
    changes.push(args)
    return { status: args.p_status }
  }
  let fresh = 0
  const result = await consumeNativeJob({ requestRpc,
    publish: async () => { throw new Error('A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED') },
    reprepare: async ({ requestRpc: actualRpc }) => {
      assert.equal(actualRpc, requestRpc)
      fresh++
      return { status: 'EXTRACTOR_READY', job_id: 'new-job' }
    },
  })
  assert.equal(changes.length, 1)
  assert.equal(changes[0].p_status, 'BLOCKED')
  assert.equal(changes[0].p_blocker_code, 'A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED')
  assert.equal(fresh, 1)
  assert.equal(result.status, 'EXTRACTOR_READY')
  assert.equal(result.previous_job_id, 'old-job')
})

test('consumer reports PUBLISHED only after the matching DB transition is confirmed', async () => {
  const row = { job_id: 'published-job', session_id: 'SESSION_999', status: 'FINALIZING' }
  const result = await consumeNativeJob({
    requestRpc: async (name, args) => name === 'archive_a_wiki_native_job_program_current'
      ? row : { status: args.p_status },
    publish: async () => ({ status: 'MERGED', branch: 'review/test', prNumber: 1,
      headSha: 'a'.repeat(40), mergeSha: 'b'.repeat(40) }),
  })
  assert.equal(result.status, 'PUBLISHED')
})

test('A-Wiki visual sync recompiles the derived B catalog from the current approved Graph', async () => {
  const [graph, previousCatalog, appearanceBytes, sources] = await Promise.all([
    readFile(resolve(base, 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'), 'utf8').then(JSON.parse),
    readFile(resolve(base, 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'), 'utf8').then(JSON.parse),
    readFile(resolve(base, 'archive/content/public-facts/C03-AFTERFALL/S02/APPEARANCES_APPROVED_20260926.json')),
    discoverWikiSources(base),
  ])
  const source = sources.find((item) => item.seasonId === 'S03'
    && item.sourceSession.session_id === 'SESSION_008')
  assert.ok(source)
  const job = buildWikiFactJob(source, graph)
  const { catalog } = compileAWikiVisualCatalog({ job, graph, appearanceBytes, previousCatalog })
  assert.deepEqual(catalog.anchor, graph.anchor)
  assert.equal(catalog.graph_sha256, graph.content_sha256)
  const nextBySubject = new Map(catalog.points.map((point) => [point.subject_id, point]))
  for (const point of previousCatalog.points) {
    if (point.point_type === 'MAP') continue
    assert.equal(nextBySubject.get(point.subject_id)?.point_id, point.point_id)
  }
})

test('approved GitHub publication transport/readback failures resume FINALIZING without re-running semantics', async () => {
  const [graph, sources] = await Promise.all([
    readFile(resolve(base, 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'), 'utf8').then(JSON.parse),
    discoverWikiSources(base),
  ])
  const source = sources.find((item) => item.seasonId === 'S03'
    && item.sourceSession.session_id === 'SESSION_008')
  assert.ok(source)
  const job = buildWikiFactJob(source, graph)
  const result = {
    version: 'wiki-fact-result-v1',
    job_id: job.job_id,
    decision: 'NO_FACTS',
    coverage: { status: 'COMPLETE', reviewed_blocks: job.source.gm_blocks.map((block) => block.block_id) },
    nodes: [], relations: [], citations: [], deferred: [],
    note: 'Test-only complete no-facts extraction.',
  }
  const compiled = compileSubmittedExtractor({
    status: 'EXTRACTOR_SUBMITTED', prepared_job: job, extractor_result: result,
  })
  const reviewResult = {
    version: WIKI_REVIEW_VERSION,
    proposal_sha256: compiled.proposal.proposal_sha256,
    decision: 'APPROVE',
    note: 'Test-only independent approval.',
  }

  for (const blockerCode of ['A_WIKI_COMMAND_GH_1', 'A_WIKI_PR_BINDING_INVALID']) {
    const row = {
      status: 'BLOCKED',
      blocker_code: blockerCode,
      job_id: 'blocked-db-job',
      session_id: source.sourceSession.session_id,
      source_ref: source.sourceManifestRef,
      source_sha256: source.sourceDigest,
      graph_sha256: graph.content_sha256,
      prepared_job: job,
      proposal: compiled.proposal,
      review_job: compiled.reviewJob,
      review_result: reviewResult,
    }
    const calls = []
    const recovered = await prepareNativeJob({
      base,
      collectCompletion: async () => null,
      requestRpc: async (name, args) => {
        calls.push(name)
        if (name === 'archive_a_wiki_native_job_recovery_current') return row
        if (name === 'archive_a_wiki_native_job_advance') {
          assert.equal(args.p_expected_status, 'BLOCKED')
          assert.equal(args.p_status, 'FINALIZING')
          return { status: 'FINALIZING', job_id: row.job_id }
        }
        if (name === 'archive_a_wiki_native_dispatch') return { status: 'DISPATCHED', request_id: 123 }
        assert.fail(`Unexpected RPC ${name}`)
      },
    })
    assert.equal(recovered.status, 'FINALIZING')
    assert.equal(recovered.recovery, 'GITHUB_PUBLICATION_RETRY')
    assert.equal(recovered.dispatch_request_id, 123)
    assert.deepEqual(calls, [
      'archive_a_wiki_native_job_recovery_current',
      'archive_a_wiki_native_job_advance',
      'archive_a_wiki_native_dispatch',
    ])
  }
})

test('merged native retry requires source, receipt, exact proposal and independent review evidence', () => {
  const { job, result } = syntheticPackage()
  const compiled = compileSubmittedExtractor({ status: 'EXTRACTOR_SUBMITTED', prepared_job: job, extractor_result: result })
  const reviewResult = { version: WIKI_REVIEW_VERSION, proposal_sha256: compiled.proposal.proposal_sha256,
    decision: 'APPROVE', note: 'Independent test review.' }
  const review = validateWikiFactReview(compiled.reviewJob, reviewResult)
  const row = { prepared_job: job, proposal: compiled.proposal, review_job: compiled.reviewJob,
    review_result: reviewResult, source_ref: job.source.manifest_ref, source_sha256: job.source.manifest_sha256 }
  const publication = { prNumber: 1, branch: publicationBranch(job), headSha: 'a'.repeat(40), mergeSha: 'b'.repeat(40) }
  const evidence = { pr_number: 1, head_ref: publication.branch, head_sha: publication.headSha,
    merge_sha: publication.mergeSha, source_ref: row.source_ref, source_sha256: row.source_sha256,
    receipt_job_id: job.job_id, proposal_sha256: compiled.proposal.proposal_sha256, review_sha256: review.review_sha256 }
  assert.deepEqual(confirmMergedPublication(row, publication, evidence), publication)
  assert.throws(() => confirmMergedPublication(row, publication, null), /EVIDENCE_INVALID/)
  assert.throws(() => confirmMergedPublication(row, publication, { ...evidence, review_sha256: 'c'.repeat(64) }), /EVIDENCE_INVALID/)
  assert.throws(() => confirmMergedPublication(row, publication, { ...evidence, receipt_job_id: 'different-job' }), /EVIDENCE_INVALID/)
})
