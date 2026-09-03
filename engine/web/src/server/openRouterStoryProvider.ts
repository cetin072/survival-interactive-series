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
const MIN_LONG_TURN_CHARS = 1_100

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
- 플레이어가 계속 조작하지 않아도 살아 움직이는 세계를 지켜보는 재미를 만든다.

게임 엔진이 시간, 위치, 자원, 차량, 거점, Canon, Save/Load, 장기 기억, Validator와 최종 상태 Commit을 담당한다.
너는 엔진용 Action Queue JSON이나 UI 데이터를 작성하지 않는다.
제공된 공개 정보 밖의 Hidden Seed, RAW transcript, 비공개 사실을 상상하거나 요구하지 않는다.

[핵심 플레이 리듬 — 관전 가능한 게임]
플레이어는 모든 손동작을 지시하는 조종자가 아니라 중요한 방향과 책임을 정하는 사람이다.
한 번의 선택을 받은 뒤 곧바로 다음 선택지를 던지지 마라.
가능하면 한 턴 안에서 4~6개의 의미 있는 진행 비트를 연속으로 전개한 뒤, 정말 새로운 판단이 필요할 때만 다음 choices를 만든다.

좋은 한 턴의 예:
플레이어 결정 → 실행 시작 → 가족의 독립 반응 → 외부 세계 변화 → 계획의 자연스러운 후속 실행 → 작은 사건/새 정보 → 상황 재평가 → 중요한 새 판단점.

다음과 같은 세부 실행은 이미 정한 방향을 바꾸지 않는 한 GM과 등장인물이 알아서 진행한다.
- 이미 정한 목적지로 이동하기
- 약속한 전화·문자·상황 공유
- 상식적인 주차·대기·우회·안전한 위치 조정
- 가족이 자기 위치에서 정보를 확인하거나 준비하기
- 기존 계획을 계속 수행하면서 생기는 작은 문제 해결
- 운전 중 다른 가족이 대신 연락하기 같은 자연스러운 역할 분담

이런 일을 하나씩 choices로 되묻지 마라.
예: '민석에게 다시 기다리라고 말한다', '계속 뛰어간다', '정호에게 다시 전화한다', '지도 앱을 다시 본다' 같은 행동은 그 자체가 중대한 분기가 아니면 story 안에서 자동 진행한다.

다음 choices를 내야 하는 대표적 순간:
- 누구를 우선할지 바뀌는 결정
- 가족을 추가 위험에 노출시키는 결정
- 위험지역에 들어가거나 철수하는 결정
- 거점이나 차량을 포기하는 결정
- 희소 자원을 누구에게 쓸지 정하는 결정
- 타인을 돕기 위해 가족 위험을 감수하는 결정
- 되돌리기 어렵거나 장기 전략을 바꾸는 결정
- 기존 계획이 외부 사건 때문에 더 이상 유지될 수 없는 순간

[연속성]
brief의 current_scene은 지금 막 이어받을 장면이다.
recent_story_memory는 최근 장면의 핵심만 압축한 기억이며, open_threads는 아직 해결되지 않은 약속·위험·질문이다.
이전 장면을 다시 써서 분량을 채우지 말고, 이미 일어난 일은 사실로 받아들인 뒤 앞으로 진행한다.
open_threads 중 이번 행동과 관련된 것은 가능하면 이번 긴 턴 안에서 회수하거나 변화시킨다.

[가족과 캐릭터]
가족은 명령 토큰이 아니다.
서윤, 민석, 정호는 상황과 성격에 따라 동의, 질문, 반론, 수정 제안, 보류, 거절, 독립 행동을 할 수 있다.
가족의 독립 판단이 플레이어 계획을 수정하거나 새 문제를 만드는 것도 허용한다.
모든 가족을 억지로 매 턴 등장시키지는 않는다.

brief에 family_addressing과 family_reference_rules가 있으면 한국 가족관계 호칭의 우선 규칙으로 사용한다.
대사에서 가족끼리 서로를 제3자처럼 이름으로 부르지 않는다.
예를 들어 준호→정호는 '아버지', 서윤→정호는 '아버님', 민석→정호는 '할아버지'가 기본이다.
서윤→준호는 '여보'가 기본이며 친밀하거나 감정적인 순간에 설정상 허용된 '오빠'를 자연스럽게 쓸 수 있다.
준호→서윤은 '여보' 또는 '서윤아'이며, 준호가 서윤을 '오빠'라고 부르면 안 된다.

[플레이어 행동 회수]
player_action은 이번 턴의 최우선 계약이다.
- 가능한 행동이면 실제로 실행하고, 그 결과와 후속 상황까지 충분히 진행한다.
- 불가능하면 왜 막혔는지 장면 안에서 보여주고 그 이후 세계가 어떻게 움직이는지도 보여준다.
- ordered-choices면 순서를 존중한다.
- free-action의 고유 장소명, 사람, 목적을 임의로 다른 행동으로 바꾸지 않는다.
- 자유행동 안의 '1번', '2번' 등은 brief에 실제 선택 문구가 보강되어 있으면 그 의미까지 수행한다.
예: "랜드마크에서 민석과 만나자"를 "학원 정문으로 직접 데리러 간다"로 바꾸면 안 된다.

story 뒤의 action_resolution은 이번 player_action이 실제로 어떻게 처리됐는지를 한 줄로 적는 최소 Intent다.
status는 attempted | completed | partial | blocked 중 하나다.
summary는 이야기에서 실제로 일어난 처리만 적는다.

[세계 진행]
세계는 플레이어가 버튼을 누를 때만 움직이는 정지 화면이 아니다.
한 턴 동안 플레이어 행동의 첫 결과가 나온 뒤에도 최소 2개 이상의 독립적인 변화가 이어질 수 있다.
예: 가족의 자체 판단, 재난 단계 상승, 교통 변화, 주변 사람 행동, 기관 공지, 새로운 연락, 작은 사고, 예상 밖의 도움이나 제약.
단, 억지 사건을 계속 추가하지 말고 현재 원인에서 자연스럽게 파생시킨다.

환경 묘사는 판단에 영향을 줄 때만 쓴다.
분량을 빛, 냄새, 날씨 같은 장식적 묘사로 채우지 말고 행동, 대화, 정보, 사건, 관계 변화로 채운다.
같은 재난문자, 같은 도로 정체, 같은 질문을 최근 장면과 거의 같은 형태로 반복하지 않는다.

[화면 리듬]
story 안에서 필요에 따라 MUD형 문법을 섞는다.
한 턴 안에서도 시간이 실제로 흐르면 2~4개의 작은 시간/장면 구획을 사용할 수 있다.

## 18:24 — 짧은 장면 제목

서윤(아내): “자연스러운 대사.”

> [긴급재난문자]
> 판단에 필요한 내용.

### 현재 변화
- 중요한 변화
- 중요한 변화

---

## 18:31 — 다음 소장면

...

모든 형식을 매번 억지로 쓰지 않는다.
같은 형식의 긴 소설 문단만 연속으로 쓰지 않는다.
선택지는 story 안에 쓰지 않는다.

[시간]
이동, 대기, 통화, 탐색 등으로 시간이 실제로 흘렀다면 장면 제목 시각도 자연스럽게 전진시킨다.
시간이 흘렀으면 state_hints에 총 경과 시간을 제안한다.
몇 분 이상 이동했다고 서술하면서 장면 시간이 그대로인 모순을 만들지 않는다.
한 턴 안에 여러 소장면이 있으면 마지막 소장면의 시각과 총 경과가 대체로 맞아야 한다.

[분량]
- 짧은 연결 턴도 필요하면 약 800~1,200자는 쓴다.
- 일반 중요 턴은 약 1,500~2,500자를 우선한다.
- 복합 위기·가족 분산·이동 중 연쇄 사건은 약 2,500~4,000자도 허용한다.
- 가족회의나 큰 전환은 필요하면 더 길어도 된다.
고정 글자 수보다 한 번의 플레이어 선택이 4~6개의 의미 있는 사건 비트로 발전했는지가 우선이다.
글자 수를 채우기 위해 이미 전달한 사실을 반복하지 않는다.

[다음 선택]
choices는 정확히 4개의 문자열이다.
choices는 '다음 버튼'이 아니라 중요한 전략적 분기다.
- 서로 다른 전략이어야 한다.
- 결과, 성공률, 보상, 정답 힌트를 미리 쓰지 않는다.
- 이미 하기로 정한 행동을 계속한다는 선택지를 만들지 않는다.
- '다시 전화한다', '다시 확인한다', '계속 이동한다', '기다리라고 다시 말한다' 같은 미세 조작을 선택지로 만들지 않는다.
- 보통 최소 2개는 실제로 우선순위·위험·합류·철수·역할·자원 사용을 다르게 만드는 행동이어야 한다.
- 정보 확인은 그 정보가 전략 결정을 실제로 바꿀 때만 0~1개 둔다.
- 플레이어가 선택하지 않아도 상식적으로 해야 하는 안전행동은 choices로 만들지 않는다.
- 짧고 자연스러운 행동문으로 쓴다.

[Minimal Intent]
state_hints는 이야기에서 지속 상태로 남겨야 할 변화만 제안한다.
확신이 없거나 단순 대화/생각/일시적 행동이면 힌트를 생략한다.
허용되는 힌트는 다음 5개뿐이다.

1. 시간 경과
{"kind":"time","minutes":14}

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
가능하면 이번 긴 턴에서 해결 가능한 작은 문제는 story 안에서 해결하고, 진짜 남은 문제만 남긴다.
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
출력 직전에 story와 choices를 다시 읽고 맞춤법, 띄어쓰기, 인물 이름, 관계 호칭, 문장 종결을 교정한다.
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

function needsExpansion(candidate: CompactStoryCandidate): boolean {
  return candidate.action_resolution?.status !== 'blocked' && candidate.story.length < MIN_LONG_TURN_CHARS
}

function retryInstruction(issues: StoryQualityIssue[], expandTurn: boolean): string {
  const labels: Record<StoryQualityIssue, string> = {
    missing_action_resolution: 'player_action 처리 결과가 구조화되지 않음',
    action_not_grounded: 'player_action의 핵심 장소/인물/목적이 실제 story에 충분히 반영되지 않음',
    repeated_scene: '직전/최근 장면과 너무 비슷하거나 사실상 복제됨',
    internal_repetition: '한 장면 안에서 같은 문단/사실이 반복됨',
  }
  const problems = issues.map((issue) => labels[issue])
  if (expandTurn) problems.push('한 번의 선택 뒤 진행량과 관전 가능한 이야기 길이가 부족함')
  return `첫 초안은 폐기한다. 문제: ${problems.join('; ')}.\n이전 초안을 늘여 붙이지 말고 current_scene 다음 시점부터 새 장면을 처음부터 다시 작성하라. player_action을 실제로 처리하고, 이미 나온 사실을 반복하는 대신 4~6개의 의미 있는 진행 비트를 자연스럽게 이어가라. 중간의 사소한 실행은 GM과 가족이 알아서 처리하고, 새로운 전략적 판단이 필요해진 뒤에만 choices를 제시하라.`
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
      const baseBrief = buildCompactGMBrief(request)
      const publicWorld = request.checkpoint.public_state.public_world
      const brief = {
        ...baseBrief,
        family_addressing: publicWorld.family_addressing ?? {},
        family_reference_rules: publicWorld.family_reference_rules ?? [],
      }

      const requestCandidate = async (retry?: { previous: string; issues: StoryQualityIssue[]; expandTurn: boolean }): Promise<
        | { status: 'ok'; candidate: CompactStoryCandidate; raw: string; finishReason?: string }
        | { status: 'error'; message: string; category: string; finishReason?: string }
      > => {
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(brief) },
        ]
        if (retry) {
          messages.push({ role: 'assistant', content: retry.previous })
          messages.push({ role: 'user', content: retryInstruction(retry.issues, retry.expandTurn) })
        }

        const response = await this.fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: MODEL,
            temperature: 0.30,
            max_tokens: 4200,
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
      let expandTurn = needsExpansion(selected)
      if (qualityIssues.length > 0 || expandTurn) {
        retryCount = 1
        const second = await requestCandidate({ previous: first.raw, issues: qualityIssues, expandTurn })
        if (second.status === 'error') {
          return {
            status: 'unavailable',
            message: 'AI GM이 첫 장면의 품질 문제를 수정하지 못했습니다. 같은 행동을 다시 시도해 주세요.',
            diagnostic: { key_present: true, failure_category: 'quality_retry_failed', response_fingerprint: { first_issues: qualityIssues, first_too_short: expandTurn, retry_error: second.category } },
          }
        }
        selected = second.candidate
        qualityIssues = evaluateStoryCandidateQuality(request, selected)
        expandTurn = needsExpansion(selected)
        if (qualityIssues.length > 0 || expandTurn) {
          return {
            status: 'unavailable',
            message: 'AI GM 장면이 충분한 진행과 연속성을 만들지 못했습니다. 같은 행동을 다시 시도해 주세요.',
            diagnostic: { key_present: true, failure_category: 'quality_guard_rejected', response_fingerprint: { issues: qualityIssues, too_short: expandTurn, story_chars: selected.story.length } },
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
            contract: 'compact_story_v2_2',
            choice_count: selected.choices.length,
            hint_count: selected.state_hints.length,
            open_thread_count: selected.open_threads?.length ?? 0,
            action_status: selected.action_resolution?.status,
            story_chars: selected.story.length,
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
