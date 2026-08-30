import { eventArchetypes } from './events'
import { nextRandom, pickIndex, type RngState } from './rng'
import type { EventArchetype, SliceState } from './types'

export type DirectorResult = {
  event: EventArchetype | null
  rng: RngState
  repetitionGuard: boolean
}

function eligibleEvents(state: SliceState): EventArchetype[] {
  return eventArchetypes.filter((event) => {
    if (state.pressure < event.minPressure || state.pressure > event.maxPressure) return false
    const latest = [...state.recentEvents].reverse().find((item) => item.id === event.id)
    if (!latest) return true
    return state.turn - latest.turn >= event.cooldown
  })
}

export function chooseWorldEvent(state: SliceState): DirectorResult {
  const gate = nextRandom(state.rng)
  const noEventThreshold = state.pressure <= 1 ? 0.42 : state.pressure >= 4 ? 0.12 : 0.26
  if (gate.value < noEventThreshold) {
    return { event: null, rng: gate.state, repetitionGuard: false }
  }

  const eligible = eligibleEvents(state)
  if (eligible.length === 0) {
    return { event: null, rng: gate.state, repetitionGuard: true }
  }

  const weighted = eligible.flatMap((event) => Array.from({ length: Math.max(1, event.weight) }, () => event))
  const picked = pickIndex(gate.state, weighted.length)
  const event = weighted[picked.index]
  const lastEvent = state.currentEventId

  if (event?.id === lastEvent && eligible.length > 1) {
    const fallback = eligible.find((candidate) => candidate.id !== lastEvent) ?? event
    return { event: fallback, rng: picked.state, repetitionGuard: true }
  }

  return { event: event ?? null, rng: picked.state, repetitionGuard: false }
}

export function clampPressure(value: number): number {
  return Math.max(0, Math.min(4, value))
}
