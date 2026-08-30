import { demoLiveState } from '../../state/demoLiveState'
import { deserializeLiveState, serializeLiveState } from '../../state/serialization'
import type { LiveState } from '../../state/liveState'
import type { QueuedAction } from '../types'

function freshState(): LiveState {
  return deserializeLiveState(serializeLiveState(demoLiveState))
}

function emptyProposal(): QueuedAction['proposal'] {
  return { time_delta_min: 0, moves: [], resource_changes: [], world_changes: [] }
}

export const regressionFixtures = {
  familyLocationGate(): { state: LiveState; action: QueuedAction } {
    const state = freshState()
    state.party.player.with = ['wife']
    return {
      state,
      action: { id: 'confirm-family', label: '가족 위치 확인', actors: ['player'], proposal: emptyProposal() },
    }
  },

  vehicleOperatorMismatch(): { state: LiveState; action: QueuedAction } {
    const state = freshState()
    state.vehicles.family_car.location = '학교'
    return {
      state,
      action: { id: 'use-car', label: '차량 사용', actors: ['player'], proposal: emptyProposal() },
    }
  },

  completedActionReplay(): { state: LiveState; action: QueuedAction } {
    const state = freshState()
    state.completed_actions.push({ id: 'family-reunion', label: '가족 합류', status: 'completed', actors: ['player'] })
    return {
      state,
      action: { id: 'family-reunion', label: '가족 합류', actors: ['player'], proposal: emptyProposal() },
    }
  },

  simultaneousActorConflict(): { state: LiveState; action: QueuedAction } {
    const state = freshState()
    state.active_actions.push({ id: 'drive-home', label: '집으로 이동', status: 'active', actors: ['player'] })
    return {
      state,
      action: { id: 'drive-school', label: '학교로 이동', actors: ['player'], proposal: emptyProposal() },
    }
  },

  sequentialOpportunityCost(): { state: LiveState; actions: QueuedAction[] } {
    const state = freshState()
    return {
      state,
      actions: [
        {
          id: 'go-school',
          label: '학교로 이동',
          actors: ['player'],
          proposal: {
            time_delta_min: 20,
            moves: [
              { entity_type: 'party', entity_id: 'player', from: '회사 · 도심', to: '학교' },
              { entity_type: 'vehicle', entity_id: 'family_car', from: '회사 · 도심', to: '학교' },
            ],
            resource_changes: [],
            world_changes: [{ key: 'school_pickup_open', from: undefined, to: false }],
          },
        },
        {
          id: 'late-pickup',
          label: '기존 위치에서 후속 이동',
          actors: ['player'],
          conflict_outcome: 'opportunity_lost',
          proposal: {
            time_delta_min: 10,
            moves: [{ entity_type: 'party', entity_id: 'player', from: '회사 · 도심', to: '도심 아파트' }],
            resource_changes: [],
            world_changes: [],
          },
        },
      ],
    }
  },
}
