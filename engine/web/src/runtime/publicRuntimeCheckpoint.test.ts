import { describe, expect, it } from 'vitest'
import { commitPublicRuntimeChoice, keepPublicRuntimeSafeAfterFreeAction } from './publicRuntimeCheckpoint'
import { createSyntheticPublicRuntimeFixture, nextSyntheticScene } from './syntheticPublicRuntimeFixture'

describe('Public Runtime Checkpoint contract', () => {
  it('contains the public facts required by the browser boundary without Canon or Hidden fields', () => {
    const checkpoint = createSyntheticPublicRuntimeFixture()

    expect(checkpoint).toMatchObject({
      contract_version: 1,
      payload_visibility: 'public',
      source_kind: 'synthetic-fixture',
      season_id: 'SYNTHETIC_CONTRACT_TEST',
      date: '2040-01-01',
      player_location: '회사 · 도심',
      active_visible_pressure: '검증용 제한 시간',
    })
    expect(checkpoint.family).toHaveLength(4)
    expect(checkpoint.resources).not.toHaveLength(0)
    expect(checkpoint.base_capabilities[0].capabilities).not.toHaveLength(0)
    expect(JSON.stringify(checkpoint)).not.toMatch(/hidden|raw_transcript|players\/main|core\/CHARACTERS/i)
  })

  it('commits a numbered choice through the Action Queue, advances the turn, and appends a result log', () => {
    const initial = createSyntheticPublicRuntimeFixture()
    const next = commitPublicRuntimeChoice(initial, initial.current_scene.choices[0], nextSyntheticScene)

    expect(next.committed_turn.number).toBe(1)
    expect(next.public_state.party.player.location).toBe('학교')
    expect(next.public_state.vehicles.family_car.location).toBe('학교')
    expect(next.time).toBe('18:00')
    expect(next.current_scene.id).toBe('synthetic_scene_2')
    expect(next.committed_turn.log.map((entry) => entry.kind)).toEqual(['scene', 'choice', 'result'])
  })

  it('keeps a free action safe until an interpreter provides a proposal', () => {
    const initial = createSyntheticPublicRuntimeFixture()
    const next = keepPublicRuntimeSafeAfterFreeAction(initial, '가족에게 연락하고 이동 경로를 확인한다')

    expect(next.public_state).toEqual(initial.public_state)
    expect(next.committed_turn.number).toBe(0)
    expect(next.committed_turn.log.map((entry) => entry.kind)).toEqual(['scene', 'free-action', 'system'])
    expect(next.current_scene.narrative).toContain('상태를 바꾸지 않았고')
  })
})
