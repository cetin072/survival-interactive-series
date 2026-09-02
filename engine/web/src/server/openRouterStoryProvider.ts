import type { GMProvider, GMProviderResult, GMProviderTurnRequest } from '../runtime/gmProvider'
import { validateGMProposal } from '../runtime/gmProposal'

const MODEL = 'deepseek/deepseek-v4-flash-0731:nitro'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const TIMEOUT_MS = 12_000
const FORBIDDEN_KEYS = new Set(['hidden_seed', 'hidden_world_seed', 'unrevealed_event_truth', 'raw_transcript'])

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !FORBIDDEN_KEYS.has(key.toLowerCase()))
    .map(([key, child]) => [key, scrub(child)]))
}

function publicContext(request: GMProviderTurnRequest) {
  const checkpoint = request.checkpoint
  const input = request.input
  const choiceId = input.kind === 'numbered-choice' ? input.choice_id : undefined
  const selected = choiceId !== undefined
    ? checkpoint.current_scene.choices.find((choice) => choice.id === choiceId)
    : undefined
  const nextTurn = checkpoint.committed_turn.number + 1

  return {
    turn: nextTurn,
    player_action: input.kind === 'free-action'
      ? { kind: 'free-action', text: input.text }
      : { kind: 'numbered-choice', id: choiceId, label: selected?.label ?? null },
    scene: checkpoint.current_scene.narrative,
    choices: checkpoint.current_scene.choices.map((choice) => ({ id: choice.id, label: choice.label })),
    recent_history: checkpoint.committed_turn.log.slice(-8).map((entry) => ({ kind: entry.kind, text: entry.text })),
    state: {
      date: checkpoint.date,
      time: checkpoint.time,
      player_location: checkpoint.player_location,
      family: checkpoint.family,
      resources: checkpoint.resources,
      bases: checkpoint.base_capabilities,
      pressure: checkpoint.active_visible_pressure,
      recent_change: checkpoint.recent_visible_change,
      public_world: scrub(checkpoint.public_state.public_world),
    },
    action_id_prefix: `t${nextTurn}_`,
  }
}

const SYSTEM_PROMPT = `너는 현대 한국 배경 생존 RPG의 서사형 AI GM이다.
플레이어가 숫자 선택지를 눌러도, 자유행동을 입력해도 매 턴 반드시 직전 장면을 이어서 한국어 이야기로 진행한다.
목표는 웹소설처럼 자연스럽게 읽히는 몰입감이다. 체크리스트, 테스트, 매크로처럼 쓰지 마라.
플레이어 행동의 결과 -> 가족/주변 반응 -> 새로 생긴 압력이나 기회가 자연스럽게 이어져야 한다.
가족은 독립적인 판단을 가진다. 동의, 수정 제안, 보류, 거절, 독립 행동이 가능하다.
아무 일 없는 관망은 압축한다. 리듬은 위기 -> 적응 -> 눈에 보이는 성장/보상 -> 새로운 압력을 지향한다.
숨겨진 사실, Canon 변경, Hidden Seed, raw transcript를 만들거나 요구하지 마라. 가족을 NPC라고 부르지 마라.

반드시 JSON 객체 하나만 출력한다. 코드펜스나 설명문은 붙이지 마라.
형식:
{
  "actions": [],
  "narrative": "3~5문장의 자연스러운 다음 장면",
  "next_choices": [{"id":1,"label":"..."},{"id":2,"label":"..."}],
  "presentation_blocks": [],
  "family_reactions": []
}

규칙:
- next_choices는 2~4개이며 미래 선택지 텍스트만 쓴다. action을 넣지 않는다.
- actions는 이번 턴에 즉시 필요한 상태 변경만 0~2개 제안한다. 서사만 진행되어도 되면 빈 배열이 낫다.
- action이 필요할 때만 정확히 다음 형식을 쓴다:
  {"id":"<제공된 prefix로 시작>","label":"...","actors":["player"],"exclusive_resources":[],"proposal":{"time_delta_min":0,"moves":[],"resource_changes":[],"base_capability_changes":[],"world_changes":[]}}
- from 값은 현재 공개 상태와 정확히 일치할 때만 사용한다. 확신이 없으면 해당 상태변경을 actions에 넣지 않는다.
- presentation_blocks는 0~2개, type은 EVENT/AUTO/PHASE CHANGE 중 하나다.
- family_reactions는 필요한 가족만 0~3개. member는 wife/son/father, disposition은 agree/amend/defer/decline/independent_action 중 하나다.
- 전체 JSON은 짧게 유지하되 narrative 자체는 장면이 그려질 정도로 충분히 자연스럽게 쓴다.`

function parseJsonObject(content: string): unknown | undefined {
  const trimmed = content.trim()
  const candidates = [trimmed]
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  if (fenced) candidates.push(fenced)
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Try the next safe extraction strategy.
    }
  }
  return undefined
}

export class OpenRouterStoryProvider implements GMProvider {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = TIMEOUT_MS,
  ) {}

  async proposeTurn(request: GMProviderTurnRequest): Promise<GMProviderResult> {
    if (!this.apiKey) return { status: 'unavailable', message: 'AI GM 서버 키를 사용할 수 없습니다.', diagnostic: { key_present: false, failure_category: 'missing_key' } }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.4,
          max_tokens: 900,
          reasoning: { effort: 'none' },
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(publicContext(request)) },
          ],
        }),
      })

      if (!response.ok) {
        const failure = response.status === 401 || response.status === 403 ? 'auth_or_config'
          : response.status === 429 ? 'route_unavailable'
            : response.status >= 500 ? 'upstream_5xx' : 'provider_error'
        return { status: 'unavailable', message: 'AI GM 응답을 받지 못했습니다. 다시 시도해 주세요.', diagnostic: { key_present: true, failure_category: failure } }
      }

      const payload = await response.json() as { choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }> }
      const choice = payload.choices?.[0]
      const content = choice?.message?.content
      if (typeof content !== 'string') return { status: 'unavailable', message: 'AI GM 응답 형식이 올바르지 않습니다.', diagnostic: { key_present: true, failure_category: 'unsupported_response_shape' } }

      const candidate = parseJsonObject(content)
      if (candidate === undefined) {
        const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined
        return {
          status: 'unavailable',
          message: 'AI GM 응답을 해석하지 못했습니다. 다시 시도해 주세요.',
          diagnostic: { key_present: true, failure_category: finishReason === 'length' ? 'truncated_output' : 'malformed_json', response_fingerprint: { finish_reason: finishReason } },
        }
      }

      const proposal = validateGMProposal(candidate)
      if (!proposal.valid) return { status: 'unavailable', message: `AI GM 제안 형식 오류: ${proposal.message}`, diagnostic: { key_present: true, failure_category: 'schema_mismatch' } }
      return { status: 'proposal', proposal: proposal.proposal, diagnostic: { key_present: true } }
    } catch {
      const timedOut = controller.signal.aborted
      return { status: 'unavailable', message: timedOut ? 'AI GM 응답 시간이 초과되었습니다. 다시 시도해 주세요.' : 'AI GM 연결에 실패했습니다. 다시 시도해 주세요.', diagnostic: { key_present: true, failure_category: timedOut ? 'timeout' : 'network' } }
    } finally {
      clearTimeout(timer)
    }
  }
}

export function createOpenRouterStoryProviderFromEnvironment(): GMProvider {
  const environment = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return new OpenRouterStoryProvider(environment?.OPENROUTER_API_KEY)
}
