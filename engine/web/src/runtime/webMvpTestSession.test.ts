import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlayableTurnLoop } from '../components/PlayableTurnLoop'
import { commitPublicRuntimeAction } from './publicRuntimeCheckpoint'
import { commitWebMvpChoice, createWebMvpTestSession, resetWebMvpTestSession, submitWebMvpFreeAction } from './webMvpTestSession'

describe('WEB MVP TEST SESSION', () => {
  it('renders a clearly non-canonical first playable scene', () => {
    const checkpoint = createWebMvpTestSession()
    const html = renderToStaticMarkup(createElement(PlayableTurnLoop))

    expect(checkpoint.current_scene.choices).toHaveLength(3)
    expect(checkpoint.current_scene.narrative).toContain('실제 S02')
    expect(html).toContain('WEB MVP TEST SESSION')
    expect(html).toContain('NON-CANONICAL')
    expect(html).toContain('현재 장면')
  })

  it('commits a numbered choice through validation and the action queue, then advances turn, scene, and log', () => {
    const initial = createWebMvpTestSession()
    const next = commitWebMvpChoice(initial, 1)

    expect(next.committed_turn.number).toBe(1)
    expect(next.time).toBe('09:10')
    expect(next.current_scene.id).toBe('test-water-check')
    expect(next.committed_turn.log.map((entry) => entry.kind)).toEqual(['scene', 'choice', 'result'])
  })

  it('commits both a resource and a base-capability change in the test session only', () => {
    const waterScene = commitWebMvpChoice(createWebMvpTestSession(), 1)
    const next = commitWebMvpChoice(waterScene, 1)

    expect(next.public_state.resources.water.band).toBe('안정')
    expect(next.public_state.bases.test_base.capabilities).toContain('물 저장 점검표')
    expect(next.committed_turn.number).toBe(2)
    expect(next.current_scene.id).toBe('test-base-ready')
  })

  it('shows a deterministic independent family response without directly moving a family unit', () => {
    const next = commitWebMvpChoice(createWebMvpTestSession(), 2)

    expect(next.current_scene.narrative).toContain('수정 제안')
    expect(next.current_scene.presentation_blocks[0].message).toContain('직접 조종 대상이 아니라')
    expect(next.public_state.party.wife.location).toBe('테스트 관측소')
  })

  it('handles a supported deterministic free action through validation and commit', () => {
    const next = submitWebMvpFreeAction(createWebMvpTestSession(), '통신 상태를 확인한다')

    expect(next.public_state.resources.communications.band).toBe('점검 중')
    expect(next.committed_turn.number).toBe(1)
    expect(next.committed_turn.log.map((entry) => entry.kind)).toEqual(['scene', 'free-action', 'result'])
  })

  it('keeps unsupported free actions safe and visible in the log', () => {
    const initial = createWebMvpTestSession()
    const next = submitWebMvpFreeAction(initial, '보이지 않는 세계 상태를 알려줘')

    expect(next.public_state).toEqual(initial.public_state)
    expect(next.committed_turn.number).toBe(0)
    expect(next.committed_turn.log.at(-1)?.text).toContain('해석할 수 없습니다')
  })

  it('does not mutate state when the existing validator rejects an invalid proposal', () => {
    const initial = createWebMvpTestSession()
    const next = commitPublicRuntimeAction(initial, { id: 0, kind: 'free-action', text: '자유행동: 잘못된 이동' }, {
      id: 'test-invalid-action', label: '잘못된 이동', actors: ['player'],
      proposal: {
        time_delta_min: 10,
        moves: [{ entity_type: 'party', entity_id: 'player', from: '존재하지 않는 곳', to: '테스트 거점' }],
        resource_changes: [], world_changes: [],
      },
    }, () => initial.current_scene)

    expect(next.public_state).toEqual(initial.public_state)
    expect(next.committed_turn.number).toBe(0)
    expect(next.committed_turn.log.at(-1)?.text).toContain('not')
  })

  it('resets to a fresh schema-versioned non-canonical test session', () => {
    const changed = commitWebMvpChoice(createWebMvpTestSession(), 1)
    const reset = resetWebMvpTestSession()

    expect(changed.committed_turn.number).toBe(1)
    expect(reset.committed_turn.number).toBe(0)
    expect(reset.current_scene.id).toBe('test-arrival')
    expect(reset.season_id).toBe('WEB_MVP_TEST_SESSION')
  })
})
