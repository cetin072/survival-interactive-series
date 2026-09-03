import type { GMProviderTurnInput } from '../../src/runtime/gmProvider'
import { runGMProviderTurn } from '../../src/runtime/gmTurnRuntime'
import { createStorytellingBenchmarkSession } from '../../src/runtime/storytellingBenchmarkSession'
import { OpenRouterStoryProvider } from '../../src/server/openRouterStoryProvider'

const FLASH_MODEL = 'deepseek/deepseek-v4-flash-0731:nitro'
const PRO_MODEL = 'deepseek/deepseek-v4-pro-0813:nitro'
const AB_TIMEOUT_MS = 25_000

const TURN_INPUTS: GMProviderTurnInput[] = [
  {
    kind: 'free-action',
    text: '아버지에게 최대한 위험지역에서 벗어나라고 연락한다. 이어서 민석에게 연락하고 학원 쪽으로 움직일 준비를 한다.',
  },
  {
    kind: 'free-action',
    text: '서윤이 이동할 수 있다면 민석을 책임지게 하고 나는 정호를 책임진다. 서윤이 이동할 수 없다면 아버지는 스스로 대피하게 하고 나는 아들을 태우러 간다.',
  },
]

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type BenchmarkVariant = 'A' | 'B'

type BenchmarkScene = {
  turn: number
  input: string
  time: string
  player_location: string
  narrative: string
  choices: string[]
  father: { location: string; status: string }
  wife: { location: string; status: string }
  son: { location: string; status: string }
  failure?: string
}

function env() {
  return (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
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

function inputText(input: GMProviderTurnInput): string {
  if (input.kind === 'free-action') return input.text
  if (input.kind === 'numbered-choice') return `선택 ${input.choice_id}`
  return input.choice_ids.join(' → ')
}

async function runVariant(variant: BenchmarkVariant): Promise<BenchmarkScene[]> {
  const environment = env()
  const key = environment.OPENROUTER_API_KEY
  const provider = new OpenRouterStoryProvider(key, rewritingFetch(modelForVariant(variant)), AB_TIMEOUT_MS)
  let checkpoint = createStorytellingBenchmarkSession()
  const scenes: BenchmarkScene[] = []

  for (const input of TURN_INPUTS) {
    const beforeTurn = checkpoint.committed_turn.number
    const next = await runGMProviderTurn(checkpoint, input, provider)
    const committed = next.committed_turn.number > beforeTurn
    scenes.push({
      turn: beforeTurn + 1,
      input: inputText(input),
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
      ...(committed ? {} : { failure: 'TURN_NOT_COMMITTED' }),
    })
    if (!committed) break
    checkpoint = next
  }

  return scenes
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

export default async function benchmark(request: Request): Promise<Response> {
  const environment = env()
  if (environment.CONTEXT !== 'deploy-preview') {
    return json(404, { error: 'preview_only' })
  }
  if (!environment.OPENROUTER_API_KEY) {
    return json(503, { error: 'missing_server_key' })
  }

  const url = new URL(request.url)
  const requested = url.searchParams.get('variant')?.toUpperCase()
  if (requested !== 'A' && requested !== 'B') {
    return json(400, { error: 'variant_must_be_A_or_B' })
  }

  const started = Date.now()
  const scenes = await runVariant(requested)
  return json(200, {
    benchmark: 'S01_CHARACTER_JUDGMENT_AB_V1',
    variant: requested,
    blind: true,
    model_name_hidden: true,
    elapsed_ms: Date.now() - started,
    scenes,
  })
}
