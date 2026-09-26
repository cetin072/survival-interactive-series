# 《생존일기》 GM Pipeline v2 Architecture

## Status
- 현재 웹게임의 AI GM 구조를 정리하는 구현 기준 문서다.
- Canon v2와 Engine authoritative state가 사실의 Source of Truth다.
- RAW transcript는 런타임 입력이 아니며, `GM_STYLE_PROFILE_V1.md` 등 파생 품질 기준만 사용할 수 있다.
- UI/그래픽 확장은 이 단계에서 동결한다. 플레이를 막는 치명적 UI 오류 외에는 다루지 않는다.

## 핵심 원칙

> 웹/엔진은 기억·계산·규칙·표현을 맡고, AI GM은 이야기·인물·사건·갈림길에 집중한다.

`AI proposes, Engine commits`는 그대로 유지한다.

AI 구조화를 완전히 없애지 않는다. 다만 AI가 작성하는 구조화 데이터는 **최소 Intent / State Hint**로 제한한다.

---

## 1. 역할 분리

### Web / UI — 보여주는 일
- 상·하단 상황판
- 가족 / 거점 / 차량 / 자원 표시
- 선택지
- 자유행동 입력
- 성장 그래픽
- MUD형 Story rendering
- 입력 접근성

UI 데이터나 스타일 지시를 AI가 생성하지 않는다.

### Game Engine — 사실과 규칙
- 시간
- 위치
- 자원
- 차량
- 가족 상태
- 거점
- Canon
- Save / Load
- Action Queue
- Validator
- 장기 기억
- 실제 상태 Commit

### AI GM — 재미
- 플레이어 행동을 실제 장면으로 만든다
- 가족을 독립된 인물로 연기한다
- 새 사건과 외부 세계 신호를 만든다
- 선택 결과를 극적으로 보여준다
- 이전 결정의 결과를 회수한다
- 다음 판단 상황을 만든다

---

## 2. AI 입력 — Compact GM Brief

AI에게 Public Runtime Checkpoint 전체와 긴 로그를 그대로 반복 전달하지 않는다.

서버가 현재 엔진 상태에서 필요한 공개 정보만 골라 짧은 Brief를 만든다.

예시 개념:

```text
TURN
3

PLAYER ACTION
정호에게 전화 → 민석에게 연락

NOW
18:24 / 회사 주차장 / 산불 확산

FAMILY
서윤: 병원 / 비상대응 가능
민석: 학원 / 조기 귀가 가능
정호: 외곽주택 / 독립적 판단

VEHICLE
family_car: 회사 주차장 / 이용 가능

OPEN SIGNALS
외곽 도로 일부 통제
병원 비상대응 가능성

RECENT DECISIONS
정호 상황 먼저 확인
가족 합류 기준 논의
```

포함 원칙:
- 현재 장면
- 플레이어의 이번 행동
- 현재 시간/위치/압력
- 관련 가족 상태
- 관련 차량/자원/거점
- 공개 세계 신호
- 최근 핵심 결정 소수
- 필요한 캐릭터 성격 메모

제외:
- RAW transcript
- Hidden Seed
- 오래된 전체 대화
- UI 데이터
- 내부 시스템 프롬프트
- 불필요한 전체 상태 덤프

---

## 3. AI 출력 — Story + Minimal Intent

AI에게 기존 `GMProposal` 전체 구조를 직접 작성시키지 않는다.

AI가 직접 만드는 목표 출력은 개념적으로 다음 정도다.

```json
{
  "story": "MUD형으로 편집된 다음 장면",
  "choices": [
    "민석 학원으로 출발한다",
    "정호의 대피 위치를 먼저 확정한다",
    "서윤과 합류 지점을 정한다",
    "회사 주변 가족 차량 이동 상황을 확인한다"
  ],
  "state_hints": [
    { "kind": "time", "minutes": 4 },
    { "kind": "move", "entity": "player", "to": "회사 주차장" },
    { "kind": "signal", "text": "민석 학원에서 조기 귀가를 시작했다" }
  ]
}
```

### 허용 Hint
초기 v2에서는 작은 vocabulary만 허용한다.
- `time`: 경과 시간 제안
- `move`: party/vehicle 목적지 제안
- `resource`: 공개 resource band 변화 제안
- `base_capability`: 거점 capability 추가 제안
- `signal`: 공개 세계 신호 추가 제안

### AI에게 시키지 않는 것
- `from` 작성
- action id 생성
- `exclusive_resources`
- UI presentation block
- family reaction metadata
- 실제 authoritative commit
- Canon 수정
- 복잡한 Action Queue JSON

서버/엔진이 현재 상태에서 `from`, ID, actors 등을 결정하고 기존 Validator를 통과시킨다.

---

## 4. Server Compiler

AI의 Compact Story Candidate를 기존 `GMProposal`로 컴파일하는 서버 계층을 둔다.

흐름:

```text
Browser input
→ Public Runtime Checkpoint
→ Compact GM Brief Builder
→ AI GM
→ Story + Minimal Intent
→ Server Intent Compiler
→ 기존 GMProposal
→ Validator / Action Queue
→ authoritative Engine Commit
→ Next Scene
```

컴파일러 책임:
- 허용되지 않은 entity/resource/base ID drop
- 현재 상태에서 `from` 자동 채움
- action ID 자동 생성
- 중복 hint 정리
- 시간 변화 상한 적용
- 알 수 없는 hint 무시
- state hint가 전혀 없어도 Story는 진행 가능

AI의 narrative 품질을 살리기 위해 상태 변경이 확실하지 않으면 **Story-only turn을 허용**한다.

---

## 5. Story 품질

`docs/GM_STYLE_PROFILE_V1.md`와 `docs/GM_NARRATIVE_QUALITY_BENCHMARK.md`를 따른다.

목표는 순수 웹소설이 아니라:

> MUD + 인터랙티브 드라마 + AI GM

좋은 턴의 기본 리듬:

```text
플레이어 선택
→ 실제 행동 장면
→ 가족/주변 사람 반응
→ 추가 사건/외부 신호
→ 상황 변화
→ 새 판단 지점
→ 다음 선택
```

Story에는 필요에 따라:
- 시간/장면 제목
- 일반 서술
- 가족 직접 대사
- 재난문자/공지/뉴스
- 짧은 상태 변화 목록

을 섞는다.

---

## 6. 비용 / 성능 원칙

모델 업그레이드 전에 v2 구조를 먼저 검증한다.

1. DeepSeek V4 Flash로 S01 Story Benchmark 실행
2. 기존 pipeline 대비 품질 비교
3. 다음 중 하나로 판정

### A. Flash 품질 크게 개선
구조 문제였음. 저비용 모델 유지 우선.

### B. 일부 개선, 여전히 밋밋함
구조는 맞고 모델이 병목. 그때 상위 모델 A/B.

### C. 상위 모델도 재미없음
GM prompt / turn architecture 재검토.

비용을 이유로 Story 품질을 희생하지 않되, 비싼 모델을 기본값으로 확정하기 전에 구조적 효율을 최대화한다.

---

## 7. 이번 구현 범위

### In Scope
- Compact GM Brief builder
- Minimal Story Candidate schema/parser
- Server-side compiler to existing GMProposal
- OpenRouter Story Provider를 v2 contract로 전환
- 기존 Validator/Action Queue/commit 유지
- S01 benchmark fixture로 regression
- malformed/unknown hint 안전 처리
- Story-only turn 지원 검증
- 테스트/빌드/Preview

### Out of Scope
- UI redesign
- 그래픽 추가
- 새로운 survival system
- Canon 변경
- Production 배포
- main merge
- Pro 모델 기본 채택
- RAW를 runtime prompt에 로드

---

## 8. Acceptance

- `AI proposes, Engine commits` 유지
- AI가 full `GMProposal`/Action JSON을 직접 생성하지 않음
- AI 입력이 기존 전체 checkpoint/history 방식보다 명확히 작아짐
- AI 출력은 `story + choices + bounded state_hints` 중심
- 서버가 현재 authoritative state에서 안전한 proposal로 compile
- unknown / invalid hints는 state corruption 없이 무시
- Story-only output도 정상적인 다음 턴으로 진행
- 기본 선택 4개 유지
- 자유행동 / ordered choices 유지
- `npm test`, build, validators, CI 통과
- Netlify Deploy Preview 성공
- Production/main 변경 없음

## 9. Benchmark Gate

구현 완료 후 동일한 Canon v2 S01 유사 시작 조건으로 사용자 플레이 테스트를 진행한다.

최우선 질문:

> 기존 ChatGPT 시즌처럼 선택 뒤 이야기가 충분히 진행되고, 가족이 살아 있으며, 다음 장면을 계속 읽고 싶은가?

이 결과를 보기 전까지 UI/그래픽 확장을 재개하지 않는다.
