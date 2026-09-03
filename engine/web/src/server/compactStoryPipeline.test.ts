import { describe, expect, it } from 'vitest'
import { createStorytellingBenchmarkSession } from '../runtime/storytellingBenchmarkSession'
import { buildCompactGMBrief, compileCompactStoryCandidate, normalizeCompactStoryCandidate } from './compactStoryPipeline'

describe('GM Pipeline v2 compact story boundary', () => {
  it('builds a bounded public brief without raw transcript fields', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const brief = buildCompactGMBrief({ checkpoint, input: { kind: 'numbered-choice', choice_id: 2 } })
    const serialized = JSON.stringify(brief)

    expect(brief.player_action).toEqual({ kind: 'numbered-choice', action: checkpoint.current_scene.choices[1]?.label })
    expect(brief.family.father.location).toBe('외곽주택')
    expect(serialized).not.toContain('raw_transcript')
    expect(serialized).not.toContain('hidden_seed')
    expect(serialized).not.toContain('action_id_prefix')
  })

  it('normalizes only the small allowed story candidate shape', () => {
    const candidate = normalizeCompactStoryCandidate({
      story: '## 18:21 — 이동 준비\n\n민석에게서 연락이 왔다.',
      choices: ['학원으로 간다', '정호의 대피 위치를 정한다', '서윤과 합류점을 정한다', '도로 상황을 확인한다'],
      state_hints: [
        { kind: 'time', minutes: 4 },
        { kind: 'move', entity: 'player', to: '회사 주차장' },
        { kind: 'unknown', value: 'drop me' },
      ],
      actions: [{ malicious: true }],
    })

    expect(candidate?.choices).toHaveLength(4)
    expect(candidate?.state_hints).toHaveLength(2)
    expect(candidate).not.toHaveProperty('actions')
  })

  it('compiles hints using authoritative from-state and drops unknown entities', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const proposal = compileCompactStoryCandidate(checkpoint, {
      story: '다음 장면',
      choices: ['1', '2', '3', '4'],
      state_hints: [
        { kind: 'time', minutes: 5 },
        { kind: 'move', entity: 'player', to: '회사 주차장' },
        { kind: 'move', entity: 'unknown_person', to: '어딘가' },
        { kind: 'signal', text: '외곽 진입 통제가 시작됐다.' },
      ],
    })

    expect(proposal.actions).toHaveLength(1)
    const action = proposal.actions[0]!
    expect(action.id).toBe('t1_story-state')
    expect(action.proposal.time_delta_min).toBe(5)
    expect(action.proposal.moves).toEqual([{ entity_type: 'party', entity_id: 'player', from: '회사', to: '회사 주차장' }])
    expect(action.proposal.world_changes).toHaveLength(1)
    expect(proposal.next_choices.map((choice) => choice.id)).toEqual([1, 2, 3, 4])
  })

  it('allows story-only turns when no safe state hint exists', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const proposal = compileCompactStoryCandidate(checkpoint, {
      story: '가족과 통화하며 판단 기준을 다시 맞췄다.',
      choices: ['A', 'B', 'C', 'D'],
      state_hints: [],
    })

    expect(proposal.actions).toEqual([])
    expect(proposal.narrative).toContain('가족과 통화')
  })
})
