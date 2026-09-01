import type { LiveState } from './liveState'

export type GameSnapshot = {
  day: string
  time: string
  location: string
  family: string[][]
  resources: string[][]
}

export function createGameSnapshot(state: LiveState): GameSnapshot {
  return {
    day: `DAY ${String(state.clock.day).padStart(2, '0')}`,
    time: state.clock.time,
    location: state.party.player.location,
    family: Object.values(state.party).map((member) => [member.name, member.location, member.status]),
    resources: Object.values(state.resources).map((resource) => [`${resource.icon} ${resource.name}`, resource.band]),
  }
}
