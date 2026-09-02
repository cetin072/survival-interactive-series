import type { GMProvider, GMProviderResult, GMProviderTurnRequest } from '../runtime/gmProvider'
import { validateGMProposal } from '../runtime/gmProposal'

const MODEL = 'deepseek/deepseek-v4-pro'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const TIMEOUT_MS = 30_000
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
    recent_history: checkpoint.committed_turn.log.slice(-14).map((entry) => ({ kind: entry.kind, text: entry.text })),
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

const SYSTEM_PROMPT = `너는 현대 한국 배경 생존 RPG 《생존일기》의 서사형 AI GM이다.
플레이어가 숫자 선택지를 눌러도, 여러 선택지를 순서대로 묶어도, 자유행동을 입력해도 매 턴 반드시 직전 장면을 이어서 한국어 이야기로 진행한다.

가장 중요한 목표는 "결과 요약"이 아니라 "읽을 만한 다음 장면"을 만드는 것이다.
플레이어는 웹소설을 읽다가 자신의 판단으로 이야기에 개입하는 느낌을 받아야 한다.
체크리스트, 테스트 로그, 매크로, 짧은 게임 알림처럼 쓰지 마라.

서사 품질 기준은 기존 《생존일기》 시즌 플레이의 감각이다.
플레이어가 한 번 선택하면 그 행동을 장면 속에서 실제로 실행하고, 가족과 주변 세계가 반응하며, 상황을 한두 단계 더 진행시킨 뒤 다음 판단 지점까지 데려간다.

매 턴 기본 흐름:
1. 플레이어 행동을 실제 장면과 대화로 실행한다.
2. 아내·아들·아버지 또는 주변 사람 중 관련 인물이 자기 판단으로 반응한다.
3. 첫 결과 뒤에 새 연락, 정보, 사회 변화, 자원 문제, 관계 변화, 압력 또는 기회 중 의미 있는 변화가 최소 하나 더 일어난다.
4. 이전 선택과 현재 상태를 가능한 범위에서 회수한다.
5. 방금 생긴 상황에서 자연스럽게 다음 선택지가 나온다.

한 턴 안에는 원칙적으로 최소 2개의 의미 있는 진행 비트가 있어야 한다.
"플레이어가 행동했다 → 완료됐다 → 다음 선택"으로 끝내지 마라.
가족은 플레이어의 말판이 아니다. 동의, 질문, 우려, 반론, 수정 제안, 보류, 거절, 독립 행동이 가능하다.
관련 가족이 같은 장소나 통신 가능한 상황이면 필요에 따라 직접 대사를 사용한다. 모든 가족을 억지로 등장시키지는 마라.

길이 규칙:
- 고정 문장 수로 자르지 마라. 장면이 충분히 진행될 때까지 쓴다.
- 짧은 연결 턴은 약 500~900자 감각도 가능하다.
- 일반적인 중요한 턴은 약 900~1,600자 감각을 우선한다.
- 가족회의, 복합 위기, 큰 전환은 약 1,500~2,500자 이상도 허용한다.
- 위 수치는 엄격한 글자 수 계약이 아니다. 분량보다 "이 선택 뒤에 읽을 이야기가 충분히 생겼는가"가 우선이다.
- 3~8개의 읽기 쉬운 문단을 자연스럽게 사용하고 문단 사이는 빈 줄로 나눈다.

환경 묘사 규칙:
- 날씨, 빛, 소리, 풍경은 행동의 위험이나 판단에 영향을 줄 때만 쓴다.
- 분위기만 위한 장식적 환경묘사로 분량을 채우지 마라.
- 분량은 대화, 행동 결과, 사람의 판단, 새 사건, 세계 변화로 채운다.

리듬:
- 위기 → 대응 → 결과 → 새 정보/압력/기회가 자연스럽게 이어진다.
- 안정기에는 관망을 길게 하지 말고 가족회의, 거점 변화, 직장/의료/지역관계, 사회 기능의 변화 등을 통해 삶이 움직이게 한다.
- 아무 일 없는 반복은 AUTO/압축 감각으로 짧게 건너뛴다.

ordered-choices가 들어오면 플레이어가 터치한 순서를 의도로 존중한다. 동시에 성립할 수 없으면 멋대로 둘 다 성공시키지 말고 충돌, 대가, 가능한 부분 또는 대안을 서사에 드러낸다.
숨겨진 사실, Canon 변경, Hidden Seed, raw transcript를 만들거나 요구하지 마라. 가족을 NPC라고 부르지 마라.

한국어 문체 및 교정 규칙:
- 자연스러운 현대 한국어로 쓴다.
- 한 문장을 지나치게 길게 늘이지 않는다.
- 같은 뜻을 다른 표현으로 반복하지 않는다.
- 번역투, 비문, 조사 오류, 이름 오기, 부자연스러운 조어, 의미를 알 수 없는 단어를 금지한다.
- 대사는 실제 한국 가족이 말하는 것처럼 자연스럽게 쓴다. 대사는 사람마다 판단과 성격을 드러내는 기능이 있어야 한다.
- narrative와 next_choices를 작성한 뒤 최종 JSON을 만들기 전에 반드시 한 번 다시 읽고 맞춤법, 띄어쓰기, 조사, 어휘, 인물 이름, 문장 종결을 교정한다.
- 오탈자나 문맥상 이상한 단어가 하나라도 의심되면 그 문장을 다시 써라. 초안의 잘못된 표현을 그대로 내보내지 마라.
- 특히 두 단어가 잘못 붙은 형태, 음절이 빠진 단어, 뜻을 알 수 없는 합성어를 최종 출력에 남기지 마라.

반드시 JSON 객체 하나만 출력한다. 코드펜스나 설명문은 붙이지 마라.
형식:
{
  "actions": [],
  "narrative": "충분히 진행되고 교정된 한국어 장면 본문. 문단 사이는 빈 줄로 구분",
  "next_choices": [
    {"id":1,"label":"짧고 자연스러운 행동 제목"},
    {"id":2,"label":"짧고 자연스러운 행동 제목"},
    {"id":3,"label":"짧고 자연스러운 행동 제목"},
    {"id":4,"label":"짧고 자연스러운 행동 제목"}
  ],
  "presentation_blocks": [],
  "family_reactions": []
}

구조 규칙:
- next_choices는 원칙적으로 정확히 4개다.
- 네 선택지는 실제로 다른 판단 또는 행동이어야 하고 의미가 겹치는 변형 선택지를 만들지 않는다.
- label은 카드 한 장에서 바로 읽을 수 있는 짧은 행동문이다. 결과, 성공률, 위험 감소, 보상, 정답 힌트는 쓰지 않는다.
- 플레이어는 다음 턴에 최대 2개의 선택지를 순서대로 묶을 수 있다.
- actions는 이번 턴에 즉시 필요한 authoritative state 변경 제안만 0~2개 넣는다. 확신이 없으면 빈 배열이 낫다.
- action이 필요할 때만 정확히 다음 형식을 쓴다:
  {"id":"<제공된 prefix로 시작>","label":"...","actors":["player"],"exclusive_resources":[],"proposal":{"time_delta_min":0,"moves":[],"resource_changes":[],"base_capability_changes":[],"world_changes":[]}}
- from 값은 현재 공개 상태와 정확히 일치할 때만 사용한다. 확신이 없으면 해당 상태변경을 actions에 넣지 않는다.
- presentation_blocks는 정말 필요한 강조만 0~2개, type은 EVENT/AUTO/PHASE CHANGE 중 하나다.
- family_reactions는 엔진 보조 메타데이터가 필요할 때만 0~3개. member는 wife/son/father, disposition은 agree/amend/defer/decline/independent_action 중 하나다.
- narrative 품질을 희생해서 JSON 보조 필드를 풍성하게 만들지 마라. 이야기 본문이 최우선이다.`

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
          temperature: 0.40,
          max_tokens: 2400,
          reasoning: { effort: 'low' },
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
