import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OperatorBagKnowledgeInbox } from './OperatorBagKnowledgeInbox'
import {
  BAG_QUEUE_PATH, BAG_WRITING_BRANCH, bagDraftLabel, checkedDraftFile,
  decodeGithubText, githubContentUrl, githubDraftWebUrl,
  joinBagReviewStates, parseBagDraft, readBagDraftQueue,
} from './bagKnowledgeDraftInbox'

const draft = (items: Record<string, { state: string; file: string; catalogName: string }>, next = 'guide-09') =>
  JSON.stringify({ catalogTotal: 49, nextCandidate: next, articles: items })
const record = (id: string, state: string) => ({
  state, file: `GUIDE_${id.slice(-2)}_DRAFT_V01.md`, catalogName: id === 'guide-08' ? '여벌 속옷' : '여벌 양말',
})

describe('Bag knowledge draft inbox boundary', () => {
  it('reads Unicode GitHub file content and refuses invalid blobs', () => {
    const raw = '생존가방 원고\n속옷과 양말'
    const content = btoa(String.fromCharCode(...new TextEncoder().encode(raw)))
    expect(decodeGithubText({ type: 'file', encoding: 'base64', content: content + '\n' })).toBe(raw)
    expect(() => decodeGithubText({ type: 'dir', encoding: 'base64', content })).toThrow('GITHUB_CONTENT_NOT_A_FILE')
  })
  it('restricts file names, branch references and external host', () => {
    expect(checkedDraftFile('guide-43', 'GUIDE_43_FLASHLIGHT_DRAFT_V01.md')).toBe('GUIDE_43_FLASHLIGHT_DRAFT_V01.md')
    expect(checkedDraftFile('guide-08', 'GUIDE_08_DRAFT_V01.md')).toBe('GUIDE_08_DRAFT_V01.md')
    expect(() => checkedDraftFile('guide-09', 'GUIDE_08_DRAFT_V01.md')).toThrow('INVALID_BAG_DRAFT_FILENAME')
    expect(() => checkedDraftFile('guide-50', 'GUIDE_50_DRAFT_V01.md')).toThrow('INVALID_BAG_DRAFT_ID')
    expect(() => githubContentUrl('../.env')).toThrow('INVALID_BAG_DRAFT_PATH')
    expect(() => githubContentUrl(BAG_QUEUE_PATH, 'private-feature')).toThrow('INVALID_BAG_DRAFT_REF')
    const url = new URL(githubContentUrl(BAG_QUEUE_PATH, BAG_WRITING_BRANCH))
    expect(url.hostname).toBe('api.github.com')
    expect(url.searchParams.get('ref')).toBe(BAG_WRITING_BRANCH)
    expect(githubDraftWebUrl('GUIDE_08_DRAFT_V01.md', 'guide-08')).toContain('/blob/feat/bag-side-item-knowledge-template-v1/')
  })
  it('does not treat drafting branch approval as publication permission', () => {
    const working = readBagDraftQueue(draft({
      'guide-08': record('guide-08', 'PENDING_INDEPENDENT_REVIEW'),
      'guide-09': record('guide-09', 'USER_APPROVED_FOR_PUBLICATION'),
    }))
    const noApproval = readBagDraftQueue(draft({}))
    const list = joinBagReviewStates(working, noApproval)
    expect(list.map(x => [x.id, x.published])).toEqual([['guide-08', false], ['guide-09', false]])
    expect(list[1].state).toBe('PENDING_INDEPENDENT_REVIEW')
    const approved = readBagDraftQueue(draft({ 'guide-09': record('guide-09', 'USER_APPROVED_FOR_PUBLICATION') }))
    const next = joinBagReviewStates(working, approved)
    expect(next[1].published).toBe(true)
    expect(next[0].published).toBe(false)
    expect(bagDraftLabel(next[0].state)).toBe('미검수 · 보관')
  })
  it('rejects malformed article metadata, mismatched ID and missing body', () => {
    const markdown = '---\ncatalogId: guide-08\ntitle: 여벌 속옷은 왜 생존가방에 필요할까?\n---\n# 여벌 속옷'
    expect(parseBagDraft(markdown, 'guide-08').content).toBe('# 여벌 속옷')
    expect(() => parseBagDraft(markdown, 'guide-09')).toThrow('BAG_DRAFT_ID_MISMATCH')
    expect(() => parseBagDraft('broken', 'guide-08')).toThrow('INVALID_BAG_DRAFT_FRONT_MATTER')
    expect(() => readBagDraftQueue(draft({ 'guide-08': record('guide-09', 'PENDING_INDEPENDENT_REVIEW') })))
      .toThrow('INVALID_BAG_DRAFT_FILENAME')
  })
  it('shows a separate read-only Operator shelf, not public publication controls', () => {
    const html = renderToStaticMarkup(createElement(OperatorBagKnowledgeInbox))
    expect(html).toContain('생존가방 원고 보관함')
    expect(html).toContain('검수 대기')
    expect(html).toContain('프론트엔드')
    expect(html).not.toContain('게시 승인하기')
    expect(html).not.toContain('USER_APPROVED_FOR_PUBLICATION')
    expect(html).not.toContain('api.github.com')
  })
})
