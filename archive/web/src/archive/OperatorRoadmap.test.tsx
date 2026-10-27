import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {describe,it,expect} from 'vitest'
import {OperatorRoadmap} from './OperatorRoadmap'
import {buildRoadmap,roadmapCalendar,kstCalendarDate,milestoneState,weekState,dayTasks,weeks,type RoadmapLog} from './operatorRoadmapModel'
const log=(day:number,title:string,status='COMPLETED'):RoadmapLog=>({
  cycle_key:'MONTH01_FIND_THE_ENGINE',phase:'WEEK_1_FIND_THE_GAME',day_index:day,
  status,title,occurred_at:'2026-10-11T04:00:00Z'
})
const evidence=[
  log(1,'Day 1 · 현재 자산 Audit V1'),
  log(2,'Day 2 · 시장·경쟁 지도 V1'),
  log(3,'Day 3 · 수익 엔진 지도 V1'),
  log(4,'Day 4 · 고객 문제와 Winning Theory V1 (잠정)'),
  log(5,'Day 5 · 유통 전략 지도 조사 (1차)','RUNNING')
]
describe('operator roadmap first-screen display',()=>{
  it('separates calendar movement from work evidence',()=>{
    const m=buildRoadmap(evidence,'2026-10-12')
    expect(m.calendar.monthDay).toBe(3)
    expect(m.calendar.monthCalendarPercent).toBe(10)
    expect(m.calendar.currentYear).toBe(1)
    expect(m.calendar.currentWeek).toBe(1)
    expect(m.stats).toEqual({recorded:3,draft:1,active:1})
    expect(m.upcoming?.day).toBe(5)
    expect(m.weeks[0].state).toBe('WORKING')
    expect(m.weeks[1].state).toBe('NO_EVIDENCE')
  })
  it('never treats random completed logs or a draft as verified milestone',()=>{
    const fake=log(6,'생존가방 웹앱 개발 완료')
    expect(milestoneState([fake],dayTasks[5])).toBe('NO_EVIDENCE')
    expect(milestoneState([evidence[3]],dayTasks[3])).toBe('DRAFT')
    expect(weekState([{...fake,phase:'WEEK_2_FIND_THE_ACTION'}],weeks[1])).toBe('WORKING')
  })
  it('allows reviewed, explicit evidence only for a completed strategic gate',()=>{
    const withFakeProof:RoadmapLog={...log(6,'임의 완료'),details:{roadmap_gate:{version:1,id:'M01_DAY6_EXPERIMENT',verdict:'VERIFIED',evidence_url:'https://github.com/cetin072/survival-interactive-series/pull/500'}}}
    expect(milestoneState([withFakeProof],dayTasks[5])).toBe('NO_EVIDENCE')
    const review={...withFakeProof,reviewed_at:'2026-10-16T00:00:00Z'}
    expect(milestoneState([review],dayTasks[5])).toBe('REVIEWED')
    expect(milestoneState([{...review,details:{roadmap_gate:{version:1,id:'M01_DAY6_EXPERIMENT',verdict:'VERIFIED',evidence_url:'javascript:alert(1)'}}}],dayTasks[5])).toBe('NO_EVIDENCE')
    expect(milestoneState([{...review,details:{roadmap_gate:{version:1,id:'M01_DAY6_EXPERIMENT',verdict:'VERIFIED',evidence_url:'https://github.com/other/repo/pull/500'}}}],dayTasks[5])).toBe('NO_EVIDENCE')
  })
  it('marks missing RPC as unavailable rather than falsely complete or not started',()=>{
    const m=buildRoadmap(null,'2026-10-12')
    expect(m.days.every(d=>d.state==='UNAVAILABLE')).toBe(true)
    const html=renderToStaticMarkup(createElement(OperatorRoadmap,{logs:null,error:'로그 확인 실패',today:'2026-10-12'}))
    expect(html).toContain('조회 대기')
    expect(html).toContain('운영 기록 조회 전')
    expect(html).not.toContain('근거 검수 완료')
  })
  it('uses KST date and respects monthly/yearly bounds',()=>{
    expect(kstCalendarDate(new Date('2026-10-11T15:05:00Z'))).toBe('2026-10-12')
    expect(roadmapCalendar('2026-10-17').currentWeek).toBe(2)
    expect(roadmapCalendar('2026-11-08').monthDay).toBe(30)
    expect(roadmapCalendar('2026-11-09').monthPeriod).toBe('AFTER')
    expect(roadmapCalendar('2027-10-01').currentYear).toBe(2)
    expect(roadmapCalendar('2031-10-01').currentYear).toBe(null)
  })
  it('renders goals and automation board entry without assuming 5-year achievement',()=>{
    const html=renderToStaticMarkup(createElement(OperatorRoadmap,{logs:evidence,today:'2026-10-12'}))
    expect(html).toContain('지금 어디까지 왔을까?')
    expect(html).toContain('5년 중 1년차')
    expect(html).toContain('Day 3 / 30')
    expect(html).toContain('3 / 7건')
    expect(html).toContain('날짜 진행률')
    expect(html).toContain('href="/operator/bunker-os/"')
    expect(html).toContain('첫 달 · 4주 계획')
    expect(html).not.toContain('전체 목표 달성')
  })
})

describe('roadmap navigation and references',()=>{
  it('exposes every planned stage and only explicit document references',()=>{
    const html=renderToStaticMarkup(createElement(OperatorRoadmap,{logs:evidence}))
    for(const [kind,count] of [['year',5],['week',4],['day',7]] as const)
      for(let i=1;i<=count;i++)expect(html).toContain('stage='+kind+'-'+i)
    expect(html).toContain('BUNKER_THREAT_MODEL_V0.md')
    expect(html).toContain('저장소 전체 자동수집이 아닙니다')
  })
})
