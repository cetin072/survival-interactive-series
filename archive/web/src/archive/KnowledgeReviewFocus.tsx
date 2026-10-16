import type { KnowledgeDraftBlock, KnowledgeDraftBrief } from './KnowledgeDraftEditor'

export type KnowledgeReviewTarget = {
  key: string
  heading: string
  reason: string
  sectionIndex?: number
  blockIndex?: number
  itemIndex?: number
  field?: 'lead' | 'basis' | 'scope'
}

const RULES: Record<string, { terms: string[]; explanation: string }> = {
  RIGHTS_AND_CUSTODY_REVIEW_REQUIRED: {
    terms: ['소유', '권한', '점유', '보관', '열쇠', '동의', '법적'],
    explanation: '자산의 소유·점유·사용·보관 권한은 일반 재난 지침만으로 확정되지 않습니다. 국내 기준과 당사자 동의 범위를 확인하세요.',
  },
  HIGH_RISK_SHELTER_CAPACITY: {
    terms: ['수용', '한계', '상한', '구조', '소방', '피난', '접근성'],
    explanation: '수용 인원을 단정하면 구조·소방·피난·접근성에 영향을 줍니다. 구체적인 수치와 국내 시설 기준을 확인하세요.',
  },
  HIGH_RISK_TRAVEL_STOP_CRITERIA: {
    terms: ['중단', '귀환', '한파', '기상', '복귀', '이동', '출발'],
    explanation: '출발·귀환·중단 판단은 기상·고립·공식 경보에 따라 달라집니다. 보편적인 안전 임계값처럼 단정한 부분이 없는지 확인하세요.',
  },
  FIRE_RESPONSE_HIGH_RISK: {
    terms: ['불꽃', '신고', '화재', '연기', '소방', '119', '대피'],
    explanation: '화재 현장 접근·직접 진압을 유도하지 않는지, 관찰·신고·대피 범위와 출처의 적용 대상을 확인하세요.',
  },
  RESTORATION_PRIORITIZATION_REQUIRES_EXPERT_REVIEW: {
    terms: ['우선', '복구', '요청', '인명', '급수', '긴급', '결정'],
    explanation: '인명·급수에 영향을 주는 실제 복구 우선순위는 자격과 관할이 필요합니다. 일반적인 기록 방법과 현장 의사결정을 구분하세요.',
  },
  AUTO_EVIDENCE_REQUIRES_HUMAN_REVIEW: {
    terms: ['근거', '확인', '안전', '범위', '판단', '역할', '조건'],
    explanation: '자동 게시 근거가 충분히 확정되지 않았습니다. 출처가 뒷받침하는 범위와 실제 적용 조건을 확인하세요. AI가 특정 오류 문장을 지목한 것은 아닙니다.',
  },
}

// Older archived human-review packages used legacy QA markers. Normalize only
// the editable operator copy to REVIEW; never mutate the pinned AI source or
// claim machine QA PASS before an explicit human approval.
export function normalizeHumanReviewDraft(brief: KnowledgeDraftBrief): KnowledgeDraftBrief {
  const copy = JSON.parse(JSON.stringify(brief)) as KnowledgeDraftBrief
  if (!['PASS', 'REVIEW'].includes(String(copy.semantic_qa_status ?? ''))) copy.semantic_qa_status = 'REVIEW'
  return copy
}

const FALLBACK = {
  terms: ['안전', '근거', '범위', '기준', '권한', '조건'],
  explanation: 'AI의 검토 대기 판정이 있습니다. 이 구간은 우선 확인 후보이며, 오류로 확정된 문장은 아닙니다. 원문과 출처를 대조하세요.',
}

function textFromBlock(block: KnowledgeDraftBlock): Array<{ text: string; itemIndex?: number }> {
  if (block.type === 'prose' || block.type === 'note') return [{ text: block.text }]
  if (block.type === 'ordered_list' || block.type === 'unordered_list') {
    return block.items.map((text, itemIndex) => ({ text, itemIndex }))
  }
  return []
}

// Existing BRIEF and Evidence remain the source of truth. This function
// recommends locations, never asserts that a sentence is factually wrong.
export function selectKnowledgeReviewTargets(
  brief: KnowledgeDraftBrief,
  reasonCode?: string | null,
  aiNote?: string | null,
): KnowledgeReviewTarget[] {
  const rule = RULES[reasonCode ?? ''] ?? FALLBACK
  const candidates: Array<KnowledgeReviewTarget & { score: number }> = []
  brief.sections.forEach((section, sectionIndex) => {
    if (/《생존일기》에서 시작한 질문|이 질문이 생긴 실제 경험/.test(section.heading)) return
    section.blocks.forEach((block, blockIndex) => {
      textFromBlock(block).forEach(({ text, itemIndex }) => {
        if (!text?.trim()) return
        const score = rule.terms.reduce((sum, term) => (
          sum + (section.heading.includes(term) ? 7 : 0) + (text.includes(term) ? 2 : 0)
        ), 0) + (aiNote?.includes(section.heading) ? 9 : 0)
        candidates.push({
          key: 's' + sectionIndex + '-b' + blockIndex + (itemIndex === undefined ? '' : '-i' + itemIndex),
          heading: section.heading + (itemIndex === undefined ? '' : ' · 항목 ' + (itemIndex + 1)),
          sectionIndex, blockIndex, itemIndex,
          reason: rule.explanation, score,
        })
      })
    })
  })
  candidates.sort((a, b) => b.score - a.score || (a.sectionIndex ?? 0) - (b.sectionIndex ?? 0) || (a.blockIndex ?? 0) - (b.blockIndex ?? 0))
  const selected: KnowledgeReviewTarget[] = candidates.slice(0, 2).map((item) => ({
    key: item.key, heading: item.heading, reason: item.reason,
    sectionIndex: item.sectionIndex, blockIndex: item.blockIndex, itemIndex: item.itemIndex,
  }))
  // Every held package needs evidence-scope verification, including LOW-risk
  // BRIEF_READY packages routed to a person's inbox by the publication gate.
  if (brief.basis?.trim()) selected.push({
    key: 'field:basis',
    heading: '근거·출처의 적용 범위',
    field: 'basis',
    reason: '이 문장의 근거·적용 범위가 실제 자료와 일치하는지 확인하세요. 미확인 사항은 단정하지 않아야 합니다.',
  })
  if (!selected.length && brief.lead?.trim()) selected.push({
    key: 'field:lead', heading: '첫 안내 문장', field: 'lead', reason: rule.explanation,
  })
  return selected
}

export function reviewTargetValue(brief: KnowledgeDraftBrief, target: KnowledgeReviewTarget): string {
  if (target.field) return String(brief[target.field] ?? '')
  const block = brief.sections[target.sectionIndex ?? -1]?.blocks[target.blockIndex ?? -1]
  if (!block) return ''
  if (block.type === 'prose' || block.type === 'note') return block.text
  if (block.type === 'ordered_list' || block.type === 'unordered_list') return block.items[target.itemIndex ?? 0] ?? ''
  return ''
}

export function editReviewTarget(
  brief: KnowledgeDraftBrief, target: KnowledgeReviewTarget, value: string,
): KnowledgeDraftBrief {
  const copy = JSON.parse(JSON.stringify(brief)) as KnowledgeDraftBrief
  if (target.field) {
    copy[target.field] = value
    return copy
  }
  const block = copy.sections[target.sectionIndex ?? -1]?.blocks[target.blockIndex ?? -1]
  if (!block) throw new Error('REVIEW_TARGET_MOVED')
  if (block.type === 'prose' || block.type === 'note') block.text = value
  else if (block.type === 'ordered_list' || block.type === 'unordered_list') block.items[target.itemIndex ?? 0] = value
  else throw new Error('REVIEW_TARGET_NOT_EDITABLE')
  return copy
}

export type KnowledgeEvidenceGate = {
  blockers: string[]
  unknowns: string[]
  conflicts: string[]
  copyrightStatus: string | null
  storySourceStatus: string | null
}

// Mirrors the existing human-approved release gates without overriding them.
// Machine-readable evidence is immutable here: no checkbox may silently erase
// an unresolved fact or invent copyright/Reader verification.
export function knowledgeEvidenceGate(result?: Record<string, unknown> | null): KnowledgeEvidenceGate {
  const ev = result?.evidence
  const evidence = ev && typeof ev === 'object' && !Array.isArray(ev) ? ev as Record<string, unknown> : {}
  const strs = (value: unknown): string[] => Array.isArray(value)
    ? value.map((entry) => typeof entry === 'string' ? entry : (JSON.stringify(entry) ?? '')).filter(Boolean)
    : []
  const unknowns = strs(evidence.unknowns)
  const conflicts = strs(evidence.conflicts)
  const copyrightStatus = typeof evidence.copyright_status === 'string' ? evidence.copyright_status : null
  const storySourceStatus = typeof evidence.story_source_status === 'string' ? evidence.story_source_status : null
  const blockers = []
  if (unknowns.length) blockers.push('확인되지 않은 근거 ' + unknowns.length + '건')
  if (conflicts.length) blockers.push('상충되는 근거 ' + conflicts.length + '건')
  if (copyrightStatus !== 'CLEAR') blockers.push('재사용 권한 검증 필요')
  if (!['VERIFIED_PUBLIC_READER_BACKFILL','VERIFIED_PUBLIC_ARCHIVE','USER_REPORTED_EXPERIENCE'].includes(storySourceStatus ?? '')) {
    blockers.push('원문 출처 상태 검증 필요')
  }
  return { blockers, unknowns, conflicts, copyrightStatus, storySourceStatus }
}

export function KnowledgeEvidenceGatePanel({ gate }: { gate: KnowledgeEvidenceGate }) {
  return <section className="knowledge-evidence-gate" aria-label="아직 해소되지 않은 출처 검증 항목">
    <h3>{gate.blockers.length ? '게시 안전검사에 남은 문제' : '근거 상태 사전점검'}</h3>
    {gate.blockers.length ? <>
      <p>아래 사항은 사람의 문장 검토와 별개입니다. 정확한 자료 확인 없이 모두 체크해도 게시할 수 없습니다. 현재 검토함은 원본 Evidence를 임의 변경하지 않습니다.</p>
      <ul>{gate.blockers.map((msg) => <li key={msg}>{msg}</li>)}</ul>
      {gate.unknowns.length > 0 && <details open>
        <summary>실제 미확인 항목 {gate.unknowns.length}건</summary>
        <ul>{gate.unknowns.map((msg, index) => <li key={index}>{msg}</li>)}</ul>
      </details>}
      {gate.conflicts.length > 0 && <details>
        <summary>충돌하는 출처 근거</summary>
        <ul>{gate.conflicts.map((msg, index) => <li key={index}>{msg}</li>)}</ul>
      </details>}
      <p className="operator-muted">우선 표시된 문장을 수정해 초안을 저장할 수 있습니다. 공개 승인은 이 항목들을 검증하고 기존 게시 검사 조건을 충족한 뒤에만 진행할 수 있습니다.</p>
    </> : <p>등록된 미해결 근거·저작권·원문 출처 차단은 없습니다. 최종 게이트와 원본 검수는 계속 적용됩니다.</p>}
  </section>
}

export function KnowledgeReviewFocus({
  brief, targets, aiNote, reasonCode, reviewed, disabled, onChange, onReview,
}: {
  brief: KnowledgeDraftBrief
  targets: KnowledgeReviewTarget[]
  aiNote?: string | null
  reasonCode?: string | null
  reviewed: Record<string, boolean>
  disabled: boolean
  onChange: (target: KnowledgeReviewTarget, text: string) => void
  onReview: (key: string, checked: boolean) => void
}) {
  const count = targets.filter((item) => reviewed[item.key]).length
  return <section className="knowledge-review-focus" aria-label="사람 검토 우선 구간">
    <header>
      <h2>사람 검토가 필요한 부분부터 확인</h2>
      <span>{count}/{targets.length}개 확인</span>
    </header>
    <p className="operator-muted">AI가 위험·근거 판정에 따라 추천한 우선 확인 구간입니다. 특정 문장에 오류가 있다는 뜻은 아닙니다. 실제 근거와 적용 조건을 직접 확인한 후 체크하세요.</p>
    {reasonCode && <small className="knowledge-review-code">검토 분류: {reasonCode}</small>}
    <ol className="knowledge-review-focus-list">
      {targets.map((target) => {
        const current = reviewTargetValue(brief, target)
        return <li key={target.key} className={reviewed[target.key] ? 'review-checked' : ''}>
          <h3>{target.heading}</h3>
          <p className="knowledge-review-quote"><mark>{current}</mark></p>
          <div className="knowledge-review-reason"><strong>AI가 확인을 요청한 이유</strong><p>{target.reason}</p>
            {aiNote && <p className="knowledge-review-original-reason"><b>AI 원본 판단:</b> {aiNote}</p>}
          </div>
          <label className="knowledge-review-edit">이 부분만 직접 수정
            <textarea rows={Math.min(9, Math.max(3, Math.ceil(current.length / 55)))} maxLength={10000}
              value={current} disabled={disabled}
              onChange={(event) => onChange(target, event.target.value)} />
          </label>
          <label className="knowledge-review-confirm">
            <input type="checkbox" checked={reviewed[target.key] === true} disabled={disabled || !current.trim()}
              onChange={(event) => onReview(target.key, event.target.checked)} />
            원문·근거를 확인했고, 필요한 수정까지 마쳤습니다
          </label>
        </li>
      })}
    </ol>
    {aiNote && <details className="knowledge-review-ai-note">
      <summary>AI가 남긴 전체 검토 사유</summary>
      <p>{aiNote}</p>
    </details>}
  </section>
}
