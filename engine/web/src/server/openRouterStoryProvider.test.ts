import { describe, expect, it } from 'vitest'
import { runGMProviderTurn } from '../runtime/gmTurnRuntime'
import { createStorytellingBenchmarkSession } from '../runtime/storytellingBenchmarkSession'
import { OpenRouterStoryProvider } from './openRouterStoryProvider'

type CapturedRequest = {
  body?: {
    max_tokens?: number
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

function longTurn(prefix: string): string {
  return `${prefix}

준호는 첫 판단을 실행한 뒤 거기서 멈추지 않고 다음 상황까지 이어서 본다. 회사 안에서는 조기 퇴근을 준비하는 직원들이 늘고, 차량 출구 쪽 혼잡도 빠르게 커진다. 지금 무엇을 먼저 하느냐가 이후 이동 범위를 바꿀 수 있다.

민석은 보호자 연락이 시작된 학원 안에서 휴대폰으로 주변 교통을 확인한다. 단순히 기다리기보다 큰길과 골목의 정체 차이를 보고 준호에게 자신이 확인한 내용을 전달한다. 경험은 부족하지만 가족에게 필요한 역할을 하려는 태도가 드러난다.

서윤은 병원에서 자기 상황을 따로 판단한다. 응급실 대응이 시작되면 바로 나오기 어렵다는 점을 분명히 하고, 운전 중인 준호가 모든 연락을 떠안지 않도록 자신이 할 수 있는 연락을 맡겠다고 한다. 가족 계획은 준호의 말 한마디대로만 움직이지 않는다.

정호 쪽에서는 외곽 도로와 마을 상황이 동시에 변한다. 정호는 아들이 걱정한다고 곧바로 구조 대상처럼 행동하지 않고, 자신이 아는 동네 상황과 이웃의 사정을 함께 보면서 움직일 시점을 판단하려 한다. 그 판단 때문에 준호의 계획과 긴장이 생긴다.

그 사이 재난 안내는 한 단계 더 구체화된다. 단순한 대피 준비 권고였던 문구가 특정 외곽 도로의 통제 가능성과 이동 시점에 대한 안내로 바뀌면서 가족이 쓸 수 있는 시간이 줄어든다. 세계는 준호가 다음 버튼을 누를 때까지 멈춰 있지 않는다.

준호는 이미 정한 방향 안에서 차량 확보, 연락 공유, 이동 준비 같은 세부 행동은 계속 처리한다. 작은 실행 하나마다 다시 결정을 묻지 않고, 가족도 각자 자기 위치에서 필요한 일을 진행한다. 한 번의 선택이 실제 여러 장면으로 이어진다.

회사 주차장 출구에서는 차량이 한꺼번에 몰리기 시작하고, 직원 한 명이 다른 출구가 더 빠르다고 알려준다. 준호는 목적 자체를 바꾸지 않는 범위에서 더 안전한 출구를 택하고, 동시에 서윤은 정호에게 직접 전화를 시도한다. 이런 세부 조정은 플레이어에게 다시 허락을 구하지 않고 자연스럽게 이어진다.

민석도 학원 교사의 안내만 기다리지 않는다. 휴대폰 배터리와 이동 가능한 골목을 확인해 준호에게 보내고, 자신이 혼자 움직여야 할 경우 어느 지점까지 갈 수 있는지 생각한다. 가족 구성원 각자가 자기 위치에서 판단을 쌓으면서 준호가 모든 일을 직접 통제할 수 없는 상황이 만들어진다.

마지막에는 기존 계획을 그대로 유지하기 어려운 새로운 조건이 생긴다. 이제는 단순히 전화 한 번 더 할지가 아니라 누구를 먼저 회수할지, 외곽 위험을 감수할지, 가족의 자율 판단을 어디까지 믿을지처럼 전략적인 선택이 필요해진다.`
}

describe('OpenRouter Story Provider — GM Pipeline v2.2', () => {
  it('sends compact continuity and family addressing, then commits compiled intents through Validator/Action Queue', async () => {
    const captured: CapturedRequest = {}
    const fetchImpl: typeof fetch = async (_input, init) => {
      captured.body = JSON.parse(String(init?.body)) as CapturedRequest['body']
      return compactResponse({
        story: longTurn('## 18:21 — 학원으로 출발\n\n민석에게 전화한 뒤 차량에 올라 학원 방향으로 출발한다. 민석에게서 조기 귀가가 시작됐다는 연락이 왔다.'),
        choices: ['민석을 우선 회수하고 외곽 대응은 가족에게 맡긴다', '민석과 중간 합류 지점을 정하고 외곽으로 방향을 튼다', '서윤과 역할을 다시 나눠 두 위험을 동시에 처리한다', '외곽 통제가 확정되기 전에 가족 전체 합류 계획을 바꾼다'],
        state_hints: [
          { kind: 'time', minutes: 4 },
          { kind: 'move', entity: 'player', to: '민석 학원' },
          { kind: 'move', entity: 'family_car', to: '민석 학원' },
          { kind: 'signal', text: '민석 학원에서 보호자 조기 귀가가 시작됐다' },
        ],
        action_resolution: { status: 'completed', summary: '민석에게 연락하고 학원 방향으로 출발한 뒤 후속 가족 대응까지 이어갔다.' },
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
    expect(userMessage).toContain('family_addressing')
    expect(userMessage).toContain('아버님')
    expect(userMessage).toContain('할아버지')
    expect(captured.body?.max_tokens).toBe(4200)
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

  it('drops unsupported hints but still permits a grounded long story-only turn', async () => {
    const fetchImpl: typeof fetch = async () => compactResponse({
      story: longTurn('## 가족 통화\n\n서윤과 가족 합류 순서를 먼저 정한다. 서윤은 병원 상황을 보고 움직이겠다고 답하고, 가족들은 각자 할 수 있는 후속 행동을 이어간다.'),
      choices: ['민석을 우선 회수한다', '정호의 자력 대피를 우선한다', '서윤과 합류 우선순위를 바꾼다', '외곽 위험이 커지기 전에 전체 계획을 다시 짠다'],
      state_hints: [
        { kind: 'move', entity: 'unknown_person', to: '비밀 장소' },
        { kind: 'resource', resource_id: 'unknown_resource', to: '무한' },
        { kind: 'canon_change', value: 'drop' },
      ],
      action_resolution: { status: 'completed', summary: '서윤과 가족 합류 순서를 먼저 정하고 각 가족의 후속 대응을 이어갔다.' },
      open_threads: [],
    })

    const initial = createStorytellingBenchmarkSession()
    const provider = new OpenRouterStoryProvider('test-key', fetchImpl)
    const next = await runGMProviderTurn(initial, { kind: 'numbered-choice', choice_id: 3 }, provider)

    expect(next.committed_turn.number).toBe(1)
    expect(next.public_state.party).toEqual(initial.public_state.party)
    expect(next.current_scene.narrative).toContain('가족 통화')
  })

  it('uses a valid first short turn when the optional expansion retry fails', async () => {
    let calls = 0
    const shortCandidate = {
      story: '## 18:20 — 학원 쪽으로 움직일 준비\n\n민석에게 연락해 학원에서 보호자 조기 귀가가 시작됐는지 확인한다. 민석은 로비에서 기다릴 수 있다고 답하고, 준호는 회사 주차장으로 내려가 차량을 확보해 학원 방향으로 움직일 준비를 한다. 서윤에게도 민석을 먼저 회수하겠다고 짧게 공유한다.',
      choices: ['민석을 직접 회수한다', '서윤과 회수 역할을 바꾼다', '정호의 외곽 상황을 우선한다', '가족 전체 합류 지점을 다시 정한다'],
      state_hints: [{ kind: 'time', minutes: 3 }],
      action_resolution: { status: 'completed' as const, summary: '민석에게 연락하고 학원 쪽으로 움직일 준비를 시작했다.' },
      open_threads: ['정호의 외곽 상황은 아직 확인되지 않았다'],
    }
    const fetchImpl: typeof fetch = async () => {
      calls += 1
      if (calls === 1) return compactResponse(shortCandidate)
      throw new Error('optional expansion route failed')
    }

    const initial = createStorytellingBenchmarkSession()
    const provider = new OpenRouterStoryProvider('test-key', fetchImpl)
    const next = await runGMProviderTurn(initial, { kind: 'numbered-choice', choice_id: 1 }, provider)

    expect(calls).toBe(2)
    expect(next.committed_turn.number).toBe(1)
    expect(next.current_scene.narrative).toContain('학원 쪽으로 움직일 준비')
    expect(next.committed_turn.log.filter((entry) => entry.kind === 'choice')).toHaveLength(1)
  })
})
