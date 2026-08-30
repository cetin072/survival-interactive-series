import type { Choice, LogEntry, PresentationBlock } from '../types'

export const demoScene = {
  day: 'DAY 01',
  time: '17:40',
  location: '회사 · 도심',
  narrative:
    '퇴근 직전, 휴대전화에 재난문자가 연달아 울린다. 학교와 집, 외곽거점에 흩어진 가족들의 연락은 아직 끊기지 않았다. 지금은 무엇보다 다음 한 시간을 어떻게 쓸지 정해야 한다.',
  choices: [
    { id: 1, label: '학교로 이동한다' },
    { id: 2, label: '집으로 이동한다' },
    { id: 3, label: '가족들에게 현재 상황을 확인한다' },
    { id: 4, label: '회사에서 필요한 물자를 챙긴다' },
  ] satisfies Choice[],
  family: [
    ['준호', '회사'],
    ['서윤', '도심 아파트'],
    ['민석', '학교'],
    ['정호', '외곽거점'],
  ],
  resources: [
    ['💧 물', '보통'],
    ['📡 통신', '불안정'],
  ],
  presentationBlocks: [
    { type: 'EVENT', message: '도심 진입도로 일부 통제' },
    { type: 'AUTO', message: '통화와 교통 확인에 20분 경과' },
    { type: 'PHASE CHANGE', message: '공급 차질 → 지역 이동 제한' },
  ] satisfies PresentationBlock[],
}

export const initialLog: LogEntry[] = [
  { id: 0, kind: 'scene', text: demoScene.narrative },
]
