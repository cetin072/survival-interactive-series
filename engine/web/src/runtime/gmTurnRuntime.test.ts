import { describe, expect, it } from 'vitest'
import { MockProvider, NullProvider } from './gmProvider'
import { runGMProviderTurn } from './gmTurnRuntime'
import { createSyntheticMockProvider, createSyntheticPublicRuntimeFixture } from './syntheticPublicRuntimeFixture'

describe('provider-neutral GM turn boundary', () => {
  it('runs a numbered choice through MockProvider, Validator, Action Queue, commit, and next scene', async () => {
    const initial = createSyntheticPublicRuntimeFixture()
    const next = await runGMProviderTurn(initial, { kind: 'numbered-choice', choice_id: 1 }, createSyntheticMockProvider())

    expect(next.public_state.party.player.location).toBe('학교')
    expect(next.public_state.vehicles.family_car.location).toBe('학교')
    expect(next.committed_turn.number).toBe(1)
    expect(next.current_scene.narrative).toContain('선택 1')
    expect(next.committed_turn.log.map((entry) => entry.kind)).toEqual(['scene', 'choice', 'result', 'scene'])
    expect(next.committed_turn.log[0]?.text).toContain('실제 S02가 아닌')
    expect(next.committed_turn.log.at(-1)?.text).toContain('선택 1')
  })

  it('interprets a Korean free action with MockProvider and commits only through the engine', async () => {
    const initial = createSyntheticPublicRuntimeFixture()
    const next = await runGMProviderTurn(initial, { kind: 'free-action', text: '통신 상태를 확인한다' }, createSyntheticMockProvider())

    expect(next.public_state.resources.communications.band).toBe('점검 중')
    expect(next.committed_turn.log.map((entry) => entry.kind)).toEqual(['scene', 'free-action', 'result', 'scene'])
  })

  it('preserves ordered compound actions from a MockProvider proposal', async () => {
    const initial = createSyntheticPublicRuntimeFixture()
    const next = await runGMProviderTurn(initial, { kind: 'free-action', text: '통신 상태를 확인하고 가족 차량으로 학교에 간다' }, createSyntheticMockProvider())

    expect(next.public_state.resources.communications.band).toBe('점검 중')
    expect(next.public_state.party.player.location).toBe('학교')
    expect(next.time).toBe('18:10')
    expect(next.committed_turn.log.filter((entry) => entry.kind === 'result')).toHaveLength(2)
    expect(next.committed_turn.log.filter((entry) => entry.kind === 'scene')).toHaveLength(2)
  })

  it('passes impossible-but-clear intent to the engine Validator without calling it ambiguous', async () => {
    const initial = createSyntheticPublicRuntimeFixture()
    const next = await runGMProviderTurn(initial, { kind: 'free-action', text: '학교에 있는 가족 차량을 타고 대피소로 간다' }, createSyntheticMockProvider())

    expect(next.public_state).toEqual(initial.public_state)
    expect(next.current_scene.narrative).toContain('의도는 이해')
    expect(next.committed_turn.log.find((entry) => entry.kind === 'result')?.text).toContain('family_car')
    expect(next.committed_turn.log.some((entry) => entry.text.includes('모호'))).toBe(false)
  })

  it('keeps authoritative state intact for unavailable or malformed provider output', async () => {
    const initial = createSyntheticPublicRuntimeFixture()
    const unavailable = await runGMProviderTurn(initial, { kind: 'free-action', text: '아내에게 연락한다' }, new NullProvider())
    const malformed = await runGMProviderTurn(initial, { kind: 'free-action', text: '아내에게 연락한다' }, new MockProvider(() => ({ status: 'proposal', proposal: { actions: 'not-an-array' } })))

    expect(unavailable.public_state).toEqual(initial.public_state)
    expect(malformed.public_state).toEqual(initial.public_state)
    expect(unavailable.committed_turn.number).toBe(0)
    expect(malformed.committed_turn.number).toBe(0)
    expect(malformed.committed_turn.log.at(-1)?.text).toContain('처리하지 않았습니다')
  })
})
