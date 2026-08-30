import type { EventArchetype } from './types'

export const eventArchetypes: EventArchetype[] = [
  { id: 'quiet_window', title: '잠깐의 정적', narrative: '바깥 상황은 잠시 잦아들었다. 평온은 안심이라기보다 다음 판단을 위한 짧은 틈처럼 느껴진다.', minPressure: 0, maxPressure: 4, cooldown: 2, pressureDelta: -1, weight: 2 },
  { id: 'cell_congestion', title: '통신 지연', narrative: '전화 연결이 평소보다 늦다. 메시지는 도착하지만 몇 분씩 밀리기 시작한다.', minPressure: 0, maxPressure: 4, cooldown: 3, pressureDelta: 1, weight: 3 },
  { id: 'road_control', title: '도로 부분 통제', narrative: '주요 도로 일부가 통제됐다는 안내가 들어온다. 이동 시간 예측이 어려워졌다.', minPressure: 1, maxPressure: 4, cooldown: 4, pressureDelta: 1, weight: 3 },
  { id: 'school_notice', title: '학교 일정 변경', narrative: '학교에서 일정 변경 공지가 온다. 민석의 귀가 계획을 다시 확인해야 할 수 있다.', minPressure: 0, maxPressure: 3, cooldown: 4, pressureDelta: 0, weight: 2 },
  { id: 'fuel_queue', title: '주유소 대기 증가', narrative: '근처 주유소 대기 줄이 길어졌다는 소식이 퍼진다. 아직 공급 중단은 아니다.', minPressure: 1, maxPressure: 4, cooldown: 5, pressureDelta: 1, weight: 2 },
  { id: 'delivery_delay', title: '배송 지연', narrative: '일부 생활물자 배송이 늦어지고 있다는 안내가 나온다. 당장 부족하지는 않지만 흐름이 매끄럽지 않다.', minPressure: 1, maxPressure: 4, cooldown: 4, pressureDelta: 1, weight: 2 },
  { id: 'weather_shift', title: '기상 악화 조짐', narrative: '바람이 강해지고 기온이 떨어진다. 이동 자체보다 체류 시간이 부담이 될 수 있다.', minPressure: 0, maxPressure: 4, cooldown: 4, pressureDelta: 1, weight: 2 },
  { id: 'neighborhood_check', title: '주변 확인 움직임', narrative: '주변 사람들이 출입구와 주차장을 확인하기 시작한다. 불안은 있지만 패닉 상태는 아니다.', minPressure: 1, maxPressure: 4, cooldown: 3, pressureDelta: 0, weight: 2 },
  { id: 'power_flicker', title: '전력 불안정', narrative: '조명이 한 차례 깜빡인다. 전력은 유지되지만 순간적인 불안정이 감지된다.', minPressure: 1, maxPressure: 4, cooldown: 5, pressureDelta: 1, weight: 2 },
  { id: 'official_update', title: '공식 안내 갱신', narrative: '공식 채널에 짧은 상황 안내가 올라온다. 내용은 제한적이지만 이전보다 정보가 조금 선명해졌다.', minPressure: 0, maxPressure: 4, cooldown: 3, pressureDelta: -1, weight: 2 },
]
