import { useEffect, useState } from 'react'
import {
  deploymentSites, deploymentSlot, deploymentCountdown, formatDeploymentTime, siteDeploymentSignal, siteWebChangeSignal,
  type SiteDeploymentObservation,
} from './siteDeploymentStatus'

export function OperatorSiteDeployments({ observations, refreshing = false, at }: {
  observations?: SiteDeploymentObservation[] | null; refreshing?: boolean; at?: number
}) {
  const [clock, setClock] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])
  const now = at ?? Math.max(clock, Date.now())
  const rows = deploymentSites.map((site) => ({ site, observation: observations?.find((o) => o.site.siteId === site.siteId) }))
  const schedules = rows.map(({ observation }) => observation?.policy ? deploymentSlot(observation.policy, now) : null)
  const common = schedules.every((s) => s && s.next === schedules[0]?.next)
    && rows.every(({ observation }) => observation?.policy?.schedule_anchor_utc === rows[0].observation?.policy?.schedule_anchor_utc)
  const lastChecked = observations?.map((o) => o.checkedAt).sort().at(-1)
  return <section className="operator-sites" aria-labelledby="operator-sites-title" aria-busy={refreshing}>
    <header><h2 id="operator-sites-title">주요 사이트 · 48시간 배포 현황</h2>
      <p className="operator-sites-next">가장 가까운 공통 정기 배포 <strong>{common ? formatDeploymentTime(schedules[0]!.next) : '일정 확인 필요'}</strong></p>
      <p className="operator-muted">한국시간 기준 · 정기 배포 기준 시각이며 실제 공개 시각은 달라질 수 있습니다. 상태 새로고침은 조회만 합니다.</p>
      <p className="operator-muted">마지막 데이터 확인 {formatDeploymentTime(lastChecked)} · 최대 2분 캐시</p>
    </header>
    <div className="operator-sites-grid">
      {rows.map(({ site, observation }, i) => {
        const execution = siteDeploymentSignal(observation, now)
        const web = siteWebChangeSignal(observation, now)
        // Explicit failure and a real in-progress Production build take priority.
        // A hidden historical cancellation reason does not override verified web differences.
        const priority = ['배포 실패·확인 필요', '배포 진행 중'].includes(execution.label)
        const headline = priority ? execution : web
        const slot = schedules[i]
        const run = observation?.scheduledRun
        const published = observation?.published
        return <article className="operator-site-card" key={site.siteId}>
          <div className="operator-system-title"><h3>{site.name}</h3><span className={`operator-status-badge ${headline.tone}`}>{headline.label}</span></div>
          <dl className="operator-site-times">
            <div><dt>최근 실제 배포</dt><dd>{formatDeploymentTime(published?.published_at)}</dd></div>
            <div><dt>다음 정기 배포</dt><dd>{formatDeploymentTime(slot?.next)}</dd></div>
          </dl>
          <p className="operator-site-countdown">{deploymentCountdown(slot?.next, now)}</p>
          {slot?.currentStart && <p className="operator-status-help">현재 배포 슬롯의 확인 허용 시간입니다. 예약 실행이 지연될 수 있습니다.</p>}
          {published && slot && Date.parse(slot.next) - Date.parse(published.published_at!) < 48 * 3_600_000
            && <p className="operator-status-help">최근 공개 후 최소 48시간 조건 때문에 다음 슬롯에서 배포를 건너뛸 수 있습니다.</p>}
          <div className="operator-site-main">
            <strong>웹 반영 상태</strong>
            <span>{web.label}</span>
            <p className="operator-status-help">{web.detail}</p>
          </div>
          <div className="operator-site-main">
            <strong>배포 실행 상태</strong>
            <span>{execution.label === '배포 대기' ? '다음 정기 배포 대기' : execution.label}</span>
            <p className="operator-status-help">{execution.detail}</p>
          </div>
          {refreshing && <p className="operator-muted" role="status">최신 상태를 조회하고 있습니다…</p>}
          <details className="operator-tech-details">
            <summary>기술 상세</summary>
            <dl className="operator-site-technical">
              <div><dt>Production commit SHA</dt><dd><code>{published?.commit_ref ?? '확인 불가'}</code></dd></div>
              <div><dt>최신 main commit SHA</dt><dd><code>{observation?.mainSha ?? '확인 불가'}</code></dd></div>
              <div><dt>최근 예약 실행</dt><dd>{formatDeploymentTime(run?.run_started_at ?? run?.created_at)} · <code>{run ? run.conclusion ?? run.status : '실행 기록 확인 안 됨'}</code></dd></div>
              <div><dt>Production 배포 ID</dt><dd><code>{published?.id ?? '확인 불가'}</code></dd></div>
              <div><dt>데이터 조회 시각</dt><dd>{formatDeploymentTime(observation?.checkedAt)}</dd></div>
              <div><dt>슬롯 허용 창</dt><dd>{observation?.policy?.schedule_window_hours ?? '확인 불가'}시간 · 공개 간격 최소 48시간</dd></div>
              <div><dt>조회 결과</dt><dd>{observation?.errors.length ? observation.errors.join(' / ') : observation ? '공개 API 조회 완료 · 최대 2분 캐시' : '아직 조회되지 않음'}</dd></div>
            </dl>
            <nav className="operator-site-links" aria-label={`${site.name} 배포 기술 링크`}>
              <a href={`https://github.com/${site.repository}/actions${run ? `/runs/${run.id}` : ''}`} target="_blank" rel="noreferrer">GitHub Actions</a>
              <a href={`https://app.netlify.com/projects/${site.site}/deploys${published ? `/${published.id}` : ''}`} target="_blank" rel="noreferrer">Netlify 사이트</a>
            </nav>
          </details>
        </article>
      })}
    </div>
    <p className="operator-muted">화면에 표시한 시각은 마지막 관측값입니다. 2분이 지난 상태는 다시 확인해야 합니다. 예약 실행 성공이나 저장소 병합만으로 공개 완료를 표시하지 않습니다.</p>
  </section>
}
