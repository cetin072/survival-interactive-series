import { useCallback, useEffect, useState } from 'react'
import { supabaseClient } from './supabaseClient'
import { formatOperatorTime, statusWithKorean } from './operatorSystemStatus'

type VaultItem = {
  job_id: string
  object_path: string
  vault_status: string
  archived_at: string | null
  expires_at: string | null
  created_at: string
  subject_id: string
  title: string
  date_kst: string
  attempt_no: number
  review_decision: string | null
  review_summary: string | null
  rejection_codes: string[]
  output_bytes: number | null
  output_width: number | null
  output_height: number | null
  prompt_text: string
}

const bucket = 'survival-illustration-vault'
const sizeText = (value?: number | null) => value ? `${(value / 1024 / 1024).toFixed(2)} MB` : '—'

export function OperatorIllustrationVault({
  email,
  busy: outerBusy,
  onSignOut,
}: {
  email?: string
  busy: boolean
  onSignOut: () => void
}) {
  const [items, setItems] = useState<VaultItem[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!supabaseClient) return
    const client = supabaseClient
    setBusy(true); setError('')
    const { data, error: rpcError } = await client.rpc('archive_operator_illustration_vault', { p_limit: 100 })
    if (rpcError) {
      setError('보관함을 불러오지 못했습니다.')
      setBusy(false)
      return
    }
    const next = (data ?? []) as VaultItem[]
    setItems(next)

    const stored = next.filter((item) => item.vault_status === 'STORED' && item.object_path)
    const signed = await Promise.all(stored.map(async (item) => {
      const { data: signedData, error: signedError } = await client.storage
        .from(bucket)
        .createSignedUrl(item.object_path, 300)
      return [item.job_id, signedError ? '' : signedData?.signedUrl ?? ''] as const
    }))
    setUrls(Object.fromEntries(signed.filter(([, url]) => url)))
    setBusy(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  return <section className="operator-page">
    <header className="operator-heading">
      <div>
        <p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p>
        <h1>일러스트 보관함</h1>
        <p>{email} · Automation B가 생성한 원본을 판정과 관계없이 30일 동안 보관합니다.</p>
      </div>
      <div className="operator-heading-actions">
        <a className="operator-secondary" href="/operator/">대시보드로 돌아가기</a>
        <a className="operator-secondary" href="/operator/visuals/">시각 제작 메타</a>
        <button className="operator-secondary" disabled={outerBusy || busy} onClick={onSignOut}>로그아웃</button>
      </div>
    </header>

    {error && <p className="operator-error" role="alert">{error}</p>}
    <section className="operator-panel">
      <header>
        <div><p className="archive-eyebrow">30-DAY PRIVATE VAULT</p><h2>보관 중인 생성물</h2></div>
        <button className="operator-secondary" disabled={busy} onClick={() => void refresh()}>{busy ? '불러오는 중…' : '새로고침'}</button>
      </header>
      {!items.length && !busy && <p className="operator-empty">현재 보관 중인 일러스트가 없습니다.</p>}
      <div className="operator-visual-list">
        {items.map((item) => <details key={item.job_id}>
          <summary>
            <span>
              <strong>{item.title}</strong>
              <small>{item.date_kst} · attempt {item.attempt_no} · {item.subject_id}</small>
            </span>
            <span>{statusWithKorean(item.review_decision ?? item.vault_status)}</span>
          </summary>
          <div className="operator-visual-body">
            {urls[item.job_id]
              ? <img
                  src={urls[item.job_id]}
                  alt={`${item.title} Automation B 생성물`}
                  loading="lazy"
                  style={{ display: 'block', width: '100%', maxWidth: 720, height: 'auto', borderRadius: 12, marginBottom: 16 }}
                />
              : <p className="operator-muted">Storage 이동 대기 중이거나 미리보기를 불러오지 못했습니다.</p>}
            <dl>
              <div><dt>판정</dt><dd>{item.review_decision ? statusWithKorean(item.review_decision) : '검수 전'}</dd></div>
              <div><dt>보관 상태</dt><dd>{item.vault_status}</dd></div>
              <div><dt>보관 시각</dt><dd>{formatOperatorTime(item.archived_at)}</dd></div>
              <div><dt>자동 삭제 예정</dt><dd>{formatOperatorTime(item.expires_at)}</dd></div>
              <div><dt>원본 크기</dt><dd>{sizeText(item.output_bytes)} · {item.output_width ?? '—'}×{item.output_height ?? '—'}</dd></div>
              <div><dt>검수 요약</dt><dd>{item.review_summary ?? '—'}</dd></div>
              <div><dt>탈락 코드</dt><dd>{item.rejection_codes?.length ? item.rejection_codes.join(', ') : '없음'}</dd></div>
            </dl>
            <details>
              <summary>생성 프롬프트</summary>
              <p style={{ whiteSpace: 'pre-wrap' }}>{item.prompt_text}</p>
            </details>
          </div>
        </details>)}
      </div>
    </section>
    <p className="operator-muted">30일이 지나면 보관함 Storage 원본은 Program Prep이 자동 삭제합니다. PASS된 이미지는 기존 영구 원본·Registry·공개 사이트 흐름에 별도로 남습니다.</p>
  </section>
}
