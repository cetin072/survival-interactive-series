import { actionForIntent, choicesForState } from './engine'
import { eventArchetypes } from './events'
import type { SliceChoice, SliceState } from './types'

export function contextualChoicesForState(state: SliceState): SliceChoice[] {
  const base = choicesForState(state)
  if (!state.currentEventId) return base

  const event = eventArchetypes.find((candidate) => candidate.id === state.currentEventId)
  if (!event) return base

  const focus = actionForIntent(state, event.choiceHook, `event-${state.turn + 1}`)
  const contextualFocus: SliceChoice = { ...focus, id: 1, label: event.choiceLabel }
  return [contextualFocus, ...base.filter((choice) => choice.id !== 1)]
}
