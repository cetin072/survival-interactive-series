import type { GMProvider, GMProviderResult, GMProviderTurnRequest } from '../runtime/gmProvider'
import { validateGMProposal } from '../runtime/gmProposal'
import {
  buildCompactGMBrief,
  compileCompactStoryCandidate,
  normalizeCompactStoryCandidate,
  type CompactStoryCandidate,
} from './compactStoryPipeline'

const MODEL = 'deepseek/deepseek-v4-flash-0731:nitro'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_TIMEOUT_MS = 22_000

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type OpenRouterPayload = { choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }> }

const FAST_FALLBACK_PROMPT = `너는 현대 한국 배경 생존 RPG 《생존일기》의 비상용 AI GM이다.
목표는 게임을 멈추지 않으면서 현재 장면을 자연스럽게 이어가는 것이다.

반드시 지켜라.
- player_action을 이번 장면에서 실제로 처리한다. 불가능하면 이유와 그 뒤 상황을 보여준다.
- current_scene 이후부터 진행하고 이미 일어난 장면을 다시 쓰지 않는다.
- family와 character_notes를 보고 가족을 독립적인 사람으로 행동시킨다.
- family_addressing / family_reference_rules가 있으면 한국 가족 호칭을 따른다.
- 플레이어가 이미 정한 방향의 사소한 전화, 이동, 확인은 알아서 진행한다.
- 한 턴 안에 가능하면 3~5개의 의미 있는 진행 비트를 만든다.
- 환경 묘사로 분량을 채우지 말고 행동, 대화, 정보, 사건을 진행한다.
- 다음 choices는 중요한 전략 분기 4개로 만든다. 단순 재전화/재확인은 선택지로 쓰지 않는다.
- 시간이나 위치가 실제로 바뀌면 state_hints에 최소한으로 반영한다.
- hidden 정보, RAW transcript, 엔진 action 구조, UI 데이터는 출력하지 않는다.
- 자연스러운 현대 한국어를 쓴다.

JSON 객체 하나만 출력한다. 코드펜스 금지.
{
  "story":"약 900~1800자, 필요하면 여러 MUD 소장면",
  "choices":["전략 1","전략 2","전략 3","전략 4"],
  "state_hints":[],
  "action_resolution":{"status":"completed","summary":"이번 행동 처리"},
  "open_threads":[]
}`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
      // Try the next safe extraction.
    }
  }
  return undefined
}

function playerActionSummary(request: GMProviderTurnRequest): string {
  const input = request.input
  if (input.kind === 'free-action') return input.text.trim().slice(0, 180)
  if (input.kind === 'ordered-choices') {
    return input.choice_ids
      .map((id) => request.checkpoint.current_scene.choices.find((choice) => choice.id === id)?.label ?? `선택 ${id}`)
      .join(' → ')
      .slice(0, 180)
  }
  return (request.checkpoint.current_scene.choices.find((choice) => choice.id === input.choice_id)?.label ?? `선택 ${input.choice_id}`).slice(0, 180)
}

function existingOpenThreads(request: GMProviderTurnRequest): string[] {
  const value = request.checkpoint.public_state.public_world.gm_open_threads
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string').slice(0, 4)
}

/**
 * Emergency fallback output is repaired deterministically rather than rejected for
 * non-critical schema omissions. Story text is never invented by the server.
 */
export function repairFastFallbackCandidate(
  request: GMProviderTurnRequest,
  parsed: unknown,
): CompactStoryCandidate | undefined {
  if (!isRecord(parsed) || typeof parsed.story !== 'string' || !parsed.story.trim()) return undefined

  const generatedChoices = Array.isArray(parsed.choices)
    ? parsed.choices.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const previousChoices = request.checkpoint.current_scene.choices.map((choice) => choice.label)
  const repairedChoices = [...new Set([...generatedChoices, ...previousChoices])].slice(0, 4)
  if (repairedChoices.length < 2) return undefined

  const actionResolution = isRecord(parsed.action_resolution)
    ? parsed.action_resolution
    : { status: 'attempted', summary: `비상 GM이 플레이어 행동을 이어서 처리했다: ${playerActionSummary(request)}` }

  const candidate = normalizeCompactStoryCandidate({
    ...parsed,
    choices: repairedChoices,
    state_hints: Array.isArray(parsed.state_hints) ? parsed.state_hints : [],
    action_resolution: actionResolution,
    open_threads: Array.isArray(parsed.open_threads) ? parsed.open_threads : existingOpenThreads(request),
  })

  return candidate && candidate.choices.length >= 2 ? candidate : undefined
}

export class OpenRouterFastFallbackProvider implements GMProvider {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async proposeTurn(request: GMProviderTurnRequest): Promise<GMProviderResult> {
    if (!this.apiKey) {
      return { status: 'unavailable', message: 'AI GM 서버 키를 사용할 수 없습니다.', diagnostic: { key_present: false, failure_category: 'missing_key' } }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const publicWorld = request.checkpoint.public_state.public_world
      const brief = {
        ...buildCompactGMBrief(request),
        family_addressing: publicWorld.family_addressing ?? {},
        family_reference_rules: publicWorld.family_reference_rules ?? [],
      }

      let response: Response
      try {
        response = await this.fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: MODEL,
            temperature: 0.28,
            max_tokens: 2600,
            reasoning: { effort: 'none' },
            provider: { require_parameters: true, allow_fallbacks: true },
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: FAST_FALLBACK_PROMPT },
              { role: 'user', content: JSON.stringify(brief) },
            ],
          }),
        })
      } catch {
        return {
          status: 'unavailable',
          message: controller.signal.aborted ? 'Fast fallback 응답 시간이 초과되었습니다.' : 'Fast fallback 연결에 실패했습니다.',
          diagnostic: { key_present: true, failure_category: controller.signal.aborted ? 'timeout' : 'network' },
        }
      }

      if (!response.ok) {
        const category = response.status === 401 || response.status === 403 ? 'auth_or_config'
          : response.status === 429 ? 'route_unavailable'
            : response.status >= 500 ? 'upstream_5xx' : 'provider_error'
        return { status: 'unavailable', message: 'Fast fallback 응답을 받지 못했습니다.', diagnostic: { key_present: true, failure_category: category } }
      }

      const payload = await response.json() as OpenRouterPayload
      const choice = payload.choices?.[0]
      const content = choice?.message?.content
      if (typeof content !== 'string') {
        return { status: 'unavailable', message: 'Fast fallback 응답 형식이 올바르지 않습니다.', diagnostic: { key_present: true, failure_category: 'unsupported_response_shape' } }
      }

      const parsed = parseJsonObject(content)
      const candidate = parsed === undefined ? undefined : repairFastFallbackCandidate(request, parsed)
      if (!candidate) {
        return { status: 'unavailable', message: 'Fast fallback 이야기 구조를 복구하지 못했습니다.', diagnostic: { key_present: true, failure_category: 'compact_schema_mismatch' } }
      }

      const compiled = compileCompactStoryCandidate(request.checkpoint, candidate)
      const checked = validateGMProposal(compiled)
      if (!checked.valid) {
        return { status: 'unavailable', message: 'Fast fallback 제안을 엔진 계약으로 변환하지 못했습니다.', diagnostic: { key_present: true, failure_category: 'compiled_schema_mismatch' } }
      }

      return {
        status: 'proposal',
        proposal: checked.proposal,
        diagnostic: {
          key_present: true,
          response_fingerprint: {
            contract: 'compact_story_fast_fallback_v2',
            story_chars: candidate.story.length,
            choice_count: candidate.choices.length,
          },
        },
      }
    } catch {
      return { status: 'unavailable', message: 'Fast fallback 처리에 실패했습니다.', diagnostic: { key_present: true, failure_category: 'network' } }
    } finally {
      clearTimeout(timer)
    }
  }
}
