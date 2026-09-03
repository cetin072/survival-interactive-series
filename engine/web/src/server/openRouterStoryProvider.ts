import type { GMProvider, GMProviderResult, GMProviderTurnRequest } from '../runtime/gmProvider'
import { validateGMProposal } from '../runtime/gmProposal'
import {
  buildCompactGMBrief,
  compileCompactStoryCandidate,
  evaluateStoryCandidateQuality,
  normalizeCompactStoryCandidate,
  type CompactStoryCandidate,
  type StoryQualityIssue,
} from './compactStoryPipeline'

const MODEL = 'deepseek/deepseek-v4-flash-0731:nitro'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const TIMEOUT_MS = 25_000

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type OpenRouterPayload = {
  choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }>
}

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

[연속성]
brief의 current_scene은 지금 막 이어받을 장면이다.
recent_story_memory는 최근 장면의 핵심만 압축한 기억이며, open_threads는 아직 해결되지 않은 약속·위험·질문이다.
이전 장면을 다시 써서 분량을 채우지 말고, 이미 일어난 일은 사실로 받아들인 뒤 앞으로 진행한다.
open_threads 중 이번 행동과 관련된 것은 가능하면 회수하거나 변화시킨다.

[플레이 감각]
순수 소설이 아니라 "MUD + 인터랙티브 드라마 + AI GM"이다.
플레이어 입력을 다른 말로 반복한 뒤 성공/실패 한 줄로 끝내지 마라.
중요한 턴에는 가능하면 다음 흐름 중 2개 이상의 진행 비트가 생겨야 한다.
행동 실행 → 가족/주변 사람 반응 → 새 연락/공지/사건 → 조건 변화 → 새로운 판단.

가족은 명령 토큰이 아니다.
서윤, 민석, 정호는 상황과 성격에 따라 동의, 질문, 반론, 수정 제안, 보류, 거절, 독립 행동을 할 수 있다.
가족의 독립 판단이 플레이어 계획을 수정하거나 새 문제를 만드는 것도 허용한다.
모든 가족을 억지로 매 턴 등장시키지는 않는다.

환경 묘사는 판단에 영향을 줄 때만 쓴다.
분량을 빛, 냄새, 날씨 같은 장식적 묘사로 채우지 말고 행동, 대화, 정보, 사건, 관계 변화로 채운다.
같은 재난문자, 같은 도로 정체, 같은 질문을 최근 장면과 거의 같은 형태로 반복하지 않는다.

[플레이어 행동 회수]
player_action은 이번 턴의 최우선 계약이다.
- 가능한 행동이면 실제로 실행하거나 실행을 시작한다.
- 불가능하면 왜 막혔는지 장면 안에서 보여준다.
- ordered-choices면 순서를 존중한다.
- free-action의 고유 장소명, 사람, 목적을 임의로 다른 행동으로 바꾸지 않는다.
예: "랜드마크에서 민석과 만나자"를 "학원 정문으로 직접 데리러 간다"로 바꾸면 안 된다.

story 뒤의 action_resolution은 이번 player_action이 실제로 어떻게 처리됐는지를 한 줄로 적는 최소 Intent다.
status는 attempted | completed | partial | blocked 중 하나다.
summary는 이야기에서 실제로 일어난 처리만 적는다.

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

[시간]
이동, 대기, 통화, 탐색 등으로 시간이 실제로 흘렀다면 장면 제목 시각도 자연스럽게 전진시킨다.
시간이 흘렀으면 state_hints에 time을 제안한다. 서버도 장면 제목 시간을 보조적으로 검증한다.
몇 분 이상 이동했다고 서술하면서 장면 시간이 그대로인 모순을 만들지 않는다.

[분량]
- 연결 턴은 약 450~800자도 가능하다.
- 일반 중요 턴은 약 800~1,400자 감각을 우선한다.
- 가족회의, 복합 위기, 큰 전환은 필요하면 약 1,400~2,000자까지 충분히 진행한다.
고정 글자 수보다 "플레이어 선택 하나가 의미 있는 장면을 만들었는가"가 우선이다.
글자 수를 채우기 위해 이미 전달한 사실을 반복하지 않는다.

[다음 선택]
choices는 정확히 4개의 문자열이다.
- 서로 다른 전략이어야 한다.
- 결과, 성공률, 보상, 정답 힌트를 미리 쓰지 않는다.
- '다시 전화한다', '다시 확인한다', '앱을 다시 본다' 같은 재확인 행동만 여러 개 만들지 않는다.
- 보통 4개 중 최소 2개는 이동, 합류, 대피, 준비, 협상, 역할 분담처럼 상황을 직접 움직인다.
- 정보 확인은 정말 판단의 핵심일 때 0~1개 정도만 둔다.
- 짧고 자연스러운 행동문으로 쓴다.

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

[미해결 스토리 메모리]
open_threads는 다음 턴에도 기억해야 할 미해결 문제만 0~4개 문자열로 적는다.
예:
- "정호가 실제로 외곽을 빠져나왔는지 미확인"
- "서윤은 병원 비상근무로 합류 불가"
해결된 문제는 제거한다. 분위기 묘사나 이미 끝난 행동은 넣지 않는다.

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
  "state_hints": [],
  "action_resolution": {"status":"completed","summary":"이번 플레이어 행동이 실제로 어떻게 처리됐는지"},
  "open_threads": ["다음 턴에도 남아 있는 문제"]
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

function retryInstruction(issues: StoryQualityIssue[]): string {
  const labels: Record<StoryQualityIssue, string> = {
    missing_action_resolution: 'player_action 처리 결과가 구조화되지 않음',
    action_not_grounded: 'player_action의 핵심 장소/인물/목적이 실제 story에 충분히 반영되지 않음',
    repeated_scene: '직전/최근 장면과 너무 비슷하거나 사실상 복제됨',
    internal_repetition: '한 장면 안에서 같은 문단/사실이 반복됨',
  }
  return `첫 초안은 폐기한다. 문제: ${issues.map((issue) => labels[issue]).join('; ')}.\n이전 초안을 수정해서 붙이지 말고 current_scene 다음 시점부터 새 장면을 처음부터 다시 작성하라. player_action을 실제로 처리하고, 이미 나온 재난문자/도로정체/질문을 반복하는 대신 최소 하나의 새로운 의미 변화가 생기게 하라.`
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

      const requestCandidate = async (retry?: { previous: string; issues: StoryQualityIssue[] }): Promise<
        | { status: 'ok'; candidate: CompactStoryCandidate; raw: string; finishReason?: string }
        | { status: 'error'; message: string; category: string; finishReason?: string }
      > => {
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(brief) },
        ]
        if (retry) {
          messages.push({ role: 'assistant', content: retry.previous })
          messages.push({ role: 'user', content: retryInstruction(retry.issues) })
        }

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
            messages,
          }),
        })

        if (!response.ok) {
          const failure = response.status === 401 || response.status === 403 ? 'auth_or_config'
            : response.status === 429 ? 'route_unavailable'
              : response.status >= 500 ? 'upstream_5xx' : 'provider_error'
          return { status: 'error', message: 'AI GM 응답을 받지 못했습니다. 다시 시도해 주세요.', category: failure }
        }

        const payload = await response.json() as OpenRouterPayload
        const choice = payload.choices?.[0]
        const content = choice?.message?.content
        const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined
        if (typeof content !== 'string') {
          return { status: 'error', message: 'AI GM 응답 형식이 올바르지 않습니다.', category: 'unsupported_response_shape', finishReason }
        }

        const parsedJson = parseJsonObject(content)
        if (parsedJson === undefined) {
          return {
            status: 'error',
            message: 'AI GM 응답을 해석하지 못했습니다. 다시 시도해 주세요.',
            category: finishReason === 'length' ? 'truncated_output' : 'malformed_json',
            finishReason,
          }
        }

        const compact = normalizeCompactStoryCandidate(parsedJson)
        if (!compact || compact.choices.length !== 4) {
          return { status: 'error', message: 'AI GM 응답에 필요한 이야기/선택 구조가 없습니다.', category: 'compact_schema_mismatch', finishReason }
        }

        return { status: 'ok', candidate: compact, raw: content, finishReason }
      }

      const first = await requestCandidate()
      if (first.status === 'error') {
        return {
          status: 'unavailable',
          message: first.message,
          diagnostic: { key_present: true, failure_category: first.category, response_fingerprint: { finish_reason: first.finishReason } },
        }
      }

      let selected = first.candidate
      let retryCount = 0
      let qualityIssues = evaluateStoryCandidateQuality(request, selected)
      if (qualityIssues.length > 0) {
        retryCount = 1
        const second = await requestCandidate({ previous: first.raw, issues: qualityIssues })
        if (second.status === 'error') {
          return {
            status: 'unavailable',
            message: 'AI GM이 첫 장면의 품질 문제를 수정하지 못했습니다. 같은 행동을 다시 시도해 주세요.',
            diagnostic: { key_present: true, failure_category: 'quality_retry_failed', response_fingerprint: { first_issues: qualityIssues, retry_error: second.category } },
          }
        }
        selected = second.candidate
        qualityIssues = evaluateStoryCandidateQuality(request, selected)
        if (qualityIssues.length > 0) {
          return {
            status: 'unavailable',
            message: 'AI GM 장면이 이전 상황을 충분히 이어가지 못했습니다. 같은 행동을 다시 시도해 주세요.',
            diagnostic: { key_present: true, failure_category: 'quality_guard_rejected', response_fingerprint: { issues: qualityIssues } },
          }
        }
      }

      const compiled = compileCompactStoryCandidate(request.checkpoint, selected)
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
            contract: 'compact_story_v2_1',
            choice_count: selected.choices.length,
            hint_count: selected.state_hints.length,
            open_thread_count: selected.open_threads?.length ?? 0,
            action_status: selected.action_resolution?.status,
            quality_retry_count: retryCount,
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
