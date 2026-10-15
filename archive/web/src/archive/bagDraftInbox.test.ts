import { describe, expect, it } from 'vitest'
import {
  BAG_DRAFT_BRANCH,
  bagDraftFileUrl,
  bagDraftFileValid,
  bagDraftIsApproved,
  bagDraftRows,
  decodeBagGithubContent,
  loadBagDraftBody,
  loadBagDraftQueue,
  parseBagDraftQueue,
} from './bagDraftInbox'

const fixture = {
  catalogTotal: 49,
  nextCandidate: 'guide-09',
  articles: {
    'guide-01': { state: 'USER_APPROVED_FOR_PUBLICATION', file: 'GUIDE_01_WATERPROOF_DOCUMENT_POUCH_DRAFT_V01.md' },
    'guide-08': { state: 'PENDING_INDEPENDENT_REVIEW', file: 'GUIDE_08_DRAFT_V01.md' },
    'guide-43': { state: 'USER_APPROVED_FOR_PUBLICATION', file: 'GUIDE_43_FLASHLIGHT_DRAFT_V01.md' },
  },
}
function encoded(text: string) {
  return { type: 'file', encoding: 'base64', content: btoa(String.fromCharCode(...new TextEncoder().encode(text))) }
}
const mockFetch = (text: string) =>
  (async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(encoded(text)), {
    status: 200, headers: { 'content-type': 'application/json' },
  })) as typeof fetch

describe('Bag draft inbox read-only viewer', () => {
  it('reads UTF-8 draft manifests and preserves exact statuses', async () => {
    const parsed = await loadBagDraftQueue(mockFetch(JSON.stringify(fixture)))
    expect(parsed.catalogTotal).toBe(49)
    expect(bagDraftRows(parsed, 'ALL').map((r) => r.id)).toEqual(['guide-01', 'guide-08', 'guide-43'])
    expect(bagDraftRows(parsed, 'PENDING').map((r) => r.catalogName)).toEqual(['여벌 속옷'])
    expect(bagDraftRows(parsed, 'APPROVED')).toHaveLength(2)
    expect(bagDraftIsApproved('PENDING_INDEPENDENT_REVIEW')).toBe(false)
  })

  it('removes only editorial front matter for the authenticated viewer', async () => {
    const markdown = '---\ncontentType: bag-item-knowledge\ncatalogId: guide-08\nstatus: DRAFT_NEEDS_INDEPENDENT_REVIEW\n---\n# 여벌 속옷\n\n**도입부**'
    const content = await loadBagDraftBody('guide-08', 'GUIDE_08_DRAFT_V01.md', mockFetch(markdown))
    expect(content).toBe('# 여벌 속옷\n\n**도입부**')
    expect(content).not.toContain('DRAFT_NEEDS_INDEPENDENT_REVIEW')
  })

  it('does not accept path traversal, wrong item IDs or source substitution', async () => {
    expect(bagDraftFileValid('guide-08', 'GUIDE_08_DRAFT_V01.md')).toBe(true)
    expect(bagDraftFileValid('guide-08', 'GUIDE_09_DRAFT_V01.md')).toBe(false)
    expect(bagDraftFileValid('guide-08', '../../.env')).toBe(false)
    expect(() => bagDraftFileUrl('guide-08', '../file')).toThrow('INVALID_BAG_DRAFT_FILE')
    expect(() => parseBagDraftQueue(JSON.stringify({ ...fixture, articles: { 'guide-08': { file: '../secret', state: 'PENDING_INDEPENDENT_REVIEW' } } }))).toThrow('BAG_DRAFT_QUEUE_INVALID')
    await expect(loadBagDraftBody('guide-08', 'GUIDE_08_DRAFT_V01.md',
      mockFetch('---\ncontentType: bag-item-knowledge\ncatalogId: guide-09\n---\n# Wrong'))).rejects.toThrow('BAG_DRAFT_ID_MISMATCH')
  })

  it('never bundles manuscript content, credentials or an approval/publish endpoint', () => {
    expect(BAG_DRAFT_BRANCH).toBe('feat/bag-side-item-knowledge-template-v1')
    expect(decodeBagGithubContent(encoded('비상가방 지식'))).toBe('비상가방 지식')
    expect(() => decodeBagGithubContent({ content: 'abc', encoding: 'utf8', type: 'file' })).toThrow()
  })

  it('keeps GitHub network failures distinct from a successful empty inbox', async () => {
    const errorFetch = (async () => new Response('blocked', { status: 403 })) as typeof fetch
    await expect(loadBagDraftQueue(errorFetch)).rejects.toThrow('GITHUB_RATE_LIMIT_OR_DENIED')
    const malformed = { ...fixture, articles: null }
    expect(() => parseBagDraftQueue(JSON.stringify(malformed))).toThrow('BAG_DRAFT_QUEUE_INVALID')
  })
})
