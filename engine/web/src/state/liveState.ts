export const LIVE_STATE_VERSION = 1 as const

export type PartyMemberId = 'player' | 'wife' | 'son' | 'father'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type ClockState = {
  day: number
  date: string | null
  time: string
  phase: string
}

export type PartyMemberState = {
  name: string
  location: string
  with: PartyMemberId[]
  status: string
}

export type VehicleState = {
  name: string
  location: string
  status: string
  operator: PartyMemberId | null
}

export type BaseState = {
  name: string
  location: string
  status: string
}

export type ResourceState = {
  name: string
  icon: string
  band: string
}

export type InstitutionState = {
  name: string
  status: string
}

export type RouteState = {
  from: string
  to: string
  status: string
}

export type ActionState = {
  id: string
  label: string
  status: string
  actors?: PartyMemberId[]
  exclusive_resources?: string[]
}

export type LiveState = {
  version: typeof LIVE_STATE_VERSION
  season_id: string
  scene_id: string
  clock: ClockState
  party: Record<PartyMemberId, PartyMemberState>
  vehicles: Record<string, VehicleState>
  bases: Record<string, BaseState>
  resources: Record<string, ResourceState>
  institutions: Record<string, InstitutionState>
  routes_known: Record<string, RouteState>
  active_actions: ActionState[]
  completed_actions: ActionState[]
  public_world: Record<string, JsonValue>
  last_change: Record<string, JsonValue>
  renderer_flags: Record<string, boolean>
}
