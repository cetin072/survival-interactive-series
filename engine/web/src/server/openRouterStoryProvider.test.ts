import { describe, expect, it } from 'vitest'
import { runGMProviderTurn } from '../runtime/gmTurnRuntime'
import { createStorytellingBenchmarkSession } from '../runtime/storytellingBenchmarkSession'
import { OpenRouterStoryProvider } from './openRouterStoryProvider'

type CapturedRequest = {
  body?: {
    messages?: Array<{ role?: string; content?: string }>
  }
}

function compactResponse(candidate: unknown): Response {
  return new Response(JSON.stringify({
    choices: [{
      finish_reason: 'stop',
      message: { content: JSON.stringify(candidate) },
    }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('OpenRouter Story Provider — GM Pipeline v2.1', () => {
  it('sends compact continuity memory and commits compiled intents through Validator/Action Queue', async () => {
    const captured: CapturedRequest = {}
    const fetchImpl: typeof fetch = async (_input, init) => {
      captured.body = JSON.parse(String(init?.body)) as CapturedRequest['body']
      return compactResponse({
        story: '## 18:21 — 학원으로 출발\n\n민석에게 전화한 뒤 차량에 올라 학원 방향으로 출발한다. 민석에게서 조기 귀가가 시작됐다는 연락이 왔다.',
        choices: ['민석에게 직행한다', '정호의 대피 위치를 정한다', '서윤과 합류점을 정한다', '도로 통제 한 곳만 확인한다'],
        state_hints: [
          { kind: 'time', minutes: 4 },
          { kind: 'move', entity: 'player', to: '민석 학원' },
          { kind: 'move', entity: 'family_car', to: '민석 학원' },
          { kind: 'signal', text: '민석 학원에서 보호자 조기 귀가가 시작됐다' },
        ],
        action_resolution: { status: 'completed', summary: '민석에게 연락하고 학원 방향으로 출발했다.' },
        open_threads: ['정호의 외곽 대피 여부는 아직 확인되지 않았다'],
      })
    }

    const initial = createStorytellingBenchmarkSession()
    const provider = new OpenRouterStoryProvider('test-key', fetchImpl)
    const next = await runGMProviderTurn(initial, { kind: 'numbered-choice', choice_id: 1 }, provider)

    const userMessage = captured.body?.messages?.find((message) => message.role === 'user')?.content ?? ''
    expect(userMessage).toContain('player_action')
    expect(userMessage).toContain('recent_story_memory')
    expect(userMessage).toContain('open_threads')
    expect(userMessage).toContain('writable_ids')
    expect(userMessage).not.toContain('raw_transcript')
    expect(userMessage).not.toContain('hidden_seed')
    expect(userMessage).not.toContain('action_id_prefix')
    expect(userMessage).not.toContain('recent_history')

    expect(next.committed_turn.number).toBe(1)
    expect(next.time).toBe('18:21')
    expect(next.public_state.party.player.location).toBe('민석 학원')
    expect(next.public_state.vehicles.family_car.location).toBe('민석 학원')
    expect(next.current_scene.narrative).toContain('학원으로 출발')
    expect(next.current_scene.choices).toHaveLength(4)
    expect(next.public_state.public_world.current_public_signals).toContain('민석 학원에서 보호자 조기 귀가가 시작됐다')
    expect(next.public_state.public_world.gm_open_threads).toEqual(['정호의 외곽 대피 여부는 아직 확인되지 않았다'])
  })

  it('keeps authoritative state unchanged when compact output is malformed', async () => {
    const fetchImpl: typeof fetch = async () => compactResponse({
      story: '형식이 잘못된 응답',
      choices: 'not-an-array',
      state_hints: [{ kind: 'move', entity: 'player', to: '어딘가' }],
    })

    const initial = createStorytellingBenchmarkSession()
    const provider = new OpenRouterStoryProvider('test-key', fetchImpl)
    const next = await runGMProviderTurn(initial, { kind: 'free-action', text: '민석에게 전화한다' }, provider)

    expect(next.public_state).toEqual(initial.public_state)
    expect(next.committed_turn.number).toBe(0)
    expect(next.current_scene).toEqual(initial.current_scene)
  })

  it('drops unsupported hints but still permits a grounded story-only turn', async () => {
    const fetchImpl: typeof fetch = async () => compactResponse({
      story: '## 18:20 — 가족 통화\n\n서윤과 가족 합류 순서를 먼저 정한다. 서윤은 병원 상황을 보고 움직이겠다고 답한다.',
      choices: ['민석에게 연락한다', '정호에게 연락한다', '바로 출발한다', '회사 공지를 확인한다'],
      state_hints: [
        { kind: 'move', entity: 'unknown_person', to: '비밀 장소' },
        { kind: 'resource', resource_id: 'unknown_resource', to: '무한' },
        { kind: 'canon_change', value: 'drop' },
      ],
      action_resolution: { status: 'completed', summary: '서윤과 가족 합류 순서를 먼저 정했다.' },
      open_threads: [],
    })

    const initial = createStorytellingBenchmarkSession()
    const provider = new OpenRouterStoryProvider('test-key', fetchImpl)
    const next = await runGMProviderTurn(initial, { kind: 'numbered-choice', choice_id: 3 }, provider)

    expect(next.committed_turn.number).toBe(1)
    expect(next.public_state.party).toEqual(initial.public_state.party)
    expect(next.current_scene.narrative).toContain('가족 통화')
  })
})
