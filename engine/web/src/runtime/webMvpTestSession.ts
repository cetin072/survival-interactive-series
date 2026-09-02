import { commitPublicRuntimeAction, createPublicRuntimeCheckpoint, keepPublicRuntimeSafeAfterFreeAction, type PublicRuntimeCheckpoint, type PublicRuntimeScene } from './publicRuntimeCheckpoint'
import type { LiveState } from '../state/liveState'
import type { Choice, LogEntry } from '../types'
import type { ActionExecutionResult, QueuedAction } from '../validator/types'

export const WEB_MVP_TEST_SESSION_STORAGE_KEY = 'survival-web-mvp-test-session-v1'

type TestChoice = Choice & { action: QueuedAction }

function action(id: string, label: string, proposal: QueuedAction['proposal']): QueuedAction {
  return { id, label, actors: ['player'], proposal }
}

function createTestState(): LiveState {
  return {
    version: 1,
    season_id: 'WEB_MVP_TEST_SESSION',
    scene_id: 'test-arrival',
    clock: { day: 1, date: '2030-01-01', time: '09:00', phase: 'NON_CANONICAL_TEST' },
    party: {
      player: { name: '한준호', location: '테스트 관측소', with: [], status: '판단 대기' },
      wife: { name: '서윤', location: '테스트 관측소', with: [], status: '독립 판단 중' },
      son: { name: '민석', location: '테스트 관측소', with: [], status: '통신 장비 점검 중' },
      father: { name: '정호', location: '테스트 거점', with: [], status: '생활 점검 중' },
    },
    vehicles: {},
    bases: { test_base: { name: '테스트 거점', location: '비정식 검증 구역', status: '운영 중', capabilities: ['기본 대피 공간'] } },
    resources: {
      water: { name: '물', icon: '💧', band: '보통' },
      communications: { name: '통신', icon: '📡', band: '불안정' },
    },
    institutions: {}, routes_known: {}, active_actions: [], completed_actions: [],
    public_world: { test_session: true }, last_change: {}, renderer_flags: { show_status: true },
  }
}

function choice(id: number, label: string, queued: QueuedAction): TestChoice {
  return { id, label, action: queued }
}

function sceneFor(state: LiveState, sceneId: string): PublicRuntimeScene {
  const common: Pick<PublicRuntimeScene, 'id'> = { id: sceneId }
  switch (sceneId) {
    case 'test-water-check':
      return {
        ...common,
        narrative: '물 저장 용기를 확인했습니다. 이 장면은 UI와 엔진 검증용이며 실제 S02 사건이 아닙니다.',
        choices: [
          choice(1, '저장 점검표를 설치한다', action('test-install-water-ledger', '저장 점검표 설치', {
            time_delta_min: 20, moves: [], resource_changes: [{ resource_id: 'water', from: '보통', to: '안정' }],
            base_capability_changes: [{ base_id: 'test_base', add: '물 저장 점검표' }], world_changes: [],
          })),
          choice(2, '가족의 제안을 듣는다', action('test-hear-family', '가족 제안 확인', {
            time_delta_min: 10, moves: [], resource_changes: [], world_changes: [{ key: 'family_plan', from: undefined, to: 'requested' }],
          })),
        ],
        presentation_blocks: [{ type: 'EVENT', message: '물 상태와 거점 능력은 테스트 세션 안에서만 변경됩니다.' }],
      }
    case 'test-family-response':
      return {
        ...common,
        narrative: '서윤은 "점검표는 동의하지만 물 관리는 내가 맡을게"라고 수정 제안을 합니다. 민석은 이미 통신 목록을 따로 정리하기 시작했습니다.',
        choices: [
          choice(1, '수정 제안을 반영한다', action('test-accept-family-plan', '가족 수정 제안 반영', {
            time_delta_min: 15, moves: [], resource_changes: [{ resource_id: 'communications', from: '불안정', to: '점검 중' }],
            world_changes: [{ key: 'family_plan', from: 'requested', to: 'modified-and-accepted' }],
          })),
          choice(2, '혼자 우선순위를 정한다', action('test-solo-priority', '개인 우선순위 정리', {
            time_delta_min: 10, moves: [], resource_changes: [], world_changes: [{ key: 'family_plan', from: 'requested', to: 'deferred' }],
          })),
        ],
        presentation_blocks: [{ type: 'EVENT', message: '가족은 직접 조종 대상이 아니라, 테스트 규칙에 따라 독립적으로 수정 제안을 했습니다.' }],
      }
    case 'test-base-ready':
      return {
        ...common,
        narrative: '테스트 거점의 점검표가 보이기 시작했습니다. 물 상태와 거점 능력의 변화가 공개 상태판에 반영됩니다.',
        choices: [
          choice(1, '통신 목록을 확인한다', action('test-check-comms', '통신 목록 확인', {
            time_delta_min: 10, moves: [], resource_changes: [{ resource_id: 'communications', from: '불안정', to: '점검 중' }], world_changes: [],
          })),
          choice(2, '다음 점검으로 넘어간다', action('test-next-check', '다음 점검 진행', {
            time_delta_min: 15, moves: [], resource_changes: [], world_changes: [{ key: 'next_check', from: undefined, to: 'ready' }],
          })),
        ],
        presentation_blocks: [{ type: 'PHASE CHANGE', message: 'TEST SESSION · 거점 점검 단계' }],
      }
    case 'test-communications': {
      // This scene is intentionally repeatable for the 10–20 turn human MVP playtest.
      // Validator correctly rejects completed action IDs, so each synthetic loop action gets a unique ID/key.
      const loopStep = state.completed_actions.length + 1
      return {
        ...common,
        narrative: '민석의 독립적인 통신 목록이 합쳐졌습니다. 그는 다음 점검은 본인이 계속하겠다고 알립니다.',
        choices: [
          choice(1, '짧은 상태 점검을 이어간다', action(`test-finish-check-${loopStep}`, '상태 점검 계속', {
            time_delta_min: 10, moves: [], resource_changes: [], world_changes: [{ key: `review_${loopStep}`, from: undefined, to: 'complete' }],
          })),
          choice(2, '물 저장을 다시 확인한다', action(`test-recheck-water-${loopStep}`, '물 저장 재확인', {
            time_delta_min: 5, moves: [], resource_changes: [], world_changes: [{ key: `water_recheck_${loopStep}`, from: undefined, to: 'complete' }],
          })),
        ],
        presentation_blocks: [{ type: 'EVENT', message: '가족의 독립 반응: 민석이 통신 점검을 자율적으로 이어갑니다.' }],
      }
    }
    default:
      return {
        ...common,
        narrative: '테스트 세션의 첫 장면입니다. 제한된 공개 baseline만 사용하며, 실제 S02 상태나 사건을 나타내지 않습니다.',
        choices: [
          choice(1, '물 상태를 확인한다', action('test-check-water', '물 상태 확인', {
            time_delta_min: 10, moves: [], resource_changes: [], world_changes: [{ key: 'water_check', from: undefined, to: 'complete' }],
          })),
          choice(2, '가족에게 점검 계획을 제안한다', action('test-request-family-plan', '가족 점검 계획 요청', {
            time_delta_min: 10, moves: [], resource_changes: [], world_changes: [{ key: 'family_plan', from: undefined, to: 'requested' }],
          })),
          choice(3, '통신 상태를 확인한다', action('test-initial-comms', '통신 상태 확인', {
            time_delta_min: 10, moves: [], resource_changes: [{ resource_id: 'communications', from: '불안정', to: '점검 중' }], world_changes: [],
          })),
        ],
        presentation_blocks: [{ type: 'EVENT', message: 'WEB MVP TEST SESSION 시작 · NON-CANONICAL' }],
      }
  }
}

function nextSceneId(current: string, actionId: string): string {
  if (current === 'test-arrival' && actionId === 'test-check-water') return 'test-water-check'
  if (current === 'test-arrival' && actionId === 'test-request-family-plan') return 'test-family-response'
  if (current === 'test-arrival') return 'test-communications'
  if (current === 'test-water-check' && actionId === 'test-install-water-ledger') return 'test-base-ready'
  if (current === 'test-water-check') return 'test-family-response'
  if (current === 'test-family-response') return 'test-communications'
  return 'test-communications'
}

function nextScene(current: string, actionId: string) {
  return (state: LiveState, result: ActionExecutionResult) => {
    if (result.outcome !== 'success' && result.outcome !== 'partial_success') return sceneFor(state, current)
    const sceneId = nextSceneId(current, actionId)
    return sceneFor({ ...state, scene_id: sceneId }, sceneId)
  }
}

export function createWebMvpTestSession(): PublicRuntimeCheckpoint {
  const state = createTestState()
  return createPublicRuntimeCheckpoint({
    payload_visibility: 'public', source_kind: 'synthetic-fixture', checkpoint_id: 'web-mvp-test-session-v1',
    season_id: state.season_id, phase: state.clock.phase, active_visible_pressure: '정해진 점검 순서를 마쳐야 하는 테스트 압력',
    recent_visible_change: '비정식 테스트 세션을 시작했습니다.', current_scene: sceneFor(state, state.scene_id),
    committed_turn: { number: 0, log: [{ id: 0, kind: 'scene', text: 'TURN 0 · WEB MVP TEST SESSION 시작' }] }, public_state: state,
  })
}

export function commitWebMvpChoice(checkpoint: PublicRuntimeCheckpoint, choiceId: number): PublicRuntimeCheckpoint {
  const selected = checkpoint.current_scene.choices.find((item) => item.id === choiceId)
  if (!selected) return keepPublicRuntimeSafeAfterFreeAction(checkpoint, `선택 ${choiceId}`)
  const log: LogEntry = { id: 0, kind: 'choice', text: `선택 ${selected.id}. ${selected.label}` }
  return commitPublicRuntimeAction(checkpoint, log, selected.action, nextScene(checkpoint.current_scene.id, selected.action.id))
}

export function submitWebMvpFreeAction(checkpoint: PublicRuntimeCheckpoint, text: string): PublicRuntimeCheckpoint {
  const normalized = text.trim().replace(/\s+/g, ' ')
  const supported = checkpoint.current_scene.choices.find((item) =>
    (normalized === '물 상태를 확인한다' && item.action.id === 'test-check-water')
    || (normalized === '통신 상태를 확인한다' && item.action.id === 'test-initial-comms'),
  )
  if (!supported) {
    const safe = keepPublicRuntimeSafeAfterFreeAction(checkpoint, text)
    return createPublicRuntimeCheckpoint({
      ...safe,
      current_scene: { ...safe.current_scene, narrative: 'AI GM 연결 전 테스트 세션에서는 이 자유행동을 해석할 수 없습니다. 상태를 바꾸지 않았습니다.' },
      committed_turn: {
        ...safe.committed_turn,
        log: [...safe.committed_turn.log.slice(0, -1), { id: safe.committed_turn.log.length - 1, kind: 'system', text: 'AI GM 연결 전 테스트 세션에서는 이 자유행동을 해석할 수 없습니다.' }],
      },
    })
  }
  return commitPublicRuntimeAction(
    checkpoint,
    { id: 0, kind: 'free-action', text: `자유행동: ${text}` },
    supported.action,
    nextScene(checkpoint.current_scene.id, supported.action.id),
  )
}

export function resetWebMvpTestSession(): PublicRuntimeCheckpoint {
  return createWebMvpTestSession()
}
