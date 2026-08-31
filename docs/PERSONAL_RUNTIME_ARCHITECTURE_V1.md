# Personal Runtime Architecture v1

상태: CURRENT PERSONAL PLAY STANDARD

목적: 개인 플레이의 재미를 유지하면서 AI GM의 기억·상태관리·표현 부담을 줄인다.

## 1. 핵심 원칙

개인 플레이에서 생성형 AI GM을 제거하지 않는다.

역할은 다음처럼 분리한다.

- ChatGPT Project AI GM: 이야기, 자유행동/복합행동 이해, 가족 자율성, 세계 반응, 대사, 선택지, 장면 연출
- Thin Engine / Validator: 시간·위치·차량·행동·자원 등 구조화 상태와 모순 검증
- GitHub: Canon, Save, Checkpoint, Handoff, Retrospective, IP Package의 장기 Source of Truth
- Netlify Web: 플레이어용 State Console / Renderer / 상태 확인 보조도구. AI GM을 대체하지 않는다.

핵심 문장:
> AI가 세계를 연기하고 판단하며, 엔진이 기억하고 검증하고 보여준다.

## 2. 실제 플레이 경로

플레이어는 ChatGPT Project의 시즌 채팅에서만 게임을 진행한다.

허용 입력:
- 단일 숫자
- 복수선택과 순서지정
- 자연어 자유행동
- 가족별 복합지시
- 계획형/조건부 행동

AI GM은 이를 이해해 장면·대사·가족의 독립 반응·세계 결과를 생성한다.

Zero-AI 웹게임을 개인용 주 플레이 경로로 사용하지 않는다.

## 3. Netlify Web의 역할

Netlify는 이야기 생성기가 아니라 **GM Coprocessor / State Console**이다.

목표 역할:
- 최신 공개 Live State 표시
- 가족 이름·나이·성별·위치·상태 표시
- 차량 위치/사용자 표시
- 핵심 자원 band 표시
- 거점 상태 표시
- 진행 중 행동 / 최근 큰 변화 표시
- 현재 Season / Phase / 시간 표시
- 최근 Checkpoint 표시
- 필요 시 Action Queue/Validator의 결정론적 보조 기능 제공

Netlify가 맡지 않는 것:
- 자유행동 의미 해석
- 즉흥 대사
- 가족 감정/갈등 창작
- 새로운 사건 창작
- Hidden World Seed 공개
- 미래 사건 표시

## 4. GitHub ↔ Netlify 브리지

GitHub를 기준 저장소로 유지한다.

Netlify State Console은 공개 가능한 최신 상태 파일을 읽어 렌더링한다.
권장 원본:
- `players/main/SAVE_STATE.json`
- `players/main/CHECKPOINT.md`
- 필요한 경우 별도 `players/main/PUBLIC_LIVE_STATE.json`

Netlify 브라우저에 Hidden State를 내려보내지 않는다.

정적 사이트가 GitHub의 공개 Raw 상태를 읽는 구조를 우선한다. 이 경우 별도 AI API나 Netlify Function/Blob 없이도 상태 콘솔을 갱신할 수 있다.

## 5. 플레이 중 저장 빈도

매 턴 GitHub write는 하지 않는다.

Checkpoint 조건:
1. 큰 Phase Change
2. 가족 위치/동행 구조의 큰 변화
3. 차량 위치/사용자의 큰 변화
4. 거점 능력/소유권/중요 자원 band 변화
5. 장기 Canon 변화
6. 채팅방 이동 직전
7. 시즌 종료

Checkpoint 사이에서는 AI GM이 최근 몇 턴의 작은 Delta만 유지한다.

목표:
> AI GM이 시즌 전체 상태를 머릿속에서 계속 재구성하지 않게 하고, 마지막 확정 Checkpoint + 최근 Delta만 다룬다.

## 6. 화면 출력 분담

ChatGPT 플레이 채팅:
- 장면
- 대사
- 필요한 정보
- 선택지
- 중요한 Change Log

Netlify State Console:
- 상시 상태판
- 가족/차량/자원/거점 확인
- 최근 Checkpoint

따라서 ChatGPT는 FAMILY/RESOURCE 전체 HUD를 매 턴 반복 출력하지 않는다.
현재 판단에 필요한 상태만 본문에 노출한다.

## 7. 시즌 종료

사용자가 `시즌 종료` 또는 `복기 후 종료`라고 하면 GM이 다음을 처리한다.
1. SAVE_STATE
2. CHECKPOINT
3. PLAYTHROUGH_CANON
4. PERSISTENT_CANON 승격
5. RETROSPECTIVE
6. IP_PACKAGE
7. START_HANDOFF
8. Runtime State Drift 기록

사용자는 문서를 직접 작성하지 않는다.

## 8. 시즌 간 시작

새 시즌은 새 채팅을 기본값으로 한다.

새 GM은 baseline runtime + 최신 START_HANDOFF + SAVE/CHECKPOINT를 읽고 시작한다.
과거 전체 채팅 로그를 다시 읽는 것을 전제로 하지 않는다.

## 9. 현재 개발 우선순위

다음 2~3개 시즌은 플레이테스트가 우선이다.

시즌 6 시작 전 허용되는 마지막 소규모 개발은 Netlify 사이트를 Zero-AI 실험판에서 **State Console**로 전환하는 작업이다.

그 이후에는 치명적 상태 오류가 아니라면 개발을 멈추고 S06~S08 데이터를 모은다.

## 10. 상용화와 분리

개인용:
- AI GM 필수
- 자유행동/복합행동 유지
- 재미 우선

상용 후보:
- 입력 자유도 제한 가능
- 사전 제작 이벤트/대사/분기 확대
- AI 호출 최소화 또는 제거 가능

두 모드를 현재 단계에서 억지로 하나로 합치지 않는다.
