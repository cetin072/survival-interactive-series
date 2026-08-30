import { describe, expect, it } from 'vitest'
import { runActionQueue } from '../controller/actionQueue'
import { createInitialSlice } from './engine'
import { decideFamilyRequest } from './familyDecision'
import { chooseWorldEvent } from './worldDirector'

function findAmbientDecision() {
  for (let index = 0; index < 100; index += 1) {
    const slice = createInitialSlice(`ambient-${index}`)
    const result = decideFamilyRequest(slice.live, slice.pressure, undefined, slice.rng, 3)
    if (result.decision?.action) return { slice, result }
  }
  return null
}

describe('M3-V autonomy guards', () => {
  it('does not force an ambient family action every turn', () => {
    const slice = createInitialSlice('ambient-idle')
    const result = decideFamilyRequest(slice.live, slice.pressure, undefined, slice.rng, 1)
    expect(result.decision).toBeNull()
    expect(result.rng).toEqual(slice.rng)
  })

  it('can produce a deterministic autonomous family action and commits it through M2', () => {
    const found = findAmbientDecision()
    expect(found).not.toBeNull()
    if (!found?.result.decision?.action) return

    const repeated = decideFamilyRequest(found.slice.live, found.slice.pressure, undefined, found.slice.rng, 3)
    expect(repeated.decision?.member).toBe(found.result.decision.member)
    expect(repeated.decision?.kind).toBe('independent_action')

    const committed = runActionQueue(found.slice.live, [found.result.decision.action])
    expect(committed.results[0].validation.status).toMatch(/ACCEPT/)
    expect(committed.state.party[found.result.decision.member].location)
      .not.toBe(found.slice.live.party[found.result.decision.member].location)
  })

  it('respects event cooldown by excluding a just-used archetype', () => {
    let candidate: ReturnType<typeof createInitialSlice> | null = null
    let firstEventId: string | null = null

    for (let index = 0; index < 100; index += 1) {
      const slice = createInitialSlice(`cooldown-${index}`)
      const first = chooseWorldEvent(slice)
      if (first.event) {
        candidate = slice
        firstEventId = first.event.id
        break
      }
    }

    expect(candidate).not.toBeNull()
    expect(firstEventId).not.toBeNull()
    if (!candidate || !firstEventId) return

    const guarded = {
      ...candidate,
      currentEventId: firstEventId,
      recentEvents: [{ id: firstEventId, turn: candidate.turn }],
    }
    const next = chooseWorldEvent(guarded)
    expect(next.event?.id ?? null).not.toBe(firstEventId)
  })
})
