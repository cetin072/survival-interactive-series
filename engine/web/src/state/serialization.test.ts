import { describe, expect, it } from 'vitest'
import { demoLiveState } from './demoLiveState'
import { deserializeLiveState, serializeLiveState } from './serialization'

describe('Live State serialization', () => {
  it('round-trips a public state snapshot', () => {
    expect(deserializeLiveState(serializeLiveState(demoLiveState))).toEqual(demoLiveState)
  })

  it('rejects data that is not a Live State v1 snapshot', () => {
    expect(() => deserializeLiveState('{"version":2}')).toThrow(TypeError)
  })
})
