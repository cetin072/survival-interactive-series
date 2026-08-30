import { describe, expect, it } from 'vitest'
import { demoLiveState } from '../state/demoLiveState'
import { deserializeLiveState, serializeLiveState } from '../state/serialization'
import type { QueuedAction } from '../validator/types'
import { runActionQueue } from './actionQueue'

function freshState() {
  return deserializeLiveState(serializeLiveState(demoLiveState))
}

describe('M2 Action Queue', () => {
  it('applies state, time, and world updates before validating the next action', () => {
    const actions: QueuedAction[] = [
      {
        id: 'go-school', label: '학교로 이동', actors: ['player'],
        proposal: {
          time_delta_min: 20,
          moves: [
            { entity_type: 'party', entity_id: 'player', from: '회사 · 도심', to: '학교' },
            { entity_type: 'vehicle', entity_id: 'family_car', from: '회사 · 도심', to: '학교' },
          ],
          resource_changes: [],
          world_changes: [{ key: 'road_status', from: undefined, to: 'congested' }],
        },
      },
      {
        id: 'go-home', label: '집으로 이동', actors: ['player'],
        proposal: {
          time_delta_min: 15,
          moves: [
            { entity_type: 'party', entity_id: 'player', from: '학교', to: '도심 아파트' },
            { entity_type: 'vehicle', entity_id: 'family_car', from: '학교', to: '도심 아파트' },
          ],
          resource_changes: [{ resource_id: 'communications', from: '불안정', to: '점검 중' }],
          world_changes: [{ key: 'road_status', from: 'congested', to: 'restricted' }],
        },
      },
    ]

    const result = runActionQueue(freshState(), actions)
    expect(result.results.map((item) => item.outcome)).toEqual(['success', 'success'])
    expect(result.state.clock.time).toBe('18:15')
    expect(result.state.party.player.location).toBe('도심 아파트')
    expect(result.state.vehicles.family_car.location).toBe('도심 아파트')
    expect(result.state.public_world.road_status).toBe('restricted')
    expect(result.state.completed_actions.map((item) => item.id)).toEqual(['go-school', 'go-home'])
  })

  it('turns a stale follow-up into opportunity_lost after revalidation', () => {
    const actions: QueuedAction[] = [
      {
        id: 'leave-office', label: '회사를 떠난다', actors: ['player'],
        proposal: {
          time_delta_min: 20,
          moves: [
            { entity_type: 'party', entity_id: 'player', from: '회사 · 도심', to: '학교' },
            { entity_type: 'vehicle', entity_id: 'family_car', from: '회사 · 도심', to: '학교' },
          ], resource_changes: [], world_changes: [],
        },
      },
      {
        id: 'office-supplies', label: '회사 물자를 챙긴다', actors: ['player'], conflict_outcome: 'opportunity_lost',
        proposal: {
          time_delta_min: 5,
          moves: [{ entity_type: 'party', entity_id: 'player', from: '회사 · 도심', to: '창고' }],
          resource_changes: [], world_changes: [],
        },
      },
    ]

    const result = runActionQueue(freshState(), actions)
    expect(result.results.map((item) => item.outcome)).toEqual(['success', 'opportunity_lost'])
    expect(result.state.clock.time).toBe('18:00')
    expect(result.state.completed_actions.map((item) => item.id)).toEqual(['leave-office'])
  })

  it('returns partial_success when the Validator safely adds the vehicle operator move', () => {
    const result = runActionQueue(freshState(), [{
      id: 'move-car', label: '차량으로 이동', actors: ['player'],
      proposal: {
        time_delta_min: 10,
        moves: [{ entity_type: 'vehicle', entity_id: 'family_car', from: '회사 · 도심', to: '학교' }],
        resource_changes: [], world_changes: [],
      },
    }])

    expect(result.results[0].outcome).toBe('partial_success')
    expect(result.state.party.player.location).toBe('학교')
    expect(result.state.vehicles.family_car.location).toBe('학교')
  })

  it('revalidates repeated action ids after each commit', () => {
    const repeated: QueuedAction = {
      id: 'check-news', label: '뉴스 확인', actors: ['wife'],
      proposal: { time_delta_min: 5, moves: [], resource_changes: [], world_changes: [] },
    }
    const result = runActionQueue(freshState(), [repeated, repeated])
    expect(result.results.map((item) => item.outcome)).toEqual(['success', 'blocked'])
  })

  it('exposes delayed and cancelled_by_state_change conflict outcomes', () => {
    const delayed: QueuedAction = {
      id: 'wait-route', label: '도로 재확인', actors: ['wife'], conflict_outcome: 'delayed',
      proposal: { time_delta_min: -1, moves: [], resource_changes: [], world_changes: [] },
    }
    const cancelled: QueuedAction = {
      id: 'unknown-route', label: '미확인 차량 이동', actors: ['father'],
      proposal: {
        time_delta_min: 5,
        moves: [{ entity_type: 'vehicle', entity_id: 'missing', from: '외곽', to: '도심' }],
        resource_changes: [], world_changes: [],
      },
    }

    const result = runActionQueue(freshState(), [delayed, cancelled])
    expect(result.results.map((item) => item.outcome)).toEqual(['delayed', 'cancelled_by_state_change'])
  })
})
