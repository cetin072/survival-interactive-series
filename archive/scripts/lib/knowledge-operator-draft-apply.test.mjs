import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { applyApprovedOperatorDraft } from '../knowledge-operator-draft-apply.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const jobId = '22222222-2222-4222-8222-222222222222'
const draftSha = 'd'.repeat(64)

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'knowledge-operator-draft-'))
  await Promise.all([
    cp(join(repositoryRoot, 'knowledge'), join(base, 'knowledge'), { recursive: true }),
    cp(join(repositoryRoot, 'archive/content'), join(base, 'archive/content'), { recursive: true }),
    cp(join(repositoryRoot, 'archive/web/public'), join(base, 'archive/web/public'), { recursive: true }),
  ])
  return base
}

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

test('approved Operator draft applies exact revision and keeps machine-owned identity', async () => {
  const base = await fixture()
  try {
    const original = JSON.parse(await readFile(join(base, 'knowledge/content/briefs/K-012.json'), 'utf8'))
    const draft = {
      ...original,
      status: 'READY',
      publication_policy: 'HUMAN_APPROVED',
      semantic_qa_status: 'REVIEW',
      summary: '운영자가 직접 수정한 요약입니다.',
      lead: '운영자가 직접 수정한 도입입니다.',
      sections: [
        {
          heading: '운영자가 편집한 섹션',
          blocks: [
            { type: 'prose', text: '운영자가 직접 작성한 본문입니다.' },
            { type: 'image', src: 'https://example.gov/knowledge.webp', alt: '테스트 이미지', caption: '테스트 캡션' },
            { type: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', title: '테스트 영상' },
          ],
        },
      ],
    }
    let requestBody = null
    const result = await applyApprovedOperatorDraft({
      projectUrl: 'https://project.supabase.co',
      serviceRoleKey: 'server-key',
      jobId,
      revision: 4,
      draftSha256: draftSha,
      briefId: 'K-012',
      base,
      fetchImpl: async (url, init) => {
        assert.match(url, /archive_worker_knowledge_operator_draft$/)
        assert.equal(init.headers.apikey, 'server-key')
        requestBody = JSON.parse(init.body)
        return response({
          job_id: jobId,
          brief_id: 'K-012',
          candidate_id: 'KC-c03-afterfall-chapter-05-eef2645641',
          revision: 4,
          draft_sha256: draftSha,
          brief: draft,
        })
      },
    })

    assert.deepEqual(requestBody, { p_job_id: jobId, p_revision: 4, p_draft_sha256: draftSha })
    assert.equal(result.status, 'OPERATOR_DRAFT_APPLIED')
    const saved = JSON.parse(await readFile(join(base, 'knowledge/content/briefs/K-012.json'), 'utf8'))
    assert.equal(saved.id, original.id)
    assert.equal(saved.title, original.title)
    assert.equal(saved.slug, original.slug)
    assert.equal(saved.summary, draft.summary)
    assert.equal(saved.status, 'READY')
    assert.equal(saved.publication_policy, 'HUMAN_APPROVED')
    assert.equal(saved.semantic_qa_status, 'PASS')
    assert.equal(saved.sections[0].blocks[1].type, 'image')
    assert.equal(saved.sections[0].blocks[2].type, 'youtube')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('approved Operator draft refuses a mismatched immutable binding', async () => {
  const base = await fixture()
  try {
    await assert.rejects(
      applyApprovedOperatorDraft({
        projectUrl: 'https://project.supabase.co',
        serviceRoleKey: 'server-key',
        jobId,
        revision: 1,
        draftSha256: draftSha,
        briefId: 'K-012',
        base,
        fetchImpl: async () => response({
          job_id: jobId,
          brief_id: 'K-012',
          revision: 1,
          draft_sha256: 'e'.repeat(64),
          brief: {},
        }),
      }),
      /KNOWLEDGE_OPERATOR_DRAFT_BINDING_MISMATCH/,
    )
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})
