import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SafeMarkdown } from './SafeMarkdown'
import {
  bagDraftFileUrl,
  bagDraftIsApproved,
  bagDraftRows,
  loadBagDraftBody,
  loadBagDraftQueue,
  type BagDraftFilter,
  type BagDraftQueue,
  type BagDraftRow,
} from './bagDraftInbox'

export function OperatorBagDraftInbox() {
  const [queue, setQueue] = useState<BagDraftQueue | null>(null)
  const [filter, setFilter] = useState<BagDraftFilter>('PENDING')
  const [selected, setSelected] = useState<BagDraftRow | null>(null)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    ++requestId.current
    setSelected(null); setBody('')
    setBusy(true); setError('')
    try {
      setQueue(await loadBagDraftQueue())
    } catch {
      setQueue(null)
      setError('GitHub 원고 목록을 읽지 못했습니다. 연결 또는 API 호출 한도를 확인하세요.')
    } finally { setBusy(false) }
  }, [])

  useEffect(() => { void refresh(); return () => { ++requestId.current } }, [refresh])

  const rows = useMemo(() => queue ? bagDraftRows(queue, filter) : [], [queue, filter])
  const all = queue ? bagDraftRows(queue) : []
  const pendingCount = all.filter((item) => !bagDraftIsApproved(item.state)).length
  const approvedCount = all.length - pendingCount

  const openDraft = async (row: BagDraftRow) => {
    const request = ++requestId.current
    setSelected(row); setBody(''); setError(''); setReading(true)
    try {
      const draft = await loadBagDraftBody(row.id, row.file)
      if (request === requestId.current) setBody(draft)
    } catch {
      if (request === requestId.current) setError('원고 파일을 읽지 못했습니다. 잠시 후 새로고침하거나 GitHub 원본을 확인하세요.')
    } finally {
      if (request === requestId.current) setReading(false)
    }
  }

  return <section className="operator-panel bag-draft-inbox" aria-labelledby="bag-draft-heading">
    <header>
      <div>
        <p className="archive-eyebrow">BAG KNOWLEDGE · WRITING INBOX</p>
        <h2 id="bag-draft-heading">생존가방 물품지식 원고함</h2>
      </div>
      <button className="operator-secondary" disabled={busy} onClick={() => void refresh()}>
        {busy ? '목록 확인 중…' : '최신 원고 확인'}
      </button>
    </header>
    <p className="operator-muted">
      시간당 1편 집필한 글을 검수 대기와 무관하게 계속 쌓습니다.
      현재 원본은 기존 GitHub Draft PR #525에 보관되며, 여기에서는 읽기만 가능합니다.
      내용 검토 및 공개 게시는 별도 승인 후 진행합니다.
    </p>
    <div className="bag-draft-stats">
      <span>작성 <strong>{all.length} / {queue?.catalogTotal ?? 49}</strong></span>
      <span>검수·승인 대기 <strong>{pendingCount}</strong></span>
      <span>사용자 발행 승인 <strong>{approvedCount}</strong></span>
      <span>다음 원고 <strong>{queue?.nextCandidate ?? '확인 중'}</strong></span>
    </div>
    <div className="operator-heading-actions bag-draft-filters" role="group" aria-label="생존가방 원고 상태">
      {([
        ['PENDING', '검수 대기'],
        ['ALL', '전체 원고'],
        ['APPROVED', '발행 승인'],
      ] as const).map(([key, label]) =>
        <button key={key} className="operator-secondary" aria-pressed={filter === key}
          onClick={() => { setFilter(key); ++requestId.current; setSelected(null); setBody(''); setError(''); setReading(false) }}>{label}</button>)}
    </div>
    {error && <p role="alert" className="operator-error">{error}</p>}
    {!queue && !busy && <p className="operator-empty">목록을 불러오지 못했습니다. 기존 GitHub 원고는 삭제되지 않았습니다.</p>}
    {queue && rows.length === 0 && <p className="operator-empty">이 상태에 해당하는 원고가 없습니다.</p>}
    {queue && <div className="bag-draft-layout">
      <ul className="bag-draft-list">
        {rows.map((row) => <li key={row.id}>
          <button className="bag-draft-item" type="button" aria-pressed={selected?.id === row.id}
            onClick={() => void openDraft(row)}>
            <strong>{row.id} · {row.id === 'guide-43' ? '손전등' : '물품별 생존지식'}</strong>
            <span>{row.label}</span>
            <small>원고 읽기 →</small>
          </button>
        </li>)}
      </ul>
      <div className="bag-draft-detail" aria-live="polite">
        {!selected && <p className="operator-muted">왼쪽에서 원고를 선택하면 이 화면에서 본문을 확인할 수 있습니다.</p>}
        {selected && <>
          <header>
            <div>
              <p className="archive-eyebrow">{selected.id} · {selected.label}</p>
              <h3>검수용 원고</h3>
            </div>
            <a href={bagDraftFileUrl(selected.id, selected.file)} target="_blank" rel="noopener noreferrer">
              GitHub 원문 ↗
            </a>
          </header>
          {reading && <p className="operator-muted">원고를 불러오는 중…</p>}
          {body && <article className="bag-draft-body"><SafeMarkdown body={body} /></article>}
        </>}
      </div>
    </div>}
    <p className="operator-muted bag-draft-note">
      초안은 홈페이지·통합검색에 자동 게시되지 않습니다. 이 목록은 GitHub 내용을 로그인 후 조회하는
      운영자 화면이며, 원본 GitHub 저장소의 공개 여부를 바꾸지는 않습니다.
    </p>
  </section>
}
