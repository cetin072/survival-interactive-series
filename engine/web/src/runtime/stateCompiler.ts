import { validateRuntimeConsistency } from './consistencyValidator'
import type { CharactersFile, RuntimeCanon, RuntimeState, StateConsoleView } from './types'

const bandLabels: Record<string, string> = {
  stable: '안정',
  adequate: '충분',
  strained: '주의',
  critical: '위험',
  depleted: '고갈',
  unknown: '미확인',
}

export function compileStateConsole(state: RuntimeState, characters: CharactersFile, canon: RuntimeCanon): StateConsoleView {
  const runtimeFamily = new Map((state.family ?? []).map((member) => [member.id, member]))
  const family = characters.members.flatMap((character) => {
    const member = runtimeFamily.get(character.id)
    return member ? [{ ...member, name: character.name, age: character.age, sex: character.sex, relation: character.relation }] : []
  })

  return {
    header: {
      season: state.season_id,
      phase: state.phase,
      date: state.clock.date ?? '미기록',
      time: state.clock.time ?? '미기록',
      location: state.player_location,
    },
    family,
    vehicles: (state.vehicles ?? []).map((vehicle) => ({ ...vehicle })),
    resources: (state.resources ?? []).map((resource) => ({ ...resource, band_label: bandLabels[resource.band] ?? resource.band })),
    bases: (state.bases ?? []).map((base) => ({ ...base, capabilities: [...base.capabilities] })),
    active_actions: (state.active_actions ?? []).map((action) => ({ ...action, actors: [...action.actors] })),
    recent_changes: (state.recent_changes ?? []).map((change) => ({ ...change })),
    checkpoint: { ...state.latest_checkpoint },
    warnings: validateRuntimeConsistency(state, characters, canon),
  }
}
