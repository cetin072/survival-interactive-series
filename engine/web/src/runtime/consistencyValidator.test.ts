import { describe, expect, it } from 'vitest'
import { validateRuntimeConsistency } from './consistencyValidator'
import { baselineCharacters, baselineRuntime } from './fixtures'
import { runtimeCanon } from './runtimeCanon'
import type { RuntimeState } from './types'

function codes(state: RuntimeState): string[] {
  return validateRuntimeConsistency(state, baselineCharacters, runtimeCanon).map((item) => item.code)
}

describe('Runtime State consistency validator', () => {
  it('blocks family location, companion symmetry, and self-companion conflicts', () => {
    const state = structuredClone(baselineRuntime)
    state.family[0].location = '다른 위치'
    state.family[0].together_with.push('player')
    state.family[1].together_with = state.family[1].together_with.filter((id) => id !== 'player')
    expect(codes(state)).toEqual(expect.arrayContaining(['FAMILY_LOCATION_CONFLICT', 'COMPANION_ASYMMETRY', 'SELF_COMPANION']))
  })

  it('blocks vehicle user location and unknown references', () => {
    const state = structuredClone(baselineRuntime)
    state.vehicles![0].location = '외곽거점'
    state.vehicles![0].current_user = 'missing'
    state.active_actions = [{ id: 'move', label: '이동', actors: ['missing'], vehicle_ids: ['missing'], base_ids: ['missing'] }]
    expect(codes(state)).toEqual(expect.arrayContaining(['UNKNOWN_FAMILY_REFERENCE', 'UNKNOWN_VEHICLE_REFERENCE', 'UNKNOWN_BASE_REFERENCE']))
  })

  it('detects malformed and reversed time', () => {
    const state = structuredClone(baselineRuntime)
    state.clock.time = '25:90'
    state.recent_changes = [
      { id: 'later', at: '2026-08-31T10:00:00Z', type: 'phase', message: 'later' },
      { id: 'earlier', at: '2026-08-31T09:00:00Z', type: 'phase', message: 'earlier' },
    ]
    expect(codes(state)).toEqual(expect.arrayContaining(['INVALID_TIME', 'TIME_REVERSAL']))
  })

  it('blocks completed action replay and simultaneous action conflicts', () => {
    const state = structuredClone(baselineRuntime)
    state.completed_action_ids = ['done']
    state.active_actions = [
      { id: 'done', label: '완료', actors: ['player'], exclusive_resources: ['family_car'] },
      { id: 'other', label: '충돌', actors: ['player'], exclusive_resources: ['family_car'] },
    ]
    expect(codes(state)).toEqual(expect.arrayContaining(['COMPLETED_ACTION_ACTIVE', 'ACTIVE_ACTION_CONFLICT']))
  })

  it('blocks Canon ownership and base capability changes', () => {
    const state = structuredClone(baselineRuntime)
    state.vehicles![0].owner_id = 'outsider'
    state.bases![0].owner_id = 'outsider'
    state.bases![0].capabilities.push('teleport')
    expect(codes(state)).toEqual(expect.arrayContaining(['CANON_OWNERSHIP_CONFLICT', 'CANON_CAPABILITY_CONFLICT']))
  })

  it('blocks invalid resource bands and checkpoint version drift', () => {
    const state = structuredClone(baselineRuntime)
    state.resources![0].band = 'infinite'
    state.latest_checkpoint.phase = 'P0'
    state.latest_checkpoint.runtime_schema_version = 2
    expect(codes(state)).toEqual(expect.arrayContaining(['INVALID_RESOURCE_BAND', 'SEASON_PHASE_MISMATCH', 'CHECKPOINT_VERSION_MISMATCH']))
  })
})
