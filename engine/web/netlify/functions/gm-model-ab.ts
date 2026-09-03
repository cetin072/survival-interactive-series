import type { GMProviderTurnInput } from '../../src/runtime/gmProvider'
import { runGMProviderTurn } from '../../src/runtime/gmTurnRuntime'
import { createPublicRuntimeCheckpoint, type PublicRuntimeCheckpoint } from '../../src/runtime/publicRuntimeCheckpoint'
import { createStorytellingBenchmarkSession } from '../../src/runtime/storytellingBenchmarkSession'
import { OpenRouterStoryProvider } from '../../src/server/openRouterStoryProvider'

const FLASH_MODEL = 'deepseek/deepseek-v4-flash-0731:nitro'
const PRO_MODEL = 'deepseek/deepseek-v4-pro-0813:nitro'
const AB_TIMEOUT_MS = 25_000

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type BenchmarkVariant = 'A' | 'B'
type BenchmarkCase = 'father-son-split' | 'wife-conditional-split'
type NetlifyContext = { deploy?: { context?: string } }

type BenchmarkResult = {
  case_id: BenchmarkCase
  input: string
  committed: boolean
  time: string
  player_location: string
  narrative: string
  choices: string[]
  father: { location: string; status: string }
  wife: { location: string; status: string }
  son: { location: string; status: string }
}

function netlifyEnv(key: string): string | undefined {
  const netlify = (globalThis as unknown as {
    Netlify?: { env?: { get?: (name: string) => string | undefined } }
  }).Netlify
  return netlify?.env?.get?.(key)
}

function modelForVariant(variant: BenchmarkVariant): string {
  return variant === 'A' ? FLASH_MODEL : PRO_MODEL
}

function rewritingFetch(model: string): FetchLike {
  return async (input, init) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined
    if (!body) return fetch(input, init)
    body.model = model
    return fetch(input, { ...init, body: JSON.stringify(body) })
  }
}

function conditionalSplitCheckpoint(): PublicRuntimeCheckpoint {
  const base = createStorytellingBenchmarkSession()
  const state = {
    ...base.public_state,
    scene_id: 'ab-wife-conditional-split',
    clock: { ...base.public_state.clock, time: '18:24' },
    party: {
      ...base.public_state.party,
      player: { ...base.public_state.party.player, status: '가족 역할 분담 판단 중' },
      wife: {
        ...base.public_state.party.wife,
        status: '병원 비상대응 전환 · 산불 관련 환자 유입 시작 · 즉시 퇴근 가능 여부 불확실',
      },
      son: {
        ...base.public_state.party.son,
        status: '학원 조기 귀가 안내 · 보호자 대기 가능',
      },
      father: {
        ...base.public_state.party.father,
        status: '외곽 대피 준비 권고 · 이장 연락 수신 · 자력 이동 가능',
      },
    },
    public_world: {
      ...base.public_state.public_world,
      current_public_signals: [
        '산불 외곽 확산 우려',
        '외곽 도로 통제 가능성 상승',
        '서윤 병원에 산불 관련 환자 유입 시작',
        '민석 학원 조기 귀가 안내',
        '정호 지역 대피 준비 안내',
      ],
      gm_open_threads: [
        '서윤이 병원을 실제로 이탈할 수 있는지 미확인',
        '민석의 안전한 귀가 책임자를 정해야 함',
        '정호는 자력 대피가 가능하지만 아직 외곽주택에 있음',
      ],
    },
  }

  return createPublicRuntimeCheckpoint({
    ...base,
    checkpoint_id: 'ab-wife-conditional-split-v1',
    active_visible_pressure: '산불 확산 · 병원 비상대응 · 가족 분산 · 외곽도로 통제 가능성',
    recent_visible_change: '병원에 산불 관련 환자가 들어오기 시작했고 학원은 조기 귀가를 안내했다.',
    current_scene: {
      ...base.current_scene,
      id: 'ab-wife-conditional-split',
      narrative: `## 18:24 — 역할을 다시 나눠야 한다\n\n서윤은 병원에 있다. 병원은 산불 비상대응으로 전환되고 있고 응급실에는 연기 흡입과 대피 과정에서 다친 환자가 들어오기 시작했다. 서윤이 지금 병원을 빠져나올 수 있는지는 아직 확인되지 않았다.\n\n민석은 학원에서 조기 귀가 안내를 받은 상태다. 보호자가 올 때까지 학원 안에서 기다릴 수 있다.\n\n정호는 외곽주택에 있고 이장에게 대피 준비 연락을 받았다. 정호는 차량과 지역 지리를 알고 있어 스스로 이동할 수 있지만 아직 출발 여부는 정해지지 않았다.\n\n외곽 방면 도로는 정체가 늘고 있고 통제 가능성도 커지고 있다.\n\n### 현재\n- 준호 — 회사\n- 서윤 — 병원 비상대응 중\n- 민석 — 학원 조기 귀가 대기\n- 정호 — 외곽주택, 자력 이동 가능`,
    },
    committed_turn: {
      number: 0,
      log: [{ id: 0, kind: 'scene', text: 'A/B 상황판단 독립 테스트 시작' }],
    },
    public_state: state,
  })
}

function testCase(caseId: BenchmarkCase): { checkpoint: PublicRuntimeCheckpoint; input: GMProviderTurnInput } {
  if (caseId === 'father-son-split') {
    return {
      checkpoint: createStorytellingBenchmarkSession(),
      input: {
        kind: 'free-action',
        text: '아버지에게 최대한 위험지역에서 벗어나라고 연락한다. 이어서 민석에게 연락하고 학원 쪽으로 움직일 준비를 한다.',
      },
    }
  }

  return {
    checkpoint: conditionalSplitCheckpoint(),
    input: {
      kind: 'free-action',
      text: '서윤이 이동할 수 있다면 민석을 책임지게 하고 나는 정호를 책임진다. 서윤이 이동할 수 없다면 아버지는 스스로 대피하게 하고 나는 아들을 태우러 간다.',
    },
  }
}

async function runCase(variant: BenchmarkVariant, caseId: BenchmarkCase): Promise<BenchmarkResult> {
  const key = netlifyEnv('OPENROUTER_API_KEY')
  const provider = new OpenRouterStoryProvider(key, rewritingFetch(modelForVariant(variant)), AB_TIMEOUT_MS)
  const { checkpoint, input } = testCase(caseId)
  const next = await runGMProviderTurn(checkpoint, input, provider)

  return {
    case_id: caseId,
    input: input.kind === 'free-action' ? input.text : '',
    committed: next.committed_turn.number > checkpoint.committed_turn.number,
    time: next.time,
    player_location: next.player_location,
    narrative: next.current_scene.narrative,
    choices: next.current_scene.choices.map((choice) => choice.label),
    father: {
      location: next.public_state.party.father.location,
      status: next.public_state.party.father.status,
    },
    wife: {
      location: next.public_state.party.wife.location,
      status: next.public_state.party.wife.status,
    },
    son: {
      location: next.public_state.party.son.location,
      status: next.public_state.party.son.status,
    },
  }
}

function json(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export default async function benchmark(request: Request, context: NetlifyContext): Promise<Response> {
  if (context.deploy?.context !== 'deploy-preview') {
    return json(404, { error: 'preview_only' })
  }
  if (!netlifyEnv('OPENROUTER_API_KEY')) {
    return json(503, { error: 'missing_server_key' })
  }

  const url = new URL(request.url)
  const variant = url.searchParams.get('variant')?.toUpperCase()
  const caseId = url.searchParams.get('case')
  if (variant !== 'A' && variant !== 'B') {
    return json(400, { error: 'variant_must_be_A_or_B' })
  }
  if (caseId !== 'father-son-split' && caseId !== 'wife-conditional-split') {
    return json(400, { error: 'invalid_case' })
  }

  const started = Date.now()
  const result = await runCase(variant, caseId)
  return json(200, {
    benchmark: 'S01_CHARACTER_JUDGMENT_AB_V2',
    variant,
    blind: true,
    model_name_hidden: true,
    elapsed_ms: Date.now() - started,
    result,
  })
}
