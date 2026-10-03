import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setPhase, statusFromJob } from './a-wiki-native-status.mjs'

test('status helper creates EXTRACTOR_READY from a semantic job', async () => {
  const root = await mkdtemp(join(tmpdir(), 'a-wiki-status-'))
  try {
    const jobPath = join(root, 'job.json')
    const statusPath = join(root, 'status.json')
    await writeFile(jobPath, JSON.stringify({
      version: 'wiki-fact-job-v1',
      job_id: 'wiki-job-' + 'a'.repeat(64),
      graph_sha256: 'b'.repeat(64),
      source: {
        session_id: 'SESSION_006',
        manifest_sha256: 'c'.repeat(64),
      },
    }))
    const status = await statusFromJob(jobPath, statusPath, {
      BASE_SHA: 'd'.repeat(40),
    })
    assert.equal(status.phase, 'EXTRACTOR_READY')
    assert.equal(status.session_id, 'SESSION_006')
    assert.deepEqual(JSON.parse(await readFile(statusPath, 'utf8')), status)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('status helper records REVIEW_READY with the exact proposal hash', async () => {
  const root = await mkdtemp(join(tmpdir(), 'a-wiki-status-'))
  try {
    const statusPath = join(root, 'status.json')
    const proposalPath = join(root, 'proposal.json')
    await writeFile(statusPath, JSON.stringify({
      version: 'a-wiki-native-status-v1',
      phase: 'EXTRACTOR_READY',
    }))
    await writeFile(proposalPath, JSON.stringify({
      proposal_sha256: 'e'.repeat(64),
    }))
    const status = await setPhase(statusPath, 'REVIEW_READY', {
      PROPOSAL_PATH: proposalPath,
    })
    assert.equal(status.phase, 'REVIEW_READY')
    assert.equal(status.proposal_sha256, 'e'.repeat(64))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
