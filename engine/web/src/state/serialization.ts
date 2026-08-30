import { LIVE_STATE_VERSION, type LiveState } from './liveState'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasLiveStateShape(value: unknown): value is LiveState {
  if (!isRecord(value) || value.version !== LIVE_STATE_VERSION) return false
  if (typeof value.season_id !== 'string' || typeof value.scene_id !== 'string') return false
  if (!isRecord(value.clock) || !isRecord(value.party)) return false
  const party = value.party
  if (typeof value.clock.day !== 'number' || (typeof value.clock.date !== 'string' && value.clock.date !== null)) return false
  if (typeof value.clock.time !== 'string' || typeof value.clock.phase !== 'string') return false

  const records = ['vehicles', 'bases', 'resources', 'institutions', 'routes_known', 'public_world', 'last_change', 'renderer_flags']
  if (!records.every((key) => isRecord(value[key]))) return false
  if (!Array.isArray(value.active_actions) || !Array.isArray(value.completed_actions)) return false
  return ['player', 'wife', 'son', 'father'].every((memberId) => isRecord(party[memberId]))
}

export function serializeLiveState(state: LiveState): string {
  return JSON.stringify(state)
}

export function deserializeLiveState(serialized: string): LiveState {
  const parsed: unknown = JSON.parse(serialized)
  if (!hasLiveStateShape(parsed)) throw new TypeError('Serialized value is not a Live State v1 snapshot')
  return parsed
}
