import { describe, expect, it } from 'vitest'
import { createStorytellingBenchmarkSession } from '../runtime/storytellingBenchmarkSession'
import {
  buildCompactGMBrief,
  compileCompactStoryCandidate,
  evaluateStoryCandidateQuality,
  normalizeCompactStoryCandidate,
} from './compactStoryPipeline'

describe('GM Pipeline v2.1 compact story boundary', () => {
  it('builds a bounded public brief without raw, hidden, or old action contract fields', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const brief = buildCompactGMBrief({ checkpoint, input: { kind: 'numbered-choice', choice_id: 2 } })
    const serialized = JSON.stringify(brief)

    expect(brief.player_action).toEqual({ kind: 'numbered-choice', action: checkpoint.current_scene.choices[1]?.label })
    expect(brief.family.father.location).toBe('외곽주택')
    expect(brief.recent_story_memory.length).toBeLessThanOrEqual(3)
    expect(serialized).not.toContain('raw_transcript')
    expect(serialized).not.toContain('hidden_seed')
    expect(serialized).not.toContain('action_id_prefix')
    expect(serialized).not.toContain('exclusive_resources')
    expect(serialized).not.toContain('presentation_blocks')
  })

  it('preserves ordered choice order in the compact brief', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const brief = buildCompactGMBrief({ checkpoint, input: { kind: 'ordered-choices', choice_ids: [3, 1] } })

    expect(brief.player_action).toEqual({
      kind: 'ordered-choices',
      ordered: [
        { order: 1, action: checkpoint.current_scene.choices[2]?.label },
        { order: 2, action: checkpoint.current_scene.choices[0]?.label },
      ],
    })
  })

  it('passes free action text without adding engine proposal details', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const brief = buildCompactGMBrief({ checkpoint, input: { kind: 'free-action', text: '아버지에게 대피 준비를 시키고 민석에게 전화한다' } })

    expect(brief.player_action).toEqual({ kind: 'free-action', text: '아버지에게 대피 준비를 시키고 민석에게 전화한다' })
    expect(brief.recent_decisions.length).toBeLessThanOrEqual(4)
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
      action_resolution: { status: 'completed', summary: '민석에게 연락했다.' },
      open_threads: ['정호의 대피 여부 미확인'],
      actions: [{ malicious: true }],
      presentation_blocks: [{ type: 'EVENT', message: 'drop me too' }],
    })

    expect(candidate?.choices).toHaveLength(4)
    expect(candidate?.state_hints).toHaveLength(2)
    expect(candidate?.action_resolution?.status).toBe('completed')
    expect(candidate?.open_threads).toEqual(['정호의 대피 여부 미확인'])
    expect(candidate).not.toHaveProperty('actions')
    expect(candidate).not.toHaveProperty('presentation_blocks')
  })

  it('compiles safe hints using authoritative from-state and drops unknown entities/resources/bases', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const proposal = compileCompactStoryCandidate(checkpoint, {
      story: '## 18:22 — 다음 장면\n\n다음 장면으로 이동한다.',
      choices: ['1', '2', '3', '4'],
      state_hints: [
        { kind: 'time', minutes: 5 },
        { kind: 'move', entity: 'player', to: '회사 주차장' },
        { kind: 'move', entity: 'unknown_person', to: '어딘가' },
        { kind: 'resource', resource_id: 'unknown_resource', to: '없음' },
        { kind: 'base_capability', base_id: 'unknown_base', add: '비밀 시설' },
        { kind: 'signal', text: '외곽 진입 통제가 시작됐다.' },
      ],
      open_threads: ['정호의 실제 출발 여부 미확인'],
    })

    expect(proposal.actions).toHaveLength(1)
    const action = proposal.actions[0]!
    expect(action.id).toBe('t1_story-state')
    expect(action.proposal.time_delta_min).toBe(5)
    expect(action.proposal.moves).toEqual([{ entity_type: 'party', entity_id: 'player', from: '회사', to: '회사 주차장' }])
    expect(action.proposal.resource_changes).toEqual([])
    expect(action.proposal.base_capability_changes).toEqual([])
    expect(action.proposal.world_changes.map((change) => change.key)).toEqual(expect.arrayContaining(['current_public_signals', 'gm_open_threads']))
    expect(proposal.next_choices.map((choice) => choice.id)).toEqual([1, 2, 3, 4])
  })

  it('bounds cumulative time and de-duplicates repeated state hints', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const proposal = compileCompactStoryCandidate(checkpoint, {
      story: '시간이 흐른다.',
      choices: ['1', '2', '3', '4'],
      state_hints: [
        { kind: 'time', minutes: 150 },
        { kind: 'time', minutes: 90 },
        { kind: 'resource', resource_id: 'communications', to: '불안정' },
        { kind: 'resource', resource_id: 'communications', to: '불안정' },
        { kind: 'signal', text: '도로 통제 확대' },
        { kind: 'signal', text: '도로 통제 확대' },
      ],
    })

    const action = proposal.actions[0]!
    expect(action.proposal.time_delta_min).toBe(180)
    expect(action.proposal.resource_changes).toHaveLength(1)
    expect(action.proposal.world_changes).toHaveLength(1)
  })

  it('infers a safe time delta from the MUD scene heading when the model omits the time hint', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const proposal = compileCompactStoryCandidate(checkpoint, {
      story: '## 18:29 — 이동 완료\n\n신호 두 번을 지나 목적지 근처에 도착했다.',
      choices: ['1', '2', '3', '4'],
      state_hints: [],
    })

    expect(proposal.actions[0]?.proposal.time_delta_min).toBe(12)
  })

  it('allows story-only turns when no safe state hint or derived memory change exists', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const proposal = compileCompactStoryCandidate(checkpoint, {
      story: '가족과 통화하며 판단 기준을 다시 맞췄다.',
      choices: ['A', 'B', 'C', 'D'],
      state_hints: [],
    })

    expect(proposal.actions).toEqual([])
    expect(proposal.narrative).toContain('가족과 통화')
  })

  it('rejects an almost copied previous scene', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const candidate = {
      story: checkpoint.current_scene.narrative,
      choices: ['A', 'B', 'C', 'D'],
      state_hints: [],
      action_resolution: { status: 'completed' as const, summary: '선택 행동을 처리했다.' },
      open_threads: [],
    }

    const issues = evaluateStoryCandidateQuality(
      { checkpoint, input: { kind: 'numbered-choice', choice_id: 1 } },
      candidate,
    )
    expect(issues).toContain('repeated_scene')
  })

  it('rejects the landmark free-action regression when the story silently changes it to academy pickup', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const candidate = {
      story: '## 18:28 — 학원 정문\n\n차를 학원 정문 앞에 세우고 민석을 직접 태운다. 선생님이 보호자 확인을 마친다.',
      choices: ['A', 'B', 'C', 'D'],
      state_hints: [],
      action_resolution: { status: 'completed' as const, summary: '학원 정문에서 민석을 태웠다.' },
      open_threads: [],
    }

    const issues = evaluateStoryCandidateQuality(
      { checkpoint, input: { kind: 'free-action', text: '랜드마크에서 아들과 만나자' } },
      candidate,
    )
    expect(issues).toContain('action_not_grounded')
  })

  it('accepts a landmark free action when its core intent is actually carried into the scene', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const candidate = {
      story: '## 18:28 — 랜드마크 앞\n\n민석과 통화해 랜드마크 1층 출입구에서 만나기로 정하고 그쪽으로 이동을 시작한다.',
      choices: ['A', 'B', 'C', 'D'],
      state_hints: [],
      action_resolution: { status: 'attempted' as const, summary: '랜드마크에서 아들과 만나자고 합의하고 합류 지점으로 정했다.' },
      open_threads: ['민석과 랜드마크에서 실제 합류할 때까지 이동 필요'],
    }

    const issues = evaluateStoryCandidateQuality(
      { checkpoint, input: { kind: 'free-action', text: '랜드마크에서 아들과 만나자' } },
      candidate,
    )
    expect(issues).not.toContain('action_not_grounded')
  })
})
