import type { ActionState, LiveState } from '../state/liveState'
import { advanceClock, movePartyMember, moveVehicle, setResourceBand } from '../state/transitions'
import type { ActionOutcome, ActionQueueResult, QueuedAction, StateChangeProposal } from '../validator/types'
import { validateAction } from '../validator/validateAction'

function applyProposal(state: LiveState, proposal: StateChangeProposal): LiveState {
  let next = state

  for (const move of proposal.moves) {
    next = move.entity_type === 'party'
      ? movePartyMember(next, move.entity_id as keyof LiveState['party'], move.to)
      : moveVehicle(next, move.entity_id, move.to)
  }
  for (const change of proposal.resource_changes) {
    next = setResourceBand(next, change.resource_id, change.to)
  }
  if (proposal.world_changes.length > 0) {
    const publicWorld = { ...next.public_world }
    for (const change of proposal.world_changes) publicWorld[change.key] = change.to
    next = { ...next, public_world: publicWorld }
  }
  return advanceClock(next, proposal.time_delta_min)
}

function completeAction(state: LiveState, action: QueuedAction): LiveState {
  const completed: ActionState = {
    id: action.id,
    label: action.label,
    status: 'completed',
    actors: [...action.actors],
    exclusive_resources: [...(action.exclusive_resources ?? [])],
  }
  return {
    ...state,
    active_actions: state.active_actions.filter((active) => active.id !== action.id),
    completed_actions: [...state.completed_actions, completed],
  }
}

export function runActionQueue(initialState: LiveState, actions: readonly QueuedAction[]): ActionQueueResult {
  let state = initialState
  const results: ActionQueueResult['results'] = []

  for (const action of actions) {
    const validation = validateAction(state, action)
    if (validation.status === 'ACCEPT' || validation.status === 'ACCEPT_WITH_ADJUSTMENT') {
      state = completeAction(applyProposal(state, validation.proposal), action)
      const outcome: ActionOutcome = validation.status === 'ACCEPT' ? 'success' : 'partial_success'
      results.push({ action_id: action.id, outcome, validation })
      continue
    }

    const outcome = action.conflict_outcome
      ?? (validation.status === 'NEED_GM_REPLAN' ? 'cancelled_by_state_change' : 'blocked')
    results.push({ action_id: action.id, outcome, validation })
  }

  return { state, results }
}
