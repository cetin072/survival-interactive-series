import { describe, expect, it } from 'vitest'
import { demoLiveState } from '../state/demoLiveState'
import { deserializeLiveState, serializeLiveState } from '../state/serialization'
import type { LiveState } from '../state/liveState'
import type { QueuedAction } from './types'
import { validateAction } from './validateAction'

function state(): LiveState {
  return deserializeLiveState(serializeLiveState(demoLiveState))
}

function action(overrides: Partial<QueuedAction> = {}): QueuedAction {
  return {
    id: 'move-player',
    label: '학교로 이동',
    actors: ['player'],
    proposal: {
      time_delta_min: 20,
      moves: [
        { entity_type: 'party', entity_id: 'player', from: '회사 · 도심', to: '학교' },
        { entity_type: 'vehicle', entity_id: 'family_car', from: '회사 · 도심', to: '학교' },
      ],
      resource_changes: [],
      world_changes: [],
    },
    ...overrides,
  }
}

describe('M2 Validator', () => {
  it('accepts a proposal whose from values and final locations match', () => {
    expect(validateAction(state(), action()).status).toBe('ACCEPT')
  })

  it('checks proposal from values against the current snapshot', () => {
    const candidate = action()
    candidate.proposal.moves[0].from = '학교'
    expect(validateAction(state(), candidate)).toMatchObject({ status: 'REJECT_STATE_CONFLICT' })
  })

  it('checks resource and public-world from values against the current snapshot', () => {
    const candidate = action()
    candidate.proposal.resource_changes = [{ resource_id: 'communications', from: '정상', to: '불안정' }]
    candidate.proposal.world_changes = [{ key: 'region', from: '외곽', to: '도심' }]
    const result = validateAction(state(), candidate)

    expect(result).toMatchObject({ status: 'REJECT_STATE_CONFLICT' })
    expect(result.issues.filter((item) => item.code === 'FROM_STATE_MISMATCH')).toHaveLength(2)
  })

  it('rejects time reversal', () => {
    const candidate = action()
    candidate.proposal.time_delta_min = -10
    expect(validateAction(state(), candidate)).toMatchObject({
      status: 'REJECT_STATE_CONFLICT',
      issues: [{ code: 'TIME_REVERSAL' }],
    })
  })

  it('rejects an already completed action', () => {
    const current = state()
    current.completed_actions.push({ id: 'move-player', label: '학교로 이동', status: 'completed' })
    expect(validateAction(current, action())).toMatchObject({
      status: 'REJECT_STATE_CONFLICT',
      issues: [{ code: 'COMPLETED_ACTION_REPEAT' }],
    })
  })

  it('rejects actor and exclusive-resource conflicts with active actions', () => {
    const actorBusy = state()
    actorBusy.active_actions.push({ id: 'busy', label: '이동 중', status: 'active', actors: ['player'] })
    expect(validateAction(actorBusy, action())).toMatchObject({
      status: 'REJECT_STATE_CONFLICT', issues: [{ code: 'ACTIVE_ACTION_CONFLICT' }],
    })

    const carBusy = state()
    carBusy.active_actions.push({ id: 'car-busy', label: '차량 사용 중', status: 'active', exclusive_resources: ['family_car'] })
    expect(validateAction(carBusy, action({ actors: ['wife'], exclusive_resources: ['family_car'] }))).toMatchObject({
      status: 'REJECT_STATE_CONFLICT', issues: [{ code: 'EXCLUSIVE_RESOURCE_CONFLICT' }],
    })
  })

  it('requests replanning for duplicate entity moves', () => {
    const candidate = action()
    candidate.proposal.moves.push({ entity_type: 'party', entity_id: 'player', from: '회사 · 도심', to: '외곽거점' })
    expect(validateAction(state(), candidate)).toMatchObject({
      status: 'NEED_GM_REPLAN', issues: [{ code: 'DUPLICATE_ENTITY_MOVE' }],
    })
  })

  it('rejects an asymmetric companion relation even when locations match', () => {
    const current = state()
    current.party.wife.location = current.party.player.location
    current.party.player.with = ['wife']

    expect(validateAction(current, action())).toMatchObject({
      status: 'NEED_GM_REPLAN', issues: [{ code: 'PARTY_COMPANION_ASYMMETRY' }],
    })
  })

  it('rejects a party member listing themselves as a companion', () => {
    const current = state()
    current.party.player.with = ['player']

    expect(validateAction(current, action())).toMatchObject({
      status: 'NEED_GM_REPLAN', issues: [{ code: 'PARTY_SELF_COMPANION' }],
    })
  })

  it('adds a matching operator move when a valid vehicle proposal omits it', () => {
    const candidate = action()
    candidate.proposal.moves = candidate.proposal.moves.filter((move) => move.entity_type === 'vehicle')
    const result = validateAction(state(), candidate)

    expect(result.status).toBe('ACCEPT_WITH_ADJUSTMENT')
    if (result.status === 'ACCEPT_WITH_ADJUSTMENT') {
      expect(result.proposal.moves).toContainEqual({
        entity_type: 'party', entity_id: 'player', from: '회사 · 도심', to: '학교',
      })
    }
  })

  it('requests replanning when an operator and vehicle would separate', () => {
    const candidate = action()
    candidate.proposal.moves = candidate.proposal.moves.filter((move) => move.entity_type === 'party')
    expect(validateAction(state(), candidate)).toMatchObject({
      status: 'NEED_GM_REPLAN', issues: [{ code: 'VEHICLE_LOCATION_CONFLICT' }],
    })
  })
})
