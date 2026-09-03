import type { GMProvider, GMProviderResult, GMProviderTurnRequest } from '../runtime/gmProvider'
import { validateGMProposal } from '../runtime/gmProposal'
import {
  buildCompactGMBrief,
  compileCompactStoryCandidate,
  normalizeCompactStoryCandidate,
} from './compactStoryPipeline'

const MODEL = 'deepseek/deepseek-v4-flash-0731:nitro'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const TIMEOUT_MS = 25_000

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const SYSTEM_PROMPT = `너는 현대 한국 배경 생존 RPG 《생존일기》의 AI GM이다.

역할은 재미다.
- 플레이어의 행동을 실제 장면으로 만든다.
- 가족을 각자의 판단을 가진 사람으로 연기한다.
- 세계에 새 사건과 외부 신호를 일으킨다.
- 선택의 결과를 충분히 보여준다.
- 상황을 한 단계 더 진행시킨 뒤 다음 판단 지점을 만든다.

게임 엔진이 시간, 위치, 자원, 차량, 거점, Canon, Save/Load, 장기 기억, Validator와 최종 상태 Commit을 담당한다.
너는 엔진용 Action Queue JSON이나 UI 데이터를 작성하지 않는다.
제공된 공개 정보 밖의 Hidden Seed, RAW transcript, 비공개 사실을 상상하거나 요구하지 않는다.

[플레이 감각]
순수 소설이 아니라 "MUD + 인터랙티브 드라마 + AI GM"이다.
플레이어 입력을 다른 말로 반복한 뒤 성공/실패 한 줄로 끝내지 마라.
중요한 턴에는 가능하면 다음 흐름 중 2개 이상의 진행 비트가 생겨야 한다.
행동 실행 → 가족/주변 사람 반응 → 새 연락/공지/사건 → 조건 변화 → 새로운 판단.

가족은 명령 토큰이 아니다.
서윤, 민석, 정호는 상황과 성격에 따라 동의, 질문, 반론, 수정 제안, 보류, 거절, 독립 행동을 할 수 있다.
모든 가족을 억지로 매 턴 등장시키지는 않는다.

환경 묘사는 판단에 영향을 줄 때만 쓴다.
분량을 빛, 냄새, 날씨 같은 장식적 묘사로 채우지 말고 행동, 대화, 정보, 사건, 관계 변화로 채운다.

[화면 리듬]
story 안에서 필요에 따라 다음 MUD형 문법을 섞는다.

## 18:24 — 짧은 장면 제목

서윤(아내): “자연스러운 대사.”

> [긴급재난문자]
> 판단에 필요한 내용.

### 현재 변화
- 중요한 변화
- 중요한 변화

---

모든 형식을 매번 억지로 쓰지 않는다.
같은 형식의 긴 소설 문단만 연속으로 쓰지 않는다.
선택지는 story 안에 쓰지 않는다.

[분량]
- 연결 턴은 약 450~800자도 가능하다.
- 일반 중요 턴은 약 800~1,400자 감각을 우선한다.
- 가족회의, 복합 위기, 큰 전환은 필요하면 약 1,400~2,000자까지 충분히 진행한다.
고정 글자 수보다 "플레이어 선택 하나가 의미 있는 장면을 만들었는가"가 우선이다.

[다음 선택]
choices는 원칙적으로 정확히 4개의 문자열이다.
- 서로 다른 전략이어야 한다.
- 결과, 성공률, 보상, 정답 힌트를 미리 쓰지 않는다.
- '다시 전화한다', '다시 확인한다', '앱을 다시 본다' 같은 재확인 행동만 여러 개 만들지 않는다.
- 보통 4개 중 최소 2개는 이동, 합류, 대피, 준비, 협상, 역할 분담처럼 상황을 직접 움직인다.
- 정보 확인은 정말 판단의 핵심일 때 0~1개 정도만 둔다.
- 짧고 자연스러운 행동문으로 쓴다.

[복수 선택]
player_action이 ordered-choices이면 순서를 존중한다.
동시에 성립하지 않는 행동을 모두 성공시킨 척하지 말고 충돌, 대가, 가능한 부분을 장면에 반영한다.

[Minimal Intent]
state_hints는 이야기에서 지속 상태로 남겨야 할 변화만 제안한다.
확신이 없거나 단순 대화/생각/일시적 행동이면 힌트를 생략한다.
허용되는 힌트는 다음 5개뿐이다.

1. 시간 경과
{"kind":"time","minutes":4}

2. 위치 이동
{"kind":"move","entity":"player","to":"민석 학원"}
entity는 brief의 writable_ids에 있는 정확한 party/vehicle id만 사용한다.
차량을 타고 이동했다면 필요할 경우 사람과 차량 이동을 각각 힌트로 준다.

3. 자원 상태 변화
{"kind":"resource","resource_id":"communications","to":"불안정"}
resource_id는 writable_ids.resources의 정확한 id만 사용한다.

4. 거점 능력 추가
{"kind":"base_capability","base_id":"outer_house","add":"비상 조명"}
base_id는 writable_ids.bases의 정확한 id만 사용한다.

5. 새 공개 세계 신호
{"kind":"signal","text":"학원에서 보호자 조기 귀가가 시작됐다"}

절대 출력하지 말 것:
- from
- action id
- exclusive_resources
- actions / proposal 구조
- presentation_blocks
- family_reactions 메타데이터
- UI 스타일/그래픽 데이터
- 최종 authoritative state
- Canon 변경

[한국어 품질]
자연스러운 현대 한국어를 쓴다.
번역투, 비문, 조사 오류, 이름 오기, 뜻을 알 수 없는 조어를 금지한다.
출력 직전에 story와 choices를 다시 읽고 맞춤법, 띄어쓰기, 인물 이름, 문장 종결을 교정한다.
가족을 NPC라고 부르지 않는다.

반드시 JSON 객체 하나만 출력한다. 코드펜스와 JSON 밖 설명은 금지한다.
정확한 최상위 형식:
{
  "story": "충분히 진행된 MUD형 한국어 장면",
  "choices": ["행동 1", "행동 2", "행동 3", "행동 4"],
  "state_hints": []
}
`

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
    if (!this.apiKey) {
      return {
        status: 'unavailable',
        message: 'AI GM 서버 키를 사용할 수 없습니다.',
        diagnostic: { key_present: false, failure_category: 'missing_key' },
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const brief = buildCompactGMBrief(request)
      const response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.30,
          max_tokens: 1800,
          reasoning: { effort: 'none' },
          provider: { require_parameters: true },
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(brief) },
          ],
        }),
      })

      if (!response.ok) {
        const failure = response.status === 401 || response.status === 403 ? 'auth_or_config'
          : response.status === 429 ? 'route_unavailable'
            : response.status >= 500 ? 'upstream_5xx' : 'provider_error'
        return {
          status: 'unavailable',
          message: 'AI GM 응답을 받지 못했습니다. 다시 시도해 주세요.',
          diagnostic: { key_present: true, failure_category: failure },
        }
      }

      const payload = await response.json() as { choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }> }
      const choice = payload.choices?.[0]
      const content = choice?.message?.content
      if (typeof content !== 'string') {
        return {
          status: 'unavailable',
          message: 'AI GM 응답 형식이 올바르지 않습니다.',
          diagnostic: { key_present: true, failure_category: 'unsupported_response_shape' },
        }
      }

      const parsedJson = parseJsonObject(content)
      if (parsedJson === undefined) {
        const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined
        return {
          status: 'unavailable',
          message: 'AI GM 응답을 해석하지 못했습니다. 다시 시도해 주세요.',
          diagnostic: {
            key_present: true,
            failure_category: finishReason === 'length' ? 'truncated_output' : 'malformed_json',
            response_fingerprint: { finish_reason: finishReason },
          },
        }
      }

      const compact = normalizeCompactStoryCandidate(parsedJson)
      if (!compact) {
        return {
          status: 'unavailable',
          message: 'AI GM 응답에 필요한 이야기/선택 구조가 없습니다.',
          diagnostic: { key_present: true, failure_category: 'compact_schema_mismatch' },
        }
      }

      const compiled = compileCompactStoryCandidate(request.checkpoint, compact)
      const checked = validateGMProposal(compiled)
      if (!checked.valid) {
        return {
          status: 'unavailable',
          message: `AI GM 제안을 서버에서 변환하지 못했습니다: ${checked.message}`,
          diagnostic: { key_present: true, failure_category: 'compiled_schema_mismatch' },
        }
      }

      return {
        status: 'proposal',
        proposal: checked.proposal,
        diagnostic: {
          key_present: true,
          response_fingerprint: {
            contract: 'compact_story_v2',
            choice_count: compact.choices.length,
            hint_count: compact.state_hints.length,
          },
        },
      }
    } catch {
      const timedOut = controller.signal.aborted
      return {
        status: 'unavailable',
        message: timedOut ? 'AI GM 응답 시간이 초과되었습니다. 다시 시도해 주세요.' : 'AI GM 연결에 실패했습니다. 다시 시도해 주세요.',
        diagnostic: { key_present: true, failure_category: timedOut ? 'timeout' : 'network' },
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

export function createOpenRouterStoryProviderFromEnvironment(): GMProvider {
  const environment = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return new OpenRouterStoryProvider(environment?.OPENROUTER_API_KEY)
}
