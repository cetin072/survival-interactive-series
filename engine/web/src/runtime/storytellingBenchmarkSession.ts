import { createPublicRuntimeCheckpoint, type PublicRuntimeCheckpoint, type PublicRuntimeScene } from './publicRuntimeCheckpoint'
import type { LiveState } from '../state/liveState'
import type { QueuedAction } from '../validator/types'

export const STORY_BENCHMARK_STORAGE_KEY = 'survival-story-benchmark-s01-v1'
export const STORY_BENCHMARK_CHECKPOINT_ID = 'story-benchmark-s01-wildfire-v1'
export const STORY_BENCHMARK_SEASON_ID = 'STORY_BENCHMARK_S01_WILDFIRE'

function seedAction(id: string, label: string): QueuedAction {
  return {
    id,
    label,
    actors: ['player'],
    proposal: {
      time_delta_min: 0,
      moves: [],
      resource_changes: [],
      base_capability_changes: [],
      world_changes: [],
    },
  }
}

function createBenchmarkState(): LiveState {
  return {
    version: 1,
    season_id: STORY_BENCHMARK_SEASON_ID,
    scene_id: 'benchmark-s01-opening',
    clock: {
      day: 1,
      date: '2026-09-03',
      time: '18:17',
      phase: 'STORYTELLING_BENCHMARK',
    },
    party: {
      player: { name: '한준호', location: '회사', with: [], status: '퇴근 직전 · 상황 파악 중' },
      wife: { name: '서윤', location: '병원', with: [], status: '근무 중 · 비상대응 가능성 확인 중' },
      son: { name: '민석', location: '학원', with: [], status: '수업 중 · 조기 귀가 가능성 있음' },
      father: { name: '정호', location: '외곽주택', with: [], status: '혼자 있음 · 산림 인접 지역' },
    },
    vehicles: {
      family_car: { name: '가족 차량', location: '회사', status: '회사 주차장에 주차 · 이용 가능', operator: 'player' },
    },
    bases: {
      city_apartment: { name: '도심 아파트', location: '도심', status: '일상 거주지', capabilities: ['기본 생활공간', '일반 가정 물자'] },
      outer_house: { name: '외곽주택', location: '외곽 산림 인접 지역', status: '정호 거주 중', capabilities: ['생활공간', '차량 접근', '지역 지리 정보'] },
    },
    resources: {
      communications: { name: '통신', icon: '📡', band: '정상' },
      vehicle_access: { name: '차량', icon: '🚗', band: '이용 가능' },
      household_supplies: { name: '생활물자', icon: '📦', band: '평시 가정 수준' },
      information: { name: '재난정보', icon: '📻', band: '초기 경보 단계' },
    },
    institutions: {
      company: { name: '준호 회사', status: '외곽 거주자 조기 퇴근 안내 가능' },
      hospital: { name: '서윤 병원', status: '정상 운영 중 · 비상대응 전환 가능' },
      academy: { name: '민석 학원', status: '수업 중 · 보호자 귀가 문의 증가' },
      local_government: { name: '지자체', status: '산불 확산 우려 및 일부 지역 대피 준비 안내' },
    },
    routes_known: {
      company_to_academy: { from: '회사', to: '민석 학원', status: '퇴근시간 정체 증가 중' },
      city_to_outer: { from: '도심', to: '외곽주택', status: '일부 도로 통제 가능성 있음' },
    },
    active_actions: [],
    completed_actions: [],
    public_world: {
      benchmark: true,
      benchmark_reference: 'Canon v2 S01 opening-condition comparison only',
      scenario: '강풍 속 산불 확산과 가족 분산',
      current_public_signals: [
        '서쪽 하늘의 연기와 어두워진 시야',
        '산불 확산 우려 재난문자',
        '외곽 방면 도로 통제 가능성',
        '퇴근시간 교통량 증가',
      ],
      family_character_notes: {
        wife: '서윤은 현재 가족 안전과 생활 지속성을 우선하며, 위험하면 준호의 계획을 수정하거나 독립적으로 움직일 수 있다.',
        son: '민석은 보호만 받기보다 정보와 역할을 맡고 싶어하며, 전자기기와 정보 탐색에 빠르지만 경험은 부족하다.',
        father: '정호는 외곽 지리와 생활 경험이 강하고 독립성이 높다. 자기 판단으로 이웃이나 집 문제를 먼저 챙기려 할 수 있다.',
      },
      family_addressing: {
        player_to_wife: ['여보', '서윤아'],
        wife_to_player: ['여보', '오빠'],
        player_to_father: ['아버지'],
        father_to_player: ['준호야'],
        wife_to_father: ['아버님'],
        father_to_wife: ['서윤아'],
        player_to_son: ['민석아', '아들'],
        wife_to_son: ['민석아'],
        son_to_player: ['아빠'],
        son_to_wife: ['엄마'],
        son_to_father: ['할아버지'],
        father_to_son: ['민석아'],
      },
      family_reference_rules: [
        '준호가 서윤에게 자기 아버지를 말할 때는 아버지라고 한다.',
        '서윤이 준호에게 정호를 말할 때는 아버님이라고 한다.',
        '준호나 서윤이 민석에게 정호를 말할 때는 할아버지라고 한다.',
        '대사에서 가족끼리는 이름보다 관계 호칭을 우선하되, 자연스러운 감정 장면에서는 이름 호칭을 섞을 수 있다.',
      ],
      benchmark_rule: '과거 플레이 선택을 재현하지 않는다. 현재 플레이어 선택에 따라 독립적으로 전개한다.',
    },
    last_change: {
      public_alert: '강풍으로 산불 영향권이 넓어질 수 있다는 긴급 안내가 도착했다.',
    },
    renderer_flags: { show_status: true },
  }
}

function openingScene(): PublicRuntimeScene {
  return {
    id: 'benchmark-s01-opening',
    narrative: `## 18:17 — 퇴근 직전

회사 창밖이 평소보다 빠르게 어두워지고 있다. 서쪽 하늘 아래로 긴 연기 띠가 보이고, 사무실 사람들이 하나둘 창가로 모인다.

> [긴급재난문자]
> 강풍으로 산불이 빠르게 확산될 수 있습니다. 산림 인접 지역 주민은 대피 준비를 하시기 바랍니다. 외곽 도로 일부는 통제될 수 있습니다.

서윤(아내): “여보, 병원도 산불 때문에 비상대응 얘기가 나와. 상황 더 커지면 바로 퇴근 못 할 수도 있어.”

민석은 아직 학원에 있다. 정호는 산과 밭에 가까운 외곽주택에 혼자 있다. 가족 차량은 회사 주차장에 있고 통신은 아직 정상이다.

> [회사 공지]
> 외곽 방면 거주자는 교통 통제 가능성을 고려해 필요하면 조기 퇴근 바랍니다.

지도 앱을 열자 외곽으로 빠지는 도로의 정체가 빠르게 늘고 있다. 아직 누구에게도 직접적인 피해는 확인되지 않았지만, 가족 네 사람의 다음 위치를 지금 정하지 않으면 곧 선택지가 줄어들 수 있다.

### 현재
- 준호 — 회사
- 서윤 — 병원
- 민석 — 학원
- 정호 — 외곽주택
- 차량 이용 가능 · 통신 정상`,
    choices: [
      { id: 1, label: '민석에게 연락하고 학원 쪽으로 움직일 준비를 한다', action: seedAction('benchmark-contact-son', '민석 연락 및 이동 준비') },
      { id: 2, label: '정호에게 전화해 외곽주택 주변 상황을 직접 확인한다', action: seedAction('benchmark-contact-father', '정호 외곽 상황 확인') },
      { id: 3, label: '서윤과 통화해 가족의 합류 순서와 기준부터 정한다', action: seedAction('benchmark-plan-with-wife', '서윤과 가족 합류 기준 정리') },
      { id: 4, label: '재난정보와 도로 통제를 확인해 첫 이동 방향을 정한다', action: seedAction('benchmark-check-information', '산불 및 도로 정보 확인') },
    ],
    presentation_blocks: [
      { type: 'EVENT', message: 'STORYTELLING BENCHMARK · S01-LIKE OPENING · NON-CANONICAL' },
    ],
  }
}

export function createStorytellingBenchmarkSession(): PublicRuntimeCheckpoint {
  const state = createBenchmarkState()
  return createPublicRuntimeCheckpoint({
    payload_visibility: 'public',
    source_kind: 'synthetic-fixture',
    checkpoint_id: STORY_BENCHMARK_CHECKPOINT_ID,
    season_id: STORY_BENCHMARK_SEASON_ID,
    phase: state.clock.phase,
    active_visible_pressure: '산불 확산 가능성 · 가족 네 곳 분산 · 외곽 도로 통제 가능성',
    recent_visible_change: '산불 긴급 안내와 외곽 방면 조기 이동 안내가 거의 동시에 도착했다.',
    current_scene: openingScene(),
    committed_turn: {
      number: 0,
      log: [{ id: 0, kind: 'scene', text: 'STORYTELLING BENCHMARK S01 시작' }],
    },
    public_state: state,
  })
}

export function resetStorytellingBenchmarkSession(): PublicRuntimeCheckpoint {
  return createStorytellingBenchmarkSession()
}
