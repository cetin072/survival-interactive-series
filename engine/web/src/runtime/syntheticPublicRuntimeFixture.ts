import { demoLiveState } from '../state/demoLiveState'
import type { LiveState } from '../state/liveState'
import type { QueuedAction } from '../validator/types'
import { MockProvider, type GMProvider } from './gmProvider'
import { createPublicRuntimeCheckpoint, type PublicRuntimeCheckpoint, type PublicRuntimeScene } from './publicRuntimeCheckpoint'

function action(id: string, label: string, proposal: QueuedAction['proposal']): QueuedAction {
  return { id, label, actors: ['player'], exclusive_resources: ['family_car'], proposal }
}

function followUpScene(state: LiveState): PublicRuntimeScene {
  const turn = state.completed_actions.length + 1
  return {
    id: `synthetic_scene_${turn}`,
    narrative: '검증용 다음 장면입니다. 이 내용은 Canon v2 S02의 사실이 아닌 공개 Runtime Checkpoint 계약 fixture입니다.',
    choices: [{
      id: 1,
      label: '공개 상태를 다시 확인한다',
      action: action(`synthetic-check-${turn}`, '공개 상태 확인', {
        time_delta_min: 5, moves: [], resource_changes: [], world_changes: [],
      }),
    }],
    presentation_blocks: [{ type: 'EVENT', message: 'synthetic checkpoint committed' }],
  }
}

export function nextSyntheticScene(state: LiveState): PublicRuntimeScene {
  return followUpScene(state)
}

export function createSyntheticPublicRuntimeFixture(): PublicRuntimeCheckpoint {
  const publicState: LiveState = {
    ...demoLiveState,
    season_id: 'SYNTHETIC_CONTRACT_TEST',
    scene_id: 'synthetic_scene_001',
    clock: { ...demoLiveState.clock, date: '2040-01-01', phase: 'CONTRACT_TEST' },
  }

  return createPublicRuntimeCheckpoint({
    payload_visibility: 'public',
    source_kind: 'synthetic-fixture',
    checkpoint_id: 'synthetic-public-runtime-v1-001',
    season_id: 'SYNTHETIC_CONTRACT_TEST',
    phase: 'CONTRACT_TEST',
    active_visible_pressure: '검증용 제한 시간',
    recent_visible_change: 'synthetic fixture initialized',
    current_scene: {
      id: 'synthetic_scene_001',
      narrative: '이 장면은 실제 S02가 아닌 공개 Runtime Checkpoint 계약을 검증하는 synthetic fixture입니다.',
      choices: [
        {
          id: 1,
          label: '가족 차량으로 학교에 간다',
          action: action('synthetic-go-school', '학교 이동', {
            time_delta_min: 20,
            moves: [
              { entity_type: 'party', entity_id: 'player', from: '회사 · 도심', to: '학교' },
              { entity_type: 'vehicle', entity_id: 'family_car', from: '회사 · 도심', to: '학교' },
            ],
            resource_changes: [],
            world_changes: [{ key: 'route', from: undefined, to: 'checked' }],
          }),
        },
        {
          id: 2,
          label: '회사에서 통신 상태를 확인한다',
          action: action('synthetic-check-comms', '통신 상태 확인', {
            time_delta_min: 10,
            moves: [],
            resource_changes: [{ resource_id: 'communications', from: '불안정', to: '점검 중' }],
            world_changes: [],
          }),
        },
      ],
      presentation_blocks: [{ type: 'EVENT', message: 'synthetic fixture only' }],
    },
    committed_turn: {
      number: 0,
      log: [{ id: 0, kind: 'scene', text: 'synthetic public runtime checkpoint started' }],
    },
    public_state: publicState,
  })
}

function syntheticNextChoices(turn: number): PublicRuntimeScene['choices'] {
  return [{
    id: 1,
    label: '공개 상태를 다시 확인한다',
    action: action(`synthetic-check-${turn}`, '공개 상태 확인', {
      time_delta_min: 5, moves: [], resource_changes: [], world_changes: [],
    }),
  }]
}

function mockProposal(checkpoint: PublicRuntimeCheckpoint, actions: QueuedAction[], narrative: string) {
  return {
    actions,
    narrative,
    next_choices: syntheticNextChoices(checkpoint.public_state.completed_actions.length + actions.length + 1),
    presentation_blocks: [{ type: 'EVENT' as const, message: 'synthetic MockProvider proposal' }],
    visible_reaction: '가족은 현재 공개된 상태를 바탕으로 각자 다음 판단을 준비한다.',
  }
}

/** Synthetic-only provider for Phase 3a UI and regression coverage. It never calls a network or reads Canon data. */
export function createSyntheticMockProvider(): GMProvider {
  return new MockProvider(({ input, checkpoint }) => {
    if (input.kind === 'numbered-choice') {
      const choice = checkpoint.current_scene.choices.find((item) => item.id === input.choice_id)
      return choice
        ? { status: 'proposal', proposal: mockProposal(checkpoint, [choice.action], `선택 ${choice.id}의 결과를 정리합니다.`) }
        : { status: 'unavailable', message: '선택지를 찾지 못했습니다.' }
    }

    if (input.text.includes('통신 상태를 확인하고 가족 차량으로 학교에 간다')) {
      const communications = checkpoint.current_scene.choices.find((item) => item.id === 2)?.action
      const school = checkpoint.current_scene.choices.find((item) => item.id === 1)?.action
      return communications && school
        ? { status: 'proposal', proposal: mockProposal(checkpoint, [communications, school], '통신 확인 뒤 학교 이동을 순서대로 제안합니다.') }
        : { status: 'unavailable', message: '이 장면에서는 복합 행동을 제안할 수 없습니다.' }
    }
    if (input.text.includes('통신 상태를 확인한다')) {
      const communications = checkpoint.current_scene.choices.find((item) => item.id === 2)?.action
      return communications
        ? { status: 'proposal', proposal: mockProposal(checkpoint, [communications], '통신 상태를 점검하도록 제안합니다.') }
        : { status: 'unavailable', message: '이 장면에서는 통신을 점검할 수 없습니다.' }
    }
    if (input.text.includes('학교에 있는 가족 차량')) {
      return {
        status: 'proposal',
        proposal: mockProposal(checkpoint, [action('synthetic-impossible-car', '학교 차량 이동 시도', {
          time_delta_min: 20,
          moves: [
            { entity_type: 'party', entity_id: 'player', from: '학교', to: '대피소' },
            { entity_type: 'vehicle', entity_id: 'family_car', from: '학교', to: '대피소' },
          ],
          resource_changes: [], world_changes: [],
        })], '의도는 이해했지만 엔진이 현재 차량 위치를 검증합니다.'),
      }
    }
    return { status: 'unavailable', message: 'MockProvider가 이 자유행동의 제안을 준비하지 못했습니다.' }
  })
}
