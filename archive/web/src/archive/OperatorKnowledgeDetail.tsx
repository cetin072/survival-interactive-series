import { useCallback, useEffect, useState } from 'react'
import { KnowledgeDraftEditor, KnowledgeDraftPreview, type KnowledgeDraftBrief } from './KnowledgeDraftEditor'
import { uploadKnowledgeImage } from './knowledgeMedia'
import {
  knowledgeBucketFor,
  knowledgeBucketLabel,
  knowledgeSourceLabel,
  type KnowledgeDetail,
} from './knowledgeOperatorModel'
import { formatOperatorTime } from './operatorSystemStatus'
import { supabaseClient } from './supabaseClient'

type DraftEnvelope = {
  job_id: string
  editable: boolean
  review_item_id?: string | null
  review_status?: string | null
  revision: number
  draft_sha256?: string | null
  updated_at?: string | null
  brief?: KnowledgeDraftBrief | null
}

const cloneBrief = (brief: KnowledgeDraftBrief) => JSON.parse(JSON.stringify(brief)) as KnowledgeDraftBrief

export function OperatorKnowledgeDetail({
  jobId,
  email,
  busy: parentBusy,
  onSignOut,
}: {
  jobId: string
  email?: string | null
  busy: boolean
  onSignOut: () => void
}) {
  const [selected, setSelected] = useState<KnowledgeDetail | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [draftBrief, setDraftBrief] = useState<KnowledgeDraftBrief | null>(null)
  const [draftRevision, setDraftRevision] = useState(0)
  const [draftEditable, setDraftEditable] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadDetail = useCallback(async () => {
    if (!supabaseClient) return
    setBusy(true); setError('')
    const [detailResponse, draftResponse] = await Promise.all([
      supabaseClient.rpc('archive_operator_knowledge_job_detail', { p_job_id: jobId }),
      supabaseClient.rpc('archive_operator_knowledge_draft_get', { p_job_id: jobId }),
    ])
    if (detailResponse.error) {
      setError('글감 상세를 불러오지 못했습니다.')
      setSelected(null)
    } else {
      const detail = detailResponse.data as KnowledgeDetail
      setSelected(detail)
      setReviewNote(detail.review_decision_note ?? '')
      if (!draftResponse.error && draftResponse.data) {
        const draft = draftResponse.data as DraftEnvelope
        setDraftBrief(draft.brief ? cloneBrief(draft.brief) : null)
        setDraftRevision(draft.revision ?? 0)
        setDraftEditable(draft.editable === true)
      } else {
        const resultBrief = detail.result?.brief as KnowledgeDraftBrief | undefined
        setDraftBrief(resultBrief ? cloneBrief(resultBrief) : null)
        setDraftRevision(0)
        setDraftEditable(false)
      }
      setEditing(false)
      setDraftDirty(false)
    }
    setBusy(false)
  }, [jobId])

  useEffect(() => { void loadDetail() }, [loadDetail])

  const decideReview = useCallback(async (decision: 'HOLD' | 'REJECTED') => {
    if (!supabaseClient || !selected?.review_item_id) return
    setBusy(true); setError('')
    const { error: decisionError } = await supabaseClient.rpc('archive_operator_decide_review_item', {
      p_item_id: selected.review_item_id,
      p_decision: decision,
      p_note: reviewNote.trim() || null,
    })
    if (decisionError) setError('검토 결정을 저장하지 못했습니다.')
    else await loadDetail()
    setBusy(false)
  }, [loadDetail, reviewNote, selected])

  const saveDraft = useCallback(async () => {
    if (!supabaseClient || !selected || !draftBrief || !draftEditable) return
    setBusy(true); setSavingDraft(true); setError('')
    const { data, error: saveError } = await supabaseClient.rpc('archive_operator_knowledge_draft_save', {
      p_job_id: selected.job_id,
      p_expected_revision: draftRevision,
      p_draft_brief: draftBrief,
    })
    if (saveError) {
      setError(saveError.message.includes('REVISION_CONFLICT')
        ? '다른 편집본이 먼저 저장되었습니다. 새로고침 후 다시 확인하세요.'
        : '초안을 저장하지 못했습니다. 필수 항목과 미디어 URL을 확인하세요.')
    } else {
      const saved = data as { revision: number; brief: KnowledgeDraftBrief }
      setDraftRevision(saved.revision)
      setDraftBrief(cloneBrief(saved.brief))
      setDraftDirty(false)
      setEditing(false)
    }
    setSavingDraft(false); setBusy(false)
  }, [draftBrief, draftEditable, draftRevision, selected])

  const uploadDraftImage = useCallback(async (file: File) => {
    if (!supabaseClient || !selected) throw new Error('KNOWLEDGE_IMAGE_EDITOR_NOT_READY')
    return uploadKnowledgeImage(supabaseClient, selected.job_id, file)
  }, [selected])

  const publishDraft = useCallback(async () => {
    if (!supabaseClient || !selected || draftRevision < 1 || draftDirty) return
    setBusy(true); setError('')
    const { error: publishError } = await supabaseClient.rpc('archive_operator_knowledge_publish', {
      p_job_id: selected.job_id,
      p_expected_revision: draftRevision,
      p_note: reviewNote.trim() || null,
    })
    if (publishError) setError('공개 승인을 저장하지 못했습니다. 최신 초안 저장 상태를 확인하세요.')
    else await loadDetail()
    setBusy(false)
  }, [draftDirty, draftRevision, loadDetail, reviewNote, selected])

  return <section className="operator-page knowledge-detail-page">
    <header className="operator-heading">
      <div>
        <p className="archive-eyebrow">SURVIVAL DIARY · KNOWLEDGE DETAIL</p>
        <h1>{selected?.title ?? selected?.brief_id ?? 'Knowledge 글감'}</h1>
        <p>{email} · 이 페이지에서 글을 읽고, 검토 대상이면 편집·미디어 추가·공개 승인을 처리합니다.</p>
      </div>
      <div className="operator-heading-actions">
        <a className="operator-secondary" href="/operator/knowledge/">← Knowledge Inbox</a>
        <a className="operator-secondary" href="/operator/">대시보드</a>
        <button className="operator-secondary" disabled={parentBusy || busy} onClick={onSignOut}>로그아웃</button>
      </div>
    </header>

    {error && <p className="operator-error" role="alert">{error}</p>}
    {busy && !selected && <section className="operator-panel"><p className="operator-muted" aria-live="polite">글을 불러오는 중…</p></section>}
    {!busy && !selected && !error && <section className="operator-panel"><p className="operator-empty">해당 글감을 찾을 수 없습니다.</p></section>}

    {selected && <section className="operator-panel operator-detail knowledge-operator-detail knowledge-detail-card">
      <div className="knowledge-detail-status">
        <span>{knowledgeBucketLabel[knowledgeBucketFor(selected)]}</span>
        <span>{selected.result_decision ?? selected.status}</span>
        <span>{selected.risk_level ?? '위험도 미정'}</span>
      </div>

      {selected.note && <p>{selected.note}</p>}
      <dl>
        <div><dt>Candidate</dt><dd>{selected.candidate_id ?? '아직 미작성'}</dd></div>
        <div><dt>BRIEF</dt><dd>{selected.brief_id ?? '아직 미작성'}</dd></div>
        <div><dt>원본 유형</dt><dd>{knowledgeSourceLabel(selected.source_kind)}</dd></div>
        <div><dt>준비</dt><dd>{formatOperatorTime(selected.prepared_at)}</dd></div>
        <div><dt>제출</dt><dd>{formatOperatorTime(selected.submitted_at)}</dd></div>
        <div><dt>PR</dt><dd>{selected.final_pr_number ? `#${selected.final_pr_number}` : '—'}</dd></div>
        <div><dt>차단 코드</dt><dd>{selected.code ?? selected.blocker_code ?? '없음'}</dd></div>
        <div><dt>사람 검토</dt><dd>{selected.review_status ?? (selected.status === 'HUMAN_REVIEW' ? '검토 항목 준비 중' : '해당 없음')}</dd></div>
      </dl>

      {draftBrief && <>
        <div className="knowledge-draft-toolbar">
          <div>
            <strong>{draftEditable ? '편집 가능한 완성 초안' : '글 미리보기'}</strong>
            <small>{draftRevision > 0 ? `사람 편집본 r${draftRevision}` : 'AI 원본'}</small>
          </div>
          {draftEditable && <div>
            <button className="operator-secondary" disabled={busy} onClick={() => setEditing((value) => !value)}>{editing ? '미리보기' : '편집'}</button>
            <button type="button" disabled={busy || (!draftDirty && draftRevision > 0)} onClick={() => void saveDraft()}>{savingDraft ? '저장 중…' : '초안 저장'}</button>
          </div>}
        </div>

        {editing && draftEditable
          ? <KnowledgeDraftEditor
              brief={draftBrief}
              disabled={busy}
              onChange={(next) => { setDraftBrief(next); setDraftDirty(true) }}
              onUploadImage={uploadDraftImage}
            />
          : <KnowledgeDraftPreview brief={draftBrief} />}

        {draftEditable && <div className="operator-decision knowledge-publication-decision">
          <label>검토 메모<textarea maxLength={1000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label>
          <div>
            <button disabled={busy || draftRevision < 1 || draftDirty} onClick={() => void publishDraft()}>공개 승인</button>
            <button className="operator-secondary" disabled={busy} onClick={() => void decideReview('HOLD')}>보류</button>
            <button className="operator-danger" disabled={busy} onClick={() => void decideReview('REJECTED')}>거절</button>
          </div>
          <p className="operator-muted">공개 승인은 저장된 정확한 편집본 revision에 묶입니다. 이후 기존 C3가 계약 검증·PR·CI·exact-head 병합을 수행하고 Production은 기존 배치 정책을 따릅니다.</p>
          {draftRevision < 1 && <p className="operator-muted">한 번 이상 초안을 저장해야 공개 승인할 수 있습니다. 수정 없이 검토를 마쳤다면 원문을 그대로 초안 저장할 수 있습니다.</p>}
          {draftDirty && <p className="operator-muted">저장되지 않은 수정이 있습니다. 먼저 초안 저장을 눌러주세요.</p>}
        </div>}
      </>}

      {!draftBrief && <p className="operator-empty">이 항목은 완성 BRIEF가 없는 HOLD/BLOCKED 기록입니다. 감사 기록으로 보관되며 편집 대상으로 승격하지 않습니다.</p>}

      {selected.review_status && selected.review_status !== 'PENDING' && <p className="operator-muted">검토 결과: {selected.review_status}{selected.review_decision_note ? ` · ${selected.review_decision_note}` : ''}</p>}

      <details><summary>기술 상세 · 원본 경로</summary><pre>{selected.source_ref ?? '—'}</pre></details>
      <details><summary>Prepared context</summary><pre>{JSON.stringify(selected.context, null, 2)}</pre></details>
      <details><summary>AI 원본 · Candidate / Evidence / BRIEF</summary><pre>{JSON.stringify(selected.result, null, 2)}</pre></details>
    </section>}
  </section>
}
