import { describe, expect, it } from 'vitest'
import { applyDemoChoice } from './demoTransition'
import { demoLiveState } from './demoLiveState'
import { createGameSnapshot } from './snapshot'

describe('state snapshot UI connection', () => {
  it('derives header and status panel values from Live State', () => {
    const state = applyDemoChoice(demoLiveState, 1)
    const snapshot = createGameSnapshot(state)

    expect(snapshot).toMatchObject({ day: 'DAY 01', time: '18:00', location: '학교' })
    expect(snapshot.family[0]).toEqual(['준호', '학교'])
    expect(snapshot.resources).toContainEqual(['📡 통신', '불안정'])
  })
})
