import type { ReactNode } from 'react'
import { buildRoadmap, kstCalendarDate, years, ROADMAP_ISSUE, ROADMAP_STRATEGY, type EvidenceState, type RoadmapLog, roadmapDocuments, roadmapStage, stageEvidence, gateEvidenceUrl } from './operatorRoadmapModel'
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
  logs=null, error='', today=kstCalendarDate(new Date()),
}: {
  logs?:RoadmapLog[]|null; error?:string; today?:string
}) {
  if(error)logs=null
  const roadmap=buildRoadmap(logs,today)
  const stage=roadmapStage(typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('stage'))
  const stageHref=(value:string)=>'/operator/?stage='+value+'#operator-roadmap'
  const selected=stage?.split('-')
  const index=Number(selected?.[1])
  const target=selected?.[0]==='year'?years[index-1]:selected?.[0]==='week'?roadmap.weeks[index-1]:selected?.[0]==='day'?roadmap.days[index-1]:null
  const evidence=stage?stageEvidence(logs,stage):[]
  const nextActions=evidence.flatMap(log=>{
    const items=(log.details as {next_actions?:unknown}|null)?.next_actions
    return Array.isArray(items)?items.filter((item):item is string=>typeof item==='string'):[]
  })

  const {calendar,days,stats}=roadmap
  const currentYear=calendar.currentYear
  const currentWeek=calendar.currentWeek
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
        <span>{year.year}년차</span><strong><a href={stageHref("year-"+year.year)}>{year.title} →</a></strong><small>{year.description}</small>
      </li>)}
    </ol>
    <div className="roadmap-subheading"><h3>첫 달 · 4주 계획</h3><a href={ROADMAP_ISSUE} target="_blank" rel="noreferrer noopener">원본 실행계획 #501 ↗</a></div>
    <ol className="roadmap-week-track">
      {roadmap.weeks.map(week=><li key={week.index} className={week.index===currentWeek?'current':''}>
        <span>W{week.index} · {week.start.slice(5).replace('-','/')}-{week.end.slice(5).replace('-','/')}</span>
        <strong><a href={stageHref("week-"+week.index)}>{week.title} →</a></strong><small>{week.goal}</small>
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
    {error&&<p role="alert" className="roadmap-load-error">{error}</p>}
    <details className="roadmap-evidence-details">
      <summary>1주차 작업 7개와 완료 근거 보기</summary>
      <ol>{days.map(item=><li key={item.day}><a href={stageHref("day-"+item.day)}>Day {item.day} · {item.title} →</a><strong className={'roadmap-state '+stateClass(item.state)}>{stateLabel(item.state)}</strong></li>)}</ol>
      <p>기존 Bunker OS 운영 기록을 로그인 후 읽어 자동 갱신합니다. 현재 '조사 기록'은 원고·사업성과·Production 배포까지 검증됐다는 뜻이 아닙니다.</p>
    </details>
    {stage&&target&&<article className="roadmap-stage-detail" aria-labelledby="roadmap-stage-title">
      <a href="/operator/#operator-roadmap">← 5년 전체 지도</a>
      <h3 id="roadmap-stage-title">{stage.startsWith('year')?index+'년차':stage.startsWith('week')?'W'+index:'Day '+index} · {target.title}</h3>
      <h4>목표</h4><p>{'description' in target?target.description:'goal' in target?target.goal:target.title}</p>
      <h4>현재 상태</h4><p>{'state' in target?stateLabel(target.state):'장기 방향 · 연차별 완료율은 산정하지 않습니다.'}</p>
      <h4>근거 자료</h4>
      {error||logs===null?<p>조회 필요 · 기록을 확인하지 못했습니다.</p>:evidence.length?<ul>{evidence.map((log,i)=><li key={log.id??i}>
        {log.id&&/^[0-9a-f-]{36}$/i.test(log.id)?<a href={'/operator/bunker-os/log/'+log.id+'/?stage='+stage+'&cycle='+encodeURIComponent(log.cycle_key)}>{log.title}</a>:<span>{log.title} · 상세 참조 ID 없음</span>}
        {gateEvidenceUrl(log)&&<> · <a href={gateEvidenceUrl(log)!} target="_blank" rel="noopener noreferrer">검수 근거 원문 ↗</a></>}</li>)}</ul>:<p>연결된 실행 근거가 없습니다. 계획이나 날짜만으로 완료를 판단하지 않습니다.</p>}
      <h4>다음 행동</h4>{nextActions.length>0&&<ul>{nextActions.map((action,i)=><li key={i}>{action}</li>)}</ul>}<p>{stage.startsWith('year')&&index>1?'세부 실행계획 미정 · 앞 단계 결과를 검토한 뒤 구체화합니다.':'연결된 일지의 다음 할 일과 원본 실행계획을 확인하고, 근거가 없으면 검토 후 기록합니다.'}</p>
      <a href={'/operator/bunker-os/logs/?cycle=MONTH01_FIND_THE_ENGINE&stage='+stage}>첫 달 전체 기록 조회 →</a>
    </article>}
    <details className="roadmap-evidence-details"><summary>기획문서와 장기 자료 목록</summary><ul>{roadmapDocuments.map(doc=><li key={doc.url}><a href={doc.url} target="_blank" rel="noopener noreferrer">{doc.title} ↗</a></li>)}</ul><p>명시적으로 연결한 문서입니다. 원문 접근 권한이 필요할 수 있으며, 링크가 열리지 않으면 삭제·이동·권한을 확인하세요. 일지 자료함은 source_candidates만 모으며 저장소 전체 자동수집이 아닙니다.</p></details>
    <div className="roadmap-footer"><span>출처: <a href={ROADMAP_STRATEGY} target="_blank" rel="noreferrer noopener">5년 전략 #500</a> · <a href={ROADMAP_ISSUE} target="_blank" rel="noreferrer noopener">30일 실행계획 #501</a> · 기존 Bunker OS 감독 기록</span>
      <span>{logs===null?'운영 기록 조회 전':roadmap.latestLogAt?'기록 기준 '+new Date(roadmap.latestLogAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'월간 기록 없음'} · 새로고침 시 다시 확인</span>
    </div>
  </section>
}
