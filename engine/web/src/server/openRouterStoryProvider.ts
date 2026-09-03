import type { GMProvider, GMProviderResult, GMProviderTurnRequest } from '../runtime/gmProvider'
import { validateGMProposal } from '../runtime/gmProposal'

const MODEL = 'deepseek/deepseek-v4-flash-0731:nitro'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const TIMEOUT_MS = 25_000
const FORBIDDEN_KEYS = new Set(['hidden_seed', 'hidden_world_seed', 'unrevealed_event_truth', 'raw_transcript'])
const FAMILY_MEMBERS = new Set(['wife', 'son', 'father'])
const FAMILY_DISPOSITIONS = new Set(['agree', 'amend', 'defer', 'decline', 'independent_action'])

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !FORBIDDEN_KEYS.has(key.toLowerCase()))
    .map(([key, child]) => [key, scrub(child)]))
}

function publicContext(request: GMProviderTurnRequest) {
  const checkpoint = request.checkpoint
  const input = request.input
  const nextTurn = checkpoint.committed_turn.number + 1
  const choiceById = (choiceId: number) => checkpoint.current_scene.choices.find((choice) => choice.id === choiceId)

  const playerAction = input.kind === 'free-action'
    ? { kind: 'free-action', text: input.text }
    : input.kind === 'ordered-choices'
      ? {
          kind: 'ordered-choices',
          ordered: input.choice_ids.map((choiceId, index) => ({
            order: index + 1,
            id: choiceId,
            label: choiceById(choiceId)?.label ?? null,
          })),
        }
      : {
          kind: 'numbered-choice',
          id: input.choice_id,
          label: choiceById(input.choice_id)?.label ?? null,
        }

  return {
    turn: nextTurn,
    player_action: playerAction,
    scene: checkpoint.current_scene.narrative,
    choices: checkpoint.current_scene.choices.map((choice) => ({ id: choice.id, label: choice.label })),
    recent_history: checkpoint.committed_turn.log.slice(-16).map((entry) => ({ kind: entry.kind, text: entry.text })),
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

const SYSTEM_PROMPT = `너는 현대 한국 배경 생존 RPG 《생존일기》의 AI GM이다.
현재 세계 사실은 제공된 공개 상태만 따른다. 과거 RAW transcript나 Hidden Seed를 요구하거나 상상하지 마라.

핵심 감각은 순수 웹소설이 아니라 "MUD + 인터랙티브 드라마 + AI GM"이다.
플레이어의 선택을 결과 요약으로 처리하지 말고, 실제 장면으로 실행한 뒤 사람과 세계를 움직여 다음 판단 지점까지 데려가라.

[한 턴의 품질 계약]
- 플레이어 행동을 바로 실행한다. 선택문을 다른 말로 반복하며 시작하지 않는다.
- 중요한 턴에는 최소 2개의 의미 있는 진행 비트가 있다.
  예: 행동 실행 → 가족 반응 → 새 문자/공지/도로 변화 → 판단 조건 변화.
- 관련 가족은 말판이 아니다. 동의, 반론, 질문, 수정 제안, 보류, 거절, 독립 행동이 가능하다.
- 같은 장소이거나 통신 가능한 가족이 관련되면 필요할 때 직접 대사를 사용한다.
- 첫 결과에서 멈추지 않는다. 새 연락, 사회 변화, 이동 문제, 자원 문제, 관계 변화, 압력 또는 기회 중 적어도 하나가 자연스럽게 이어질 수 있다.
- 이전 선택과 현재 위치·차량·가족 상태를 가능한 범위에서 회수한다.
- 환경 묘사는 판단에 영향을 줄 때만 쓴다. 분위기용 풍경 묘사로 분량을 채우지 않는다.
- 안정기 반복은 AUTO 감각으로 압축하고 의미 있는 변화가 생길 때 다시 장면을 확대한다.

[읽는 리듬]
narrative는 아래 MUD형 표시 문법을 필요에 따라 섞는다. 매번 모든 형식을 억지로 쓰지 마라.

장면 제목:
## 18:24 — 짧은 장면 제목

직접 대화:
서윤(아내): “자연스러운 한두 문장.”
정호(아버지): “자기 판단이 드러나는 말.”

외부 세계 신호:
> [긴급재난문자]
> 실제 판단에 필요한 내용.

중요 상태 변화:
### 현재 변화
- 짧은 변화 1
- 짧은 변화 2

장면 구분:
---

나머지는 자연스러운 짧은 문단으로 쓴다.
소설 문단만 길게 이어붙이지 말고 서술·대화·외부 신호·상태 정보를 섞어 화면에 리듬을 만든다.
선택지는 narrative 안에 쓰지 않는다.

[분량]
- 짧은 연결 턴: 약 450~800자 감각.
- 일반 중요 턴: 약 800~1,400자 감각.
- 가족회의·복합 위기·큰 전환: 필요하면 약 1,400~2,000자 감각.
엄격한 글자 수가 아니라 "선택 하나가 의미 있는 장면을 만들었는가"가 기준이다.

[선택지]
next_choices는 원칙적으로 정확히 4개.
- 네 개는 서로 다른 전략이어야 한다.
- 결과/성공률/보상/정답 힌트를 미리 쓰지 않는다.
- '다시 전화한다', '다시 확인한다', '앱을 다시 본다' 같은 정보 재확인 선택을 여러 개 만들지 않는다.
- 원칙적으로 4개 중 최소 2개는 이동, 합류, 대피, 준비, 협상, 역할 분담처럼 세계를 직접 움직이는 행동이어야 한다.
- 정보 확인은 현재 불확실성이 판단의 핵심일 때 0~1개 정도만 둔다.
- label은 카드에서 바로 읽히는 한 문장의 행동이다.

[복수 선택]
ordered-choices는 플레이어가 터치한 순서를 의도로 존중한다. 동시에 성립하지 않으면 둘 다 성공시키지 말고 충돌·대가·가능한 부분을 이야기로 보여준다.

[한국어 품질]
- 자연스러운 현대 한국어를 쓴다.
- 번역투, 비문, 조사 오류, 이름 오기, 뜻을 알 수 없는 합성어를 금지한다.
- 같은 사실을 반복 설명하지 않는다.
- 출력 직전에 narrative와 next_choices를 한 번 다시 읽고 맞춤법·띄어쓰기·인물 이름·문장 종결을 교정한다.
- 가족을 NPC라고 부르지 않는다.

반드시 JSON 객체 하나만 출력한다. 코드펜스나 JSON 밖 설명은 금지한다.
{
  "actions": [],
  "narrative": "MUD형 표시 문법을 섞은 충분히 진행된 한국어 장면",
  "next_choices": [
    {"id":1,"label":"행동 1"},
    {"id":2,"label":"행동 2"},
    {"id":3,"label":"행동 3"},
    {"id":4,"label":"행동 4"}
  ],
  "presentation_blocks": [],
  "family_reactions": []
}

[엔진 제안]
- actions는 이번 턴에 즉시 필요한 authoritative state 변경 제안만 0~2개. 확신이 없으면 빈 배열이 낫다.
- action 형식은 다음만 사용한다:
  {"id":"<제공된 prefix로 시작>","label":"...","actors":["player"],"exclusive_resources":[],"proposal":{"time_delta_min":0,"moves":[],"resource_changes":[],"base_capability_changes":[],"world_changes":[]}}
- from 값은 현재 공개 상태와 정확히 일치할 때만 사용한다.
- presentation_blocks는 정말 필요한 EVENT/AUTO/PHASE CHANGE만 0~2개.
- family_reactions는 엔진 보조 메타데이터가 필요할 때만 0~3개. member는 wife/son/father, disposition은 agree/amend/defer/decline/independent_action.
- JSON 보조 필드를 풍성하게 만들려고 narrative 품질을 희생하지 마라.`

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

function normalizeBlockType(value: unknown): 'EVENT' | 'AUTO' | 'PHASE CHANGE' | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (normalized === 'EVENT' || normalized === 'AUTO' || normalized === 'PHASE CHANGE') return normalized
  return undefined
}

function normalizeStoryCandidate(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || typeof value.narrative !== 'string') return undefined

  const rawChoices = Array.isArray(value.next_choices) ? value.next_choices : []
  const choices = rawChoices.slice(0, 4).flatMap((item, index) => {
    if (!isRecord(item) || typeof item.label !== 'string' || item.label.trim().length === 0) return []
    const rawId = Number(item.id)
    return [{ id: Number.isInteger(rawId) && rawId > 0 ? rawId : index + 1, label: item.label.trim() }]
  })

  const rawBlocks = Array.isArray(value.presentation_blocks) ? value.presentation_blocks : []
  const blocks = rawBlocks.slice(0, 2).flatMap((item) => {
    if (!isRecord(item) || typeof item.message !== 'string') return []
    const type = normalizeBlockType(item.type)
    return type ? [{ type, message: item.message }] : []
  })

  const rawReactions = Array.isArray(value.family_reactions) ? value.family_reactions : []
  const familyReactions = rawReactions.slice(0, 3).flatMap((item) => {
    if (!isRecord(item) || typeof item.message !== 'string' || typeof item.member !== 'string' || typeof item.disposition !== 'string') return []
    const member = item.member.trim().toLowerCase()
    const disposition = item.disposition.trim().toLowerCase().replace(/[ -]+/g, '_')
    if (!FAMILY_MEMBERS.has(member) || !FAMILY_DISPOSITIONS.has(disposition)) return []
    return [{ member, disposition, message: item.message }]
  })

  return {
    actions: Array.isArray(value.actions) ? value.actions.slice(0, 2) : [],
    narrative: value.narrative.trim(),
    next_choices: choices,
    presentation_blocks: blocks,
    family_reactions: familyReactions,
  }
}

function validateStoryCandidate(value: unknown) {
  const normalized = normalizeStoryCandidate(value)
  if (!normalized) return { valid: false as const, message: 'AI GM 응답에 서사가 없습니다.' }

  const first = validateGMProposal(normalized)
  if (first.valid) return { valid: true as const, proposal: first.proposal, droppedActions: false }

  const narrativeOnly = validateGMProposal({ ...normalized, actions: [] })
  if (narrativeOnly.valid) return { valid: true as const, proposal: narrativeOnly.proposal, droppedActions: true }

  return { valid: false as const, message: narrativeOnly.message }
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
          temperature: 0.28,
          max_tokens: 1800,
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

      const proposal = validateStoryCandidate(candidate)
      if (!proposal.valid) return { status: 'unavailable', message: `AI GM 제안 형식 오류: ${proposal.message}`, diagnostic: { key_present: true, failure_category: 'schema_mismatch' } }
      return {
        status: 'proposal',
        proposal: proposal.proposal,
        diagnostic: { key_present: true, response_fingerprint: { state_actions_dropped: proposal.droppedActions } },
      }
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
