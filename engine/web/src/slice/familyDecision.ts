import type { LiveState } from '../state/liveState'
import type { QueuedAction } from '../validator/types'
import { nextRandom, type RngState } from './rng'
import type { FamilyDecision, FamilyRequest } from './types'

function familyNoteAction(state: LiveState, request: FamilyRequest, note: string, turn: number): QueuedAction {
  const key = `family_plan_${request.member}`
  return {
    id: `family-${request.member}-${turn}`,
    label: `${request.member} 가족 판단 반영`,
    actors: [request.member],
    proposal: {
      time_delta_min: 0,
      moves: [],
      resource_changes: [],
      world_changes: [{ key, from: state.public_world[key], to: note }],
    },
  }
}

export function decideFamilyRequest(
  state: LiveState,
  pressure: number,
  request: FamilyRequest | undefined,
  rng: RngState,
  turn: number,
): { decision: FamilyDecision | null; rng: RngState } {
  if (!request) return { decision: null, rng }

  const roll = nextRandom(rng)
  const memberName = state.party[request.member].name
  const riskBias = pressure >= 3 ? 0.18 : 0
  const value = Math.min(0.99, roll.value + riskBias)

  if (value < 0.44) {
    return {
      rng: roll.state,
      decision: {
        member: request.member,
        kind: 'agree',
        text: `${memberName}은 요청을 이해하고 그대로 따르겠다고 답했다.`,
        action: familyNoteAction(state, request, request.request, turn),
      },
    }
  }

  if (value < 0.66) {
    return {
      rng: roll.state,
      decision: {
        member: request.member,
        kind: 'conditional_agree',
        text: `${memberName}은 상황이 더 나빠지지 않는 조건으로 요청을 따르겠다고 했다.`,
        action: familyNoteAction(state, request, `${request.request}:conditional`, turn),
      },
    }
  }

  if (value < 0.80) {
    return {
      rng: roll.state,
      decision: {
        member: request.member,
        kind: 'delay',
        text: `${memberName}은 먼저 주변을 확인한 뒤 움직이겠다고 했다.`,
        action: familyNoteAction(state, request, `${request.request}:delayed`, turn),
      },
    }
  }

  if (value < 0.92) {
    return {
      rng: roll.state,
      decision: {
        member: request.member,
        kind: 'refuse',
        text: `${memberName}은 현재 위험을 이유로 요청을 그대로 따르지 않겠다고 했다.`,
        action: familyNoteAction(state, request, `${request.request}:refused`, turn),
      },
    }
  }

  const current = state.party[request.member].location
  const destination = request.member === 'father'
    ? (current === '외곽거점' ? '외곽 창고' : '외곽거점')
    : (current === '도심 아파트' ? '아파트 주변' : '도심 아파트')

  return {
    rng: roll.state,
    decision: {
      member: request.member,
      kind: 'independent_action',
      text: `${memberName}은 요청 대신 스스로 주변 상황을 확인하기로 했다.`,
      action: {
        id: `family-independent-${request.member}-${turn}`,
        label: `${memberName} 독립 행동`,
        actors: [request.member],
        proposal: {
          time_delta_min: 5,
          moves: [{ entity_type: 'party', entity_id: request.member, from: current, to: destination }],
          resource_changes: [],
          world_changes: [],
        },
      },
    },
  }
}
