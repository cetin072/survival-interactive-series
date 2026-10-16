import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { KnowledgeDraftBrief } from './KnowledgeDraftEditor'
import { KnowledgeEvidenceGatePanel, KnowledgeReviewFocus, editReviewTarget, knowledgeEvidenceGate, normalizeHumanReviewDraft, reviewTargetValue, selectKnowledgeReviewTargets } from './KnowledgeReviewFocus'

function example(): KnowledgeDraftBrief {
  return {
    id: 'K-025', title: '임시 거점의 수용 한계', summary: '정보', meta_description: '정보',
    lead: '현장의 상한을 고려한다', label: '예시', scope: '범위를 확인한다',
    basis: '미국 지침은 국내 건축·피난 법령 자체가 아니다.',
    footer: '신중히 확인한다', editorial_note: '원고', sections: [
      { heading: '현장 운영', blocks: [{ type: 'prose', text: '현장 인원은 사전에 기록한다.' }] },
      { heading: '수용 인원과 피난 한계', blocks: [{ type: 'prose', text: '시설의 수용 한계를 정하고 소방 기준을 확인한다.' }] },
      { heading: '출처와 확인 범위', blocks: [{ type: 'unordered_list', items: ['시설 담당 기관에 확인한다.', '출처를 재확인한다.'] }] },
      { heading: '《생존일기》에서 시작한 질문', blocks: [{ type: 'prose', text: '소설 속 거점' }] },
    ],
  }
}

describe('Knowledge focused human review', () => {
  it('highlights relevant source passages and a source-scope field without modifying the original', () => {
    const original = example()
    const targets = selectKnowledgeReviewTargets(original, 'HIGH_RISK_SHELTER_CAPACITY', '구조·소방·피난 확인')
    expect(targets.length).toBe(3)
    expect(targets[0].heading).toContain('수용 인원')
    expect(targets.some((v) => v.key === 'field:basis')).toBe(true)
    expect(targets.every((v) => !v.heading.includes('생존일기'))).toBe(true)
    const next = editReviewTarget(original, targets[0], '국내 기준을 확인하기 전에는 수용 인원을 단정하지 않는다.')
    expect(reviewTargetValue(next, targets[0])).toContain('단정하지 않는다')
    expect(reviewTargetValue(original, targets[0])).toContain('소방 기준')
  })

  it('can edit an individual list item without rewriting other items', () => {
    const original = example()
    const target = { key: 's2-b0-i0', heading: '출처와 확인 범위', reason: '대조', sectionIndex: 2, blockIndex: 0, itemIndex: 0 }
    const next = editReviewTarget(original, target, '현지 담당 기관 확인')
    expect(reviewTargetValue(next, target)).toBe('현지 담당 기관 확인')
    expect(next.sections[2].blocks).toEqual([{ type: 'unordered_list', items: ['현지 담당 기관 확인', '출처를 재확인한다.'] }])
    expect(original.sections[2].blocks).toEqual([{ type: 'unordered_list', items: ['시설 담당 기관에 확인한다.', '출처를 재확인한다.'] }])
  })

  it('does not claim a generic AUTO_EVIDENCE hold is a verified factual error', () => {
    const targets = selectKnowledgeReviewTargets(example(), 'AUTO_EVIDENCE_REQUIRES_HUMAN_REVIEW')
    expect(targets[0].reason).toContain('특정 오류 문장을 지목한 것은 아닙니다')
    expect(targets.some((v) => v.field === 'basis')).toBe(true)
  })

  it('normalizes only the legacy editable copy while keeping the original QA decision', () => {
    const original = { ...example(), semantic_qa_status: 'NEEDS_HUMAN_REVIEW' }
    const edited = normalizeHumanReviewDraft(original)
    expect(edited.semantic_qa_status).toBe('REVIEW')
    expect(original.semantic_qa_status).toBe('NEEDS_HUMAN_REVIEW')
    expect(normalizeHumanReviewDraft({ ...example(), semantic_qa_status: 'PASS' }).semantic_qa_status).toBe('PASS')
  })

  it('keeps unresolved machine evidence visible and blocks approval until its separate gate can validate', () => {
    const unresolved = knowledgeEvidenceGate({ evidence: {
      unknowns: ['현지 소방 정원 확인 필요', '동의 여부 불명'],
      conflicts: [], copyright_status: 'PUBLIC_OFFICIAL_SOURCE_SUMMARY',
      story_source_status: 'NARRATIVE_PROVENANCE_ONLY',
    } })
    expect(unresolved.blockers.length).toBe(3)
    expect(unresolved.unknowns).toContain('현지 소방 정원 확인 필요')
    const markup = renderToStaticMarkup(createElement(KnowledgeEvidenceGatePanel, { gate: unresolved }))
    expect(markup).toContain('현지 소방 정원 확인 필요')
    expect(markup).toContain('재사용 권한 검증 필요')
    expect(markup).toContain('사람의 문장 검토와 별개')
    const cleared = knowledgeEvidenceGate({ evidence: {
      unknowns: [], conflicts: [], copyright_status: 'CLEAR',
      story_source_status: 'VERIFIED_PUBLIC_ARCHIVE',
    } })
    expect(cleared.blockers).toHaveLength(0)
  })

  it('renders source text, an immediately following reason, and review checkboxes safely', () => {
    const source = example()
    const targets = selectKnowledgeReviewTargets(source, 'HIGH_RISK_SHELTER_CAPACITY', '전문가 확인 전 보류')
    const html = renderToStaticMarkup(createElement(KnowledgeReviewFocus, {
      brief: source, targets, reasonCode: 'HIGH_RISK_SHELTER_CAPACITY', aiNote: '전문가 확인 전 보류',
      reviewed: {}, disabled: false, onChange: () => {}, onReview: () => {},
    }))
    expect(html).toContain('<mark>')
    expect(html).toContain('AI가 확인을 요청한 이유')
    expect(html).toContain('이 부분만 직접 수정')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('오류가 있다는 뜻은 아닙니다')
    expect(html.indexOf('knowledge-review-reason')).toBeGreaterThan(html.indexOf('knowledge-review-quote'))
  })
})
