import type { ReactNode } from 'react'
import { assessRoadmapBuild, type RoadmapDeployMeta, type RoadmapRelease } from './operatorRoadmapEvidence'
import { buildRoadmap, kstCalendarDate, years, ROADMAP_ISSUE, ROADMAP_STRATEGY, type EvidenceState, type RoadmapLog } from './operatorRoadmapModel'
import './operatorRoadmap.css'

const stateLabel=(state:EvidenceState):string=>
  state==='REVIEWED'?'근거 검수 완료':
  state==='RECORDED'?'조사 기록 있음':
  state==='DRAFT'?'잠정 초안':
  state==='WORKING'?'진행 기록':
  state==='UNAVAILABLE'?'조회 필요':'완료 근거 없음'
const stateClass=(state:EvidenceState):string=>
  state==='REVIEWED'||state==='RECORDED'?'recorded':
  state==='DRAFT'?'draft':state==='WORKING'?'working':'pending'
function RoadmapTile({eyebrow,value,help}: {eyebrow:string;value:ReactNode;help:string}) {
  return <div className="roadmap-tile"><span>{eyebrow}</span><strong>{value}</strong><small>{help}</small></div>
}

export function OperatorRoadmap({
  logs, error='', today=kstCalendarDate(new Date()),
  buildEvidence=null, deployMeta=null, releaseMeta=null, hostname='', evidenceError='',
}: {
  logs?:RoadmapLog[]|null; error?:string; today?:string
  buildEvidence?:unknown; deployMeta?:RoadmapDeployMeta|null; releaseMeta?:RoadmapRelease|null; hostname?:string; evidenceError?:string
}) {
  const roadmap=buildRoadmap(logs??null,today)
  const {calendar,days,stats}=roadmap
  const currentYear=calendar.currentYear
  const currentWeek=calendar.currentWeek
  const artifactProof=assessRoadmapBuild(buildEvidence,deployMeta,releaseMeta,hostname)
  return <section className="operator-roadmap" id="operator-roadmap" aria-labelledby="operator-roadmap-title">
    <div className="roadmap-header">
      <div><p className="roadmap-kicker">생존일기 · 전체 로드맵</p>
        <h2 id="operator-roadmap-title">지금 어디까지 왔을까?</h2>
        <p>최종 목적은 실제 벙커. 생존지식·사용자 행동·사업과 기술을 5년에 걸쳐 축적합니다.</p>
      </div>
      <a href="/operator/bunker-os/" className="roadmap-journal-link">감독 작업일지 보기 →</a>
    </div>
    <div className="roadmap-summary">
      <RoadmapTile eyebrow="장기 여정" value={currentYear?'5년 중 '+currentYear+'년차':'5년 계획'} help={currentYear?'지금은 '+years[currentYear-1].title:'시작 전 또는 기간 종료 · 결과 확인 필요'}/>
      <RoadmapTile eyebrow="첫 30일 실험" value={calendar.isMonthActive?'Day '+calendar.monthDay+' / 30':calendar.monthPeriod==='AFTER'?'결과 검토 시점':calendar.monthPeriod==='BEFORE'?'시작 전':'확인 필요'} help={currentWeek?'현재 '+currentWeek+'주차 · 달력 위치':'달력 위치와 성과는 별개'}/>
      <RoadmapTile eyebrow="1주차 확인된 조사" value={logs===null?'조회 대기':stats.recorded+' / 7건'} help={logs===null?'로그 연결 후 표시': '기록 '+stats.recorded+' · 초안 '+stats.draft+' · 진행 '+stats.active}/>
    </div>
    <div className="roadmap-time-track">
      <div className="roadmap-track-title"><strong>Month 01 · 돈이 생길 수 있는 엔진 찾기</strong><small>기간 {calendar.today} · 날짜 기준 진행 {calendar.monthCalendarPercent}%</small></div>
      <div className="roadmap-calendar-bar" role="progressbar" aria-label="첫 30일 달력 진행" aria-valuemin={0} aria-valuemax={30} aria-valuenow={calendar.monthDay}><span style={{width:String(calendar.monthCalendarPercent)+'%'}}/></div>
      <p>날짜 진행률은 목표 달성률이 아닙니다. 검증 결과가 없으면 완료로 바뀌지 않습니다.</p>
    </div>
    <ol className="roadmap-year-track" aria-label="5년 로드맵">
      {years.map(year=><li key={year.year} className={year.year===currentYear?'current':''} aria-current={year.year===currentYear?'step':undefined}>
        <span>{year.year}년차</span><strong>{year.title}</strong><small>{year.description}</small>
      </li>)}
    </ol>
    <div className="roadmap-subheading"><h3>첫 달 · 4주 계획</h3><a href={ROADMAP_ISSUE} target="_blank" rel="noreferrer noopener">원본 실행계획 #501 ↗</a></div>
    <ol className="roadmap-week-track">
      {roadmap.weeks.map(week=><li key={week.index} className={week.index===currentWeek?'current':''}>
        <span>W{week.index} · {week.start.slice(5).replace('-','/')}-{week.end.slice(5).replace('-','/')}</span>
        <strong>{week.title}</strong><small>{week.goal}</small>
        <em className={'roadmap-state '+stateClass(week.state)}>{stateLabel(week.state)}</em>
      </li>)}
    </ol>
    <div className="roadmap-next">
      <span className="roadmap-next-dot" aria-hidden="true"/>
      <p><strong>다음 우선 작업</strong>
        <span>{logs===null?'작업일지 연결을 확인하고 현재 상태를 불러오세요':
          roadmap.upcoming?'Day '+roadmap.upcoming.day+' · '+roadmap.upcoming.title+' — '+stateLabel(roadmap.upcoming.state):
          '1주차 7개 작업에 확인된 근거가 있습니다. 2주차 실험의 실제 성과를 이어 확인하세요.'}</span>
      </p>
      <a href={ROADMAP_ISSUE} target="_blank" rel="noreferrer noopener">할 일 원문 ↗</a>
    </div>
    <section className="roadmap-build-evidence" aria-labelledby="roadmap-build-heading">
      <div className="roadmap-build-head">
        <h3 id="roadmap-build-heading">사이트 산출물 자동 확인</h3>
        <span className={'roadmap-delivery-status '+(artifactProof.surface==='PRODUCTION_BUILD'?'verified':artifactProof.surface==='PREVIEW_BUILD'?'preview':'unknown')}>{artifactProof.label}</span>
      </div>
      <div className="roadmap-build-grid">
        {artifactProof.artifacts.map(artifact=><article key={artifact.id}>
          <span>{artifact.title}</span>
          <strong>{artifact.state==='UNKNOWN'?'확인 필요':
            artifact.count!==null?artifact.count+'개 · '+(artifact.present?'파일 확인':'빌드에 없음'):
            artifact.present?'파일 확인':'빌드에 없음'}</strong>
        </article>)}
      </div>
      <p className="roadmap-engagement-state">실제 준비 행동은 별도 계측 대기 · 설치·클릭·완료·재방문을 혼동하지 않습니다.</p>
      {evidenceError && <p className="roadmap-load-error" role="alert">{evidenceError}</p>}
      <details className="roadmap-build-info">
        <summary>출처·배포 검증 범위</summary>
        <p>{artifactProof.explanation}</p>
        <p>증거 원본: 동일 배포의 출력 파일 · GitHub PR/CI/merge는 별도 검증 대상</p>
        {artifactProof.commitRef && <p>사이트 빌드 커밋: <code>{artifactProof.commitRef.slice(0,12)}</code></p>}
        <p>연결된 공개 글의 수만 보여주며 초안, 검색엔진 색인, 품목별 독립 검수 통과율은 추정하지 않습니다.</p>
      </details>
    </section>
    {error&&<p role="alert" className="roadmap-load-error">{error}</p>}
    <details className="roadmap-evidence-details">
      <summary>1주차 작업 7개와 완료 근거 보기</summary>
      <ol>{days.map(item=><li key={item.day}><span>Day {item.day} · {item.title}</span><strong className={'roadmap-state '+stateClass(item.state)}>{stateLabel(item.state)}</strong></li>)}</ol>
      <p>기존 Bunker OS 운영 기록을 로그인 후 읽어 자동 갱신합니다. 현재 '조사 기록'은 원고·사업성과·Production 배포까지 검증됐다는 뜻이 아닙니다.</p>
    </details>
    <div className="roadmap-footer"><span>출처: <a href={ROADMAP_STRATEGY} target="_blank" rel="noreferrer noopener">5년 전략 #500</a> · <a href={ROADMAP_ISSUE} target="_blank" rel="noreferrer noopener">30일 실행계획 #501</a> · 기존 Bunker OS 감독 기록</span>
      <span>{logs===null?'운영 기록 조회 전':roadmap.latestLogAt?'기록 기준 '+new Date(roadmap.latestLogAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'월간 기록 없음'} · 새로고침 시 다시 확인</span>
    </div>
  </section>
}
