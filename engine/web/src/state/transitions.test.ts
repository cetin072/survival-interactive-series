import { describe, expect, it } from 'vitest'
import { demoLiveState } from './demoLiveState'
import { advanceClock, movePartyMember, moveVehicle, setResourceBand } from './transitions'

describe('Live State deterministic transitions', () => {
  it('advances time and date across midnight without mutating the input', () => {
    const state = { ...demoLiveState, clock: { ...demoLiveState.clock, date: '2026-08-30', time: '23:50' } }
    const next = advanceClock(state, 20)

    expect(next.clock).toMatchObject({ day: 2, date: '2026-08-31', time: '00:10' })
    expect(state.clock).toMatchObject({ day: 1, date: '2026-08-30', time: '23:50' })
    expect(advanceClock(state, 20)).toEqual(next)
  })

  it('moves one party member without changing the previous snapshot', () => {
    const next = movePartyMember(demoLiveState, 'player', '학교')

    expect(next.party.player.location).toBe('학교')
    expect(demoLiveState.party.player.location).toBe('회사 · 도심')
    expect(next.party.wife).toBe(demoLiveState.party.wife)
  })

  it('moves an existing vehicle and changes an existing resource band', () => {
    const moved = moveVehicle(demoLiveState, 'family_car', '학교')
    const next = setResourceBand(moved, 'communications', '점검 중')

    expect(next.vehicles.family_car.location).toBe('학교')
    expect(next.resources.communications.band).toBe('점검 중')
    expect(demoLiveState.vehicles.family_car.location).toBe('회사 · 도심')
  })

  it('rejects malformed transition inputs at the helper boundary', () => {
    expect(() => advanceClock(demoLiveState, -1)).toThrow(RangeError)
    expect(() => moveVehicle(demoLiveState, 'missing', '학교')).toThrow(RangeError)
    expect(() => setResourceBand(demoLiveState, 'missing', '낮음')).toThrow(RangeError)
  })
})
