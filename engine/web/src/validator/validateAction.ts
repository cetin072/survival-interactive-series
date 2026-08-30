import type { JsonValue, LiveState, PartyMemberId } from '../state/liveState'
import type {
  LocationMove,
  QueuedAction,
  StateChangeProposal,
  ValidationIssue,
  ValidatorResult,
} from './types'

const partyMemberIds: PartyMemberId[] = ['player', 'wife', 'son', 'father']

function issue(code: ValidationIssue['code'], message: string): ValidationIssue {
  return { code, message }
}

function jsonEquals(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => jsonEquals(value, right[index]))
  }
  if (
    typeof left === 'object' && left !== null && !Array.isArray(left)
    && typeof right === 'object' && right !== null && !Array.isArray(right)
  ) {
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => key === rightKeys[index] && jsonEquals(left[key], right[key]))
  }
  return false
}

function currentStateIssues(state: LiveState): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const memberId of partyMemberIds) {
    const member = state.party[memberId]
    for (const companionId of member.with) {
      if (member.location !== state.party[companionId].location) {
        issues.push(issue('PARTY_LOCATION_CONFLICT', `${memberId} and ${companionId} are together but have different locations`))
      }
      if (companionId === memberId) {
        issues.push(issue('PARTY_SELF_COMPANION', `${memberId} cannot be their own companion`))
      } else if (!state.party[companionId].with.includes(memberId)) {
        issues.push(issue('PARTY_COMPANION_ASYMMETRY', `${memberId} lists ${companionId} as a companion, but the relation is not reciprocal`))
      }
    }
  }

  for (const [vehicleId, vehicle] of Object.entries(state.vehicles)) {
    if (vehicle.operator && state.party[vehicle.operator].location !== vehicle.location) {
      issues.push(issue('VEHICLE_LOCATION_CONFLICT', `${vehicleId} and its operator have different locations`))
    }
  }

  return issues
}

function hasDuplicateMove(moves: LocationMove[]): boolean {
  const entities = new Set<string>()
  return moves.some((move) => {
    const key = `${move.entity_type}:${move.entity_id}`
    if (entities.has(key)) return true
    entities.add(key)
    return false
  })
}

function validateFromValues(state: LiveState, proposal: StateChangeProposal): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const move of proposal.moves) {
    const entity = move.entity_type === 'party'
      ? state.party[move.entity_id as PartyMemberId]
      : state.vehicles[move.entity_id]

    if (!entity) {
      issues.push(issue('UNKNOWN_ENTITY', `Unknown ${move.entity_type}: ${move.entity_id}`))
    } else if (entity.location !== move.from) {
      issues.push(issue('FROM_STATE_MISMATCH', `${move.entity_type}:${move.entity_id} is at ${entity.location}, not ${move.from}`))
    }
  }

  for (const change of proposal.resource_changes) {
    const resource = state.resources[change.resource_id]
    if (!resource) {
      issues.push(issue('UNKNOWN_ENTITY', `Unknown resource: ${change.resource_id}`))
    } else if (resource.band !== change.from) {
      issues.push(issue('FROM_STATE_MISMATCH', `resource:${change.resource_id} is ${resource.band}, not ${change.from}`))
    }
  }

  for (const change of proposal.world_changes) {
    if (!jsonEquals(state.public_world[change.key], change.from)) {
      issues.push(issue('FROM_STATE_MISMATCH', `public_world:${change.key} no longer matches the proposal`))
    }
  }

  return issues
}

function adjustVehicleOperatorMoves(state: LiveState, proposal: StateChangeProposal): {
  proposal: StateChangeProposal
  issues: ValidationIssue[]
} {
  const moves = proposal.moves.map((move) => ({ ...move }))
  const issues: ValidationIssue[] = []

  for (const vehicleMove of moves.filter((move) => move.entity_type === 'vehicle')) {
    const vehicle = state.vehicles[vehicleMove.entity_id]
    if (!vehicle?.operator) continue

    const operatorMove = moves.find(
      (move) => move.entity_type === 'party' && move.entity_id === vehicle.operator,
    )
    if (!operatorMove && state.party[vehicle.operator].location === vehicleMove.from) {
      moves.push({
        entity_type: 'party',
        entity_id: vehicle.operator,
        from: vehicleMove.from,
        to: vehicleMove.to,
      })
      issues.push(issue('VEHICLE_OPERATOR_MOVE_ADDED', `Moved ${vehicle.operator} with ${vehicleMove.entity_id}`))
    }
  }

  return { proposal: { ...proposal, moves }, issues }
}

function proposedLocationIssues(state: LiveState, proposal: StateChangeProposal): ValidationIssue[] {
  const partyLocations = Object.fromEntries(
    Object.entries(state.party).map(([id, member]) => [id, member.location]),
  ) as Record<PartyMemberId, string>
  const vehicleLocations = Object.fromEntries(
    Object.entries(state.vehicles).map(([id, vehicle]) => [id, vehicle.location]),
  )

  for (const move of proposal.moves) {
    if (move.entity_type === 'party') partyLocations[move.entity_id as PartyMemberId] = move.to
    else vehicleLocations[move.entity_id] = move.to
  }

  const issues: ValidationIssue[] = []
  for (const memberId of partyMemberIds) {
    for (const companionId of state.party[memberId].with) {
      if (partyLocations[memberId] !== partyLocations[companionId]) {
        issues.push(issue('PARTY_LOCATION_CONFLICT', `${memberId} and ${companionId} would end in different locations`))
      }
    }
  }
  for (const [vehicleId, vehicle] of Object.entries(state.vehicles)) {
    if (vehicle.operator && vehicleLocations[vehicleId] !== partyLocations[vehicle.operator]) {
      issues.push(issue('VEHICLE_LOCATION_CONFLICT', `${vehicleId} and its operator would end in different locations`))
    }
  }
  return issues
}

export function validateAction(state: LiveState, action: QueuedAction): ValidatorResult {
  const invalidState = currentStateIssues(state)
  if (invalidState.length > 0) return { status: 'NEED_GM_REPLAN', issues: invalidState }

  if (state.completed_actions.some((completed) => completed.id === action.id)) {
    return {
      status: 'REJECT_STATE_CONFLICT',
      issues: [issue('COMPLETED_ACTION_REPEAT', `${action.id} is already completed`)],
    }
  }

  const activeActor = state.active_actions.find((active) => active.actors?.some((actor) => action.actors.includes(actor)))
  if (activeActor) {
    return {
      status: 'REJECT_STATE_CONFLICT',
      issues: [issue('ACTIVE_ACTION_CONFLICT', `${activeActor.id} already uses the same actor`)],
    }
  }

  const resources = new Set(action.exclusive_resources ?? [])
  const activeResource = state.active_actions.find((active) => active.exclusive_resources?.some((resource) => resources.has(resource)))
  if (activeResource) {
    return {
      status: 'REJECT_STATE_CONFLICT',
      issues: [issue('EXCLUSIVE_RESOURCE_CONFLICT', `${activeResource.id} already uses an exclusive resource`)],
    }
  }

  if (!Number.isInteger(action.proposal.time_delta_min) || action.proposal.time_delta_min < 0) {
    return {
      status: 'REJECT_STATE_CONFLICT',
      issues: [issue('TIME_REVERSAL', 'time_delta_min must be a non-negative integer')],
    }
  }

  if (hasDuplicateMove(action.proposal.moves)) {
    return {
      status: 'NEED_GM_REPLAN',
      issues: [issue('DUPLICATE_ENTITY_MOVE', 'One action moves the same entity more than once')],
    }
  }

  const fromIssues = validateFromValues(state, action.proposal)
  if (fromIssues.length > 0) {
    const status = fromIssues.some((item) => item.code === 'UNKNOWN_ENTITY') ? 'NEED_GM_REPLAN' : 'REJECT_STATE_CONFLICT'
    return { status, issues: fromIssues }
  }

  const adjusted = adjustVehicleOperatorMoves(state, action.proposal)
  const locationIssues = proposedLocationIssues(state, adjusted.proposal)
  if (locationIssues.length > 0) return { status: 'NEED_GM_REPLAN', issues: locationIssues }

  if (adjusted.issues.length > 0) {
    return { status: 'ACCEPT_WITH_ADJUSTMENT', issues: adjusted.issues, proposal: adjusted.proposal }
  }
  return { status: 'ACCEPT', issues: [], proposal: action.proposal }
}
