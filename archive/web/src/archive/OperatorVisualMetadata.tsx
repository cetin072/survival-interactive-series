import { recordVisualProfiles } from './recordVisualProfile'
import { siteVisualFor } from './siteVisual'

const typeLabel: Record<string, string> = {
  character: '인물',
  location: '지역',
  event: '사건',
  reference: '자료',
}

export function OperatorVisualMetadata() {
  const profiles = recordVisualProfiles()

  return <section className="operator-panel operator-visual-metadata">
    <header>
      <div>
        <p className="archive-eyebrow">VISUAL METADATA</p>
        <h2>시각 제작 메타</h2>
      </div>
      <strong>{profiles.length}건</strong>
    </header>
    <p className="operator-muted">공개 Wiki에서는 숨기고, 이미지 제작과 운영 검수에만 사용하는 설명·렌더 큐·정책·출처를 모아 봅니다.</p>
    <div className="operator-visual-list">
      {profiles.map((profile) => {
        const asset = siteVisualFor(profile.node_id)
        return <details key={profile.node_id}>
          <summary>
            <span><strong>{profile.label}</strong><small>{typeLabel[profile.type] ?? profile.type} · {profile.node_id}</small></span>
            <span>{asset ? '삽화 있음' : '삽화 없음'}</span>
          </summary>
          <div className="operator-visual-body">
            <p>{profile.description}</p>
            <dl>
              <div><dt>정책</dt><dd><code>{profile.canon_policy}</code></dd></div>
              <div><dt>출처 메모</dt><dd>{profile.source_note}</dd></div>
              <div><dt>목록 설명</dt><dd>{profile.list_description}</dd></div>
              <div><dt>공개 삽화</dt><dd>{asset ? `${asset.public_path}${asset.canon_status ? ` · ${asset.canon_status}` : ''}` : '없음'}</dd></div>
            </dl>
            <h3>이미지 제작 참고</h3>
            <ul>{profile.render_cues.map((cue) => <li key={cue}>{cue}</li>)}</ul>
          </div>
        </details>
      })}
    </div>
  </section>
}
