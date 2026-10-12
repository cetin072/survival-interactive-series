// Operational roadmap status. Calendar position is NOT milestone completion.
export type RoadmapLog = {
  cycle_key: string
  phase: string
  day_index: number | null
  status: string
  title: string
  occurred_at: string
  reviewed_at?: string | null
  details?: unknown
}
export type EvidenceState = 'REVIEWED' | 'RECORDED' | 'DRAFT' | 'WORKING' | 'NO_EVIDENCE' | 'UNAVAILABLE'
export const ROADMAP_ISSUE = 'https://github.com/cetin072/survival-interactive-series/issues/501'
export const ROADMAP_STRATEGY = 'https://github.com/cetin072/survival-interactive-series/issues/500'
export const ROADMAP_CYCLE = 'MONTH01_FIND_THE_ENGINE'

export const years = [
  { year: 1, title: '쓸모 검증', description: '실제 유용 행동·첫 재사용·지식 자산' },
  { year: 2, title: '반복 확인', description: '반복 방문과 수익 방식의 재현' },
  { year: 3, title: '자산화', description: '지식·도구·운영과 벙커 조건 구체화' },
  { year: 4, title: '확대', description: '강한 유통·수익 경로에 집중' },
  { year: 5, title: '실물화 검토', description: '법·안전·자금 충족 시 벙커 실행' },
] as const
export const weeks = [
  { index: 1, start: '2026-10-10', end: '2026-10-16', title: '방향 찾기', goal: '자산·시장·고객·유통 조사', gate: 'M01_WEEK1_FREEZE' },
  { index: 2, start: '2026-10-17', end: '2026-10-23', title: '행동 검증', goal: '대표 지식 → 준비 행동 1개', gate: 'M01_WEEK2_ACTION' },
  { index: 3, start: '2026-10-24', end: '2026-10-30', title: '유입 실험', goal: '외부 채널 1개, 실제 유용 행동 확인', gate: 'M01_WEEK3_TRAFFIC' },
  { index: 4, start: '2026-10-31', end: '2026-11-08', title: '엔진 선택', goal: '수익 TOP 3와 다음 60일 실험 선택', gate: 'M01_WEEK4_ENGINE' },
] as const

export const dayTasks = [
  {day:1, title:'자산 지도', exact:'Day 1 · 현재 자산 Audit V1'},
  {day:2, title:'시장·경쟁 지도', exact:'Day 2 · 시장·경쟁 지도 V1'},
  {day:3, title:'수익 엔진 지도', exact:'Day 3 · 수익 엔진 지도 V1'},
  {day:4, title:'고객 문제·이길 이유', exact:'Day 4 · 고객 문제와 Winning Theory V1 (잠정)', draft:true},
  {day:5, title:'유통 전략 지도', exact:'Day 5 · 유통 전략 지도 조사 (1차)', draft:true},
  {day:6, title:'첫 실험 확정', gate:'M01_DAY6_EXPERIMENT'},
  {day:7, title:'1주차 리뷰·2주차 확정', gate:'M01_WEEK1_FREEZE'},
] as const

const utcDay = (value: string) => {
  const time = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(time) ? Math.floor(time / 86400000) : Number.NaN
}
export function kstCalendarDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(now)
  const entry = (type:string) => parts.find(part=>part.type===type)?.value ?? '00'
  return entry('year') + '-' + entry('month') + '-' + entry('day')
}
export function roadmapCalendar(today: string) {
  const date=utcDay(today)
  const start=utcDay('2026-10-10')
  const end=utcDay('2026-11-08')
  const isMonthActive=Number.isFinite(date) && date>=start && date<=end
  const monthDay=Number.isFinite(date) ? Math.max(0,Math.min(30,date-start+1)) : 0
  const currentWeek=weeks.find(week=>date>=utcDay(week.start)&&date<=utcDay(week.end))?.index ?? null
  const yearStart=utcDay('2026-10-01')
  const boundaryDays=Array.from({length:6},(_,i)=>utcDay(String(2026+i)+'-10-01'))
  const currentYear=Number.isFinite(date) && date>=yearStart && date<boundaryDays[5]
    ? Math.max(1,Math.min(5,boundaryDays.findIndex((boundary,i)=>i>0 && date<boundary)))
    : null
  return {
    today, currentYear, currentWeek, monthDay, isMonthActive,
    monthPeriod: Number.isFinite(date) && date<start ? 'BEFORE' : date>end ? 'AFTER' : isMonthActive ? 'ACTIVE' : 'UNKNOWN',
    monthCalendarPercent:Math.round((monthDay/30)*100),
  } as const
}
function acceptedProofUrl(value:unknown) {
  if(typeof value!=='string'||value.length>500)return null
  try {
    const uri=new URL(value)
    if(uri.protocol!=='https:')return null
    if(uri.hostname==='github.com' && uri.pathname.startsWith('/cetin072/survival-interactive-series/'))return uri.href
    if(uri.hostname==='survival-diary-archive.netlify.app'||/^(?:qa-[a-z0-9-]+|deploy-preview-[0-9]+)--survival-diary-archive\.netlify\.app$/.test(uri.hostname))return uri.href
  }catch {/* Reject invalid proof URLs. */}
  return null
}
function proof(log:RoadmapLog,id:string):string|null {
  if(log.status!=='COMPLETED'||!log.reviewed_at||!log.details||typeof log.details!=='object')return null
  const source=(log.details as Record<string,unknown>).roadmap_gate
  if(!source||typeof source!=='object')return null
  const gate=source as Record<string,unknown>
  if(gate.id!==id||gate.verdict!=='VERIFIED'||gate.version!==1)return null
  return acceptedProofUrl(gate.evidence_url)
}
function latestMatching(logs:RoadmapLog[],title:string):RoadmapLog|undefined {
  return logs.filter(log=>log.cycle_key===ROADMAP_CYCLE
    && log.phase==='WEEK_1_FIND_THE_GAME'
    && log.title===title)
    .sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at))[0]
}
export function milestoneState(logs:RoadmapLog[]|null,task:(typeof dayTasks)[number]):EvidenceState {
  if(logs===null)return 'UNAVAILABLE'
  const gate='gate' in task ? task.gate : undefined
  if(gate && logs.some(log=>log.cycle_key===ROADMAP_CYCLE&&Boolean(proof(log,gate))))return 'REVIEWED'
  if(!('exact' in task))return 'NO_EVIDENCE'
  const match=latestMatching(logs,task.exact)
  if(!match)return 'NO_EVIDENCE'
  if(match.status==='COMPLETED')return 'draft' in task && task.draft ? 'DRAFT' : 'RECORDED'
  if(match.status==='RUNNING')return 'WORKING'
  return 'NO_EVIDENCE' // Do not translate blocked or approval-needed work into completion.
}
export function weekState(logs:RoadmapLog[]|null,week:(typeof weeks)[number]):EvidenceState {
  if(logs===null)return 'UNAVAILABLE'
  if(logs.some(log=>log.cycle_key===ROADMAP_CYCLE && Boolean(proof(log,week.gate))))return 'REVIEWED'
  if(week.index===1){
    const stages=dayTasks.map(task=>milestoneState(logs,task))
    return stages.some(state=>state==='WORKING'||state==='DRAFT'||state==='RECORDED')?'WORKING':'NO_EVIDENCE'
  }
  const targetPhase={
    2:'WEEK_2_FIND_THE_ACTION',
    3:'WEEK_3_FIND_THE_TRAFFIC',
    4:'WEEK_4_FIND_THE_ENGINE',
  }[week.index]
  return logs.some(log=>log.cycle_key===ROADMAP_CYCLE&&log.phase===targetPhase)
    ?'WORKING':'NO_EVIDENCE' // Arbitrary COMPLETED log is not a verified experiment result.
}
export function buildRoadmap(logs:RoadmapLog[]|null,today:string) {
  const calendar=roadmapCalendar(today)
  const days=dayTasks.map(task=>({...task,state:milestoneState(logs,task)}))
  const stats={
    recorded:days.filter(task=>task.state==='RECORDED'||task.state==='REVIEWED').length,
    draft:days.filter(task=>task.state==='DRAFT').length,
    active:days.filter(task=>task.state==='WORKING').length,
  }
  const upcoming=days.find(task=>task.state!=='RECORDED'&&task.state!=='REVIEWED')??null
  return {
    calendar, days, weeks:weeks.map(week=>({...week,state:weekState(logs,week)})),
    stats, upcoming,
    latestLogAt: logs?.filter(log=>log.cycle_key===ROADMAP_CYCLE).sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at))[0]?.occurred_at??null,
  }
}
