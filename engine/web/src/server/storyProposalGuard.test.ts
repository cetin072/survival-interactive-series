import { describe, expect, it } from 'vitest'
import { createStorytellingBenchmarkSession } from '../runtime/storytellingBenchmarkSession'
import type { GMProposal } from '../runtime/gmProposal'
import { inferStoryEnd, stabilizeStoryProposal } from './storyProposalGuard'

function proposal(narrative: string, choices: string[]): GMProposal {
  return {
    actions: [],
    narrative,
    next_choices: choices.map((label, index) => ({ id: index + 1, label })),
    presentation_blocks: [],
  }
}

describe('story proposal guard', () => {
  it('uses the last MUD heading as the visible end state', () => {
    const end = inferStoryEnd('## 18:33 — 학원 앞 접근 중\n\n이동한다.\n\n## 18:44 — 외곽 방면 진입로\n\n차량이 막힌다.')
    expect(end).toEqual({ time: '18:44', location: '외곽 방면 진입로' })
  })

  it('synchronizes player, co-located operated vehicle, and elapsed time to the visible story end', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const current = checkpoint.public_state.party.player.location
    expect(current).toBe('회사')
    expect(checkpoint.public_state.vehicles.family_car.location).toBe('회사')

    const stabilized = stabilizeStoryProposal(checkpoint, proposal(
      '## 18:21 — 회사 주차장\n\n차를 타고 출발한다.\n\n## 18:31 — 학원 방면 도로\n\n정체 속에서 이동 중이다.',
      ['민석을 먼저 회수한다', '외곽으로 바로 간다', '서윤과 역할을 바꾼다', '정호의 대피를 우선한다'],
    ))

    expect(stabilized.actions).toHaveLength(1)
    expect(stabilized.actions[0]?.proposal.time_delta_min).toBe(14)
    expect(stabilized.actions[0]?.proposal.moves).toEqual(expect.arrayContaining([
      { entity_type: 'party', entity_id: 'player', from: '회사', to: '학원 방면 도로' },
      { entity_type: 'vehicle', entity_id: 'family_car', from: '회사', to: '학원 방면 도로' },
    ]))
  })

  it('removes a pure re-notify/time-adjust choice when strategic alternatives remain', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const stabilized = stabilizeStoryProposal(checkpoint, proposal(
      '## 18:24 — 회사 주차장\n\n다음 판단점이 생겼다.',
      [
        '정호에게 전화해 밭길 상황을 확인하고 막히면 다른 만남 지점을 정한다',
        '외곽 방면 지방도로를 계속 가되 막히기 전에 샛길로 우회한다',
        '민석을 도심 아파트로 먼저 보내고 준호 혼자 정호를 만나러 간다',
        '서윤에게 외곽 도로 통제 상황을 알리고 도심 아파트 합류 시간을 다시 조율한다',
      ],
    ))

    expect(stabilized.next_choices.map((choice) => choice.label)).toHaveLength(3)
    expect(stabilized.next_choices.map((choice) => choice.label).join(' ')).not.toContain('합류 시간을 다시 조율')
    expect(stabilized.next_choices.map((choice) => choice.id)).toEqual([1, 2, 3])
  })

  it('keeps original choices when filtering would leave fewer than two options', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const stabilized = stabilizeStoryProposal(checkpoint, proposal(
      '## 18:24 — 회사 주차장\n\n잠시 판단한다.',
      [
        '서윤에게 상황을 다시 확인한다',
        '정호에게 전화해 상황을 확인한다',
      ],
    ))

    expect(stabilized.next_choices).toHaveLength(2)
  })
})
