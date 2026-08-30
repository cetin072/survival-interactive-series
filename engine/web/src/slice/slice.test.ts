import { describe, expect, it } from 'vitest'
import { actionForIntent, choicesForState, createInitialSlice, executeTurn } from './engine'
import { decideFamilyRequest } from './familyDecision'
import { parseFreeAction } from './parser'
import { createRng, nextRandom } from './rng'
import { clearSlice, loadSlice, saveSlice, type StorageLike } from './storage'
import { chooseWorldEvent } from './worldDirector'

function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
  }
}

describe('M3-V zero-AI vertical slice', () => {
  it('replays the same seeded random sequence', () => {
    let first = createRng('same-seed')
    let second = createRng('same-seed')
    const firstValues: number[] = []
    const secondValues: number[] = []
    for (let index = 0; index < 8; index += 1) {
      const a = nextRandom(first)
      const b = nextRandom(second)
      firstValues.push(a.value)
      secondValues.push(b.value)
      first = a.state
      second = b.state
    }
    expect(firstValues).toEqual(secondValues)
  })

  it('makes world-director results deterministic and permits no-event turns', () => {
    const first = createInitialSlice('director-seed')
    const second = createInitialSlice('director-seed')
    const a = chooseWorldEvent(first)
    const b = chooseWorldEvent(second)
    expect(a.event?.id ?? null).toBe(b.event?.id ?? null)
    expect(a.rng).toEqual(b.rng)

    const noEventSeen = Array.from({ length: 80 }, (_, index) => chooseWorldEvent(createInitialSlice(`no-event-${index}`)))
      .some((result) => result.event === null)
    expect(noEventSeen).toBe(true)
  })

  it('makes family decisions deterministic for the same state and RNG', () => {
    const slice = createInitialSlice('family-seed')
    const request = { member: 'wife' as const, request: 'hold_position' as const }
    const first = decideFamilyRequest(slice.live, slice.pressure, request, slice.rng, 1)
    const second = decideFamilyRequest(slice.live, slice.pressure, request, slice.rng, 1)
    expect(first.decision?.kind).toBe(second.decision?.kind)
    expect(first.rng).toEqual(second.rng)
  })

  it('parses common Korean free actions and degrades safely on unknown input', () => {
    expect(parseFreeAction('아버지에게 전화해서 상황을 물어본다')).toMatchObject({ matched: true, intent: 'call_father' })
    expect(parseFreeAction('집으로 귀가한다')).toMatchObject({ matched: true, intent: 'go_home' })
    expect(parseFreeAction('완전히 새로운 이상한 행동')).toMatchObject({ matched: false })
  })

  it('saves, loads, and clears the local slice without a server', () => {
    const storage = memoryStorage()
    const state = createInitialSlice('save-seed')
    saveSlice(storage, state)
    expect(loadSlice(storage)?.worldSeed).toBe('save-seed')
    clearSlice(storage)
    expect(loadSlice(storage)).toBeNull()
  })

  it('moves the player and co-located operated vehicle through the M2 queue', () => {
    const slice = createInitialSlice('travel-seed')
    const travel = actionForIntent(slice, 'go_home')
    const result = executeTurn(slice, travel)
    expect(result.state.live.party.player.location).toBe('도심 아파트')
    expect(result.state.live.vehicles.family_car.location).toBe('도심 아파트')
    expect(result.state.log).toHaveLength(1)
  })

  it('can execute a deterministic 25-turn AI-free session with repetition guards', () => {
    let state = createInitialSlice('long-session-seed')
    for (let turn = 0; turn < 25; turn += 1) {
      const choices = choicesForState(state)
      const choice = choices[turn % choices.length]
      state = executeTurn(state, choice).state
    }
    expect(state.turn).toBe(25)
    expect(state.log).toHaveLength(25)
    expect(state.rng.step).toBeGreaterThan(0)
    expect(state.live.completed_actions.length).toBeGreaterThanOrEqual(25)

    const eventIds = state.log.map((entry) => entry.eventId).filter((id): id is string => Boolean(id))
    for (let index = 1; index < eventIds.length; index += 1) {
      expect(eventIds[index]).not.toBe(eventIds[index - 1])
    }
  })
})
