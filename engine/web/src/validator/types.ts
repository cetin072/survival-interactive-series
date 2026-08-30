import type { JsonValue, LiveState, PartyMemberId } from '../state/liveState'

export type ValidatorStatus =
  | 'ACCEPT'
  | 'ACCEPT_WITH_ADJUSTMENT'
  | 'REJECT_STATE_CONFLICT'
  | 'NEED_GM_REPLAN'

export type ActionOutcome =
  | 'success'
  | 'partial_success'
  | 'delayed'
  | 'blocked'
  | 'opportunity_lost'
  | 'cancelled_by_state_change'

export type ConflictOutcome = Exclude<ActionOutcome, 'success' | 'partial_success'>

export type LocationMove = {
  entity_type: 'party' | 'vehicle'
  entity_id: string
  from: string
  to: string
}

export type ResourceChange = {
  resource_id: string
  from: string
  to: string
}

export type WorldChange = {
  key: string
  from: JsonValue | undefined
  to: JsonValue
}

export type StateChangeProposal = {
  time_delta_min: number
  moves: LocationMove[]
  resource_changes: ResourceChange[]
  world_changes: WorldChange[]
}

export type QueuedAction = {
  id: string
  label: string
  actors: PartyMemberId[]
  exclusive_resources?: string[]
  conflict_outcome?: ConflictOutcome
  proposal: StateChangeProposal
}

export type ValidationIssueCode =
  | 'PARTY_LOCATION_CONFLICT'
  | 'VEHICLE_LOCATION_CONFLICT'
  | 'DUPLICATE_ENTITY_MOVE'
  | 'UNKNOWN_ENTITY'
  | 'FROM_STATE_MISMATCH'
  | 'TIME_REVERSAL'
  | 'COMPLETED_ACTION_REPEAT'
  | 'ACTIVE_ACTION_CONFLICT'
  | 'EXCLUSIVE_RESOURCE_CONFLICT'
  | 'VEHICLE_OPERATOR_MOVE_ADDED'

export type ValidationIssue = {
  code: ValidationIssueCode
  message: string
}

export type AcceptedValidation = {
  status: 'ACCEPT' | 'ACCEPT_WITH_ADJUSTMENT'
  issues: ValidationIssue[]
  proposal: StateChangeProposal
}

export type RejectedValidation = {
  status: 'REJECT_STATE_CONFLICT' | 'NEED_GM_REPLAN'
  issues: ValidationIssue[]
}

export type ValidatorResult = AcceptedValidation | RejectedValidation

export type ActionExecutionResult = {
  action_id: string
  outcome: ActionOutcome
  validation: ValidatorResult
}

export type ActionQueueResult = {
  state: LiveState
  results: ActionExecutionResult[]
}
