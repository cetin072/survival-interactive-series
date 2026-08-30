import type { LiveState, PartyMemberId } from '../state/liveState'
import type { QueuedAction, ValidatorResult } from '../validator/types'
import type { RngState } from './rng'

export type SliceIntent =
  | 'observe'
  | 'wait'
  | 'go_home'
  | 'go_base'
  | 'check_resources'
  | 'call_wife'
  | 'call_father'

export type FamilyRequest = {
  member: Extract<PartyMemberId, 'wife' | 'father'>
  request: 'hold_position' | 'check_local_area'
}

export type SliceChoice = {
  id: number
  label: string
  intent: SliceIntent
  action: QueuedAction
  familyRequest?: FamilyRequest
}

export type EventArchetype = {
  id: string
  title: string
  narrative: string
  minPressure: number
  maxPressure: number
  cooldown: number
  pressureDelta: -1 | 0 | 1
  weight: number
  choiceHook: Extract<SliceIntent, 'observe' | 'check_resources'>
  choiceLabel: string
}

export type FamilyDecisionKind = 'agree' | 'conditional_agree' | 'refuse' | 'delay' | 'independent_action'

export type FamilyDecision = {
  member: Extract<PartyMemberId, 'wife' | 'father'>
  kind: FamilyDecisionKind
  text: string
  action?: QueuedAction
}

export type SliceLogEntry = {
  turn: number
  action: string
  elapsedMinutes: number
  eventId: string | null
  familyDecision: string | null
  validator: string
  repetitionGuard: boolean
}

export type SliceState = {
  version: 1
  live: LiveState
  worldSeed: string
  rng: RngState
  turn: number
  pressure: number
  currentEventId: string | null
  recentEvents: { id: string; turn: number }[]
  narrative: string
  lastFamilyDecision: FamilyDecision | null
  log: SliceLogEntry[]
}

export type TurnResult = {
  state: SliceState
  validation: ValidatorResult | null
  choiceLabel: string
}
