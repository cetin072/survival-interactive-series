# Personal Runtime Architecture v1

상태: CURRENT PERSONAL PLAY STANDARD

목적: 개인 플레이의 재미를 유지하면서 AI GM의 기억·상태관리·표현 부담을 외부 시스템으로 분산한다.

## 1. 핵심 원칙

개인 플레이에서 생성형 AI GM을 제거하지 않는다.

역할은 다음처럼 분리한다.

- ChatGPT Project AI GM: 이야기, 자유행동/복합행동 이해, 가족 자율성, 세계 반응, 대사, 선택지, 장면 연출
- Thin Engine / Validator: 시간·위치·차량·행동·자원 등 구조화 상태와 모순 검증
- GitHub: Canon, Save, Checkpoint, Handoff, Retrospective, IP Package의 장기 Source of Truth
- GitHub Actions: 상태 스키마/정합성/회귀 테스트 자동 검사
- Netlify Web: 플레이어용 GM Coprocessor / State Console / Renderer
- Codex: 플레이 밖의 구현·테스트·회귀 수정·배포 담당. 실시간 GM 역할은 하지 않는다.

필요하면 다른 외부 도구도 사용할 수 있으나, 새 도구는 `AI GM의 부담 감소 / 상태 안정성 / 플레이 편의` 중 하나를 명확히 개선할 때만 추가한다.

핵심 문장:
> AI가 세계를 연기하고 판단하며, 엔진이 기억하고 검증하고 보여준다.

## 2. 실제 플레이 경로

플레이어는 ChatGPT Project의 시즌 채팅에서 게임을 진행한다.

허용 입력:
- 단일 숫자
- 복수선택과 순서지정
- 자연어 자유행동
- 가족별 복합지시
- 계획형/조건부 행동

AI GM은 이를 이해해 장면·대사·가족의 독립 반응·세계 결과를 생성한다.

Zero-AI 웹게임을 개인용 주 플레이 경로로 사용하지 않는다.

## 3. AI GM이 반드시 맡는 일

AI GM의 계산부담을 줄이되 창작 역할은 줄이지 않는다.

AI GM 전담:
- 예상 밖 자유행동 해석
- 복합/조건부 행동의 의도 이해
- 가족의 자율적 의견·반대·행동
- 세계의 즉흥적 반응
- 대사와 장면 연출
- 선택지 생성
- 압력의 드라마적 배치
- 기존 Canon 안에서 새로운 사건을 자연스럽게 연결

기계로 넘길 것:
- 현재 시간
- 현재 위치
- 차량 위치/사용자
- 가족 동행 관계
- 자원 band
- 거점 상태
- active/completed action
- 이미 끝난 사건 여부
- 상태 충돌 검사
- 표시용 HUD 조립

## 4. Netlify Web의 역할

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
- 상태 이상 경고 표시
- 필요 시 Action Queue/Validator의 결정론적 보조 기능 제공
- 모바일에서 즉시 확인 가능한 읽기 전용 상태판

Netlify가 맡지 않는 것:
- 자유행동 의미 해석
- 즉흥 대사
- 가족 감정/갈등 창작
- 새로운 사건 창작
- Hidden World Seed 공개
- 미래 사건 표시

## 5. GitHub ↔ Netlify 브리지

GitHub를 기준 저장소로 유지한다.

Netlify State Console은 공개 가능한 최신 상태 파일을 읽어 렌더링한다.
권장 원본:
- `players/main/RUNTIME_STATE.json` (현재 상태의 단일 기계 원본)
- `core/CHARACTERS.json` (가족의 고정 Canon)
- `players/main/SAVE_STATE.json` / `players/main/CHECKPOINT.md` (장기 저장·재개 요약)

`RUNTIME_STATE`는 checkpoint의 큰 변화에서만 갱신한다. State Console은 빌드된 정적
compiler/view logic으로 필요한 표시값을 파생하며, 매 checkpoint마다 별도
`PUBLIC_LIVE_STATE`를 commit하는 중복 원본은 만들지 않는다.

정적 사이트가 GitHub Raw의 `RUNTIME_STATE.json`과 `CHARACTERS.json`을 읽는 구조를
우선한다. 그러면 별도 AI API, Netlify Function, Blob, 재배포 없이 checkpoint commit
직후 상태판이 갱신된다.

Hidden GM State는 공개 State Console과 완전히 분리한다. 현재 공개 저장소에 유지되는
GM 전용 파일은 웹 UI가 절대 fetch/render하지 않는다. 향후 실제 비공개 저장 필요성이
생기면 별도 private storage를 검토한다.

## 6. State Compiler / Validator

AI GM이 매번 HUD와 정합성을 직접 계산하지 않도록 작은 결정론적 계층을 둔다.

입력:
- RUNTIME_STATE
- CHARACTERS Canon
- 필요한 공개 Canon snapshot

출력:
- consistency report
- UI derived fields

자동 검증 우선순위:
1. 가족 위치 모순
2. 동행 모순
3. 차량 위치/사용자 모순
4. 시간 역행
5. 완료 행동 재등장
6. active action 충돌
7. 거점/소유권 Canon 위반
8. 기관 권한 오류
9. 자원 상태 형식 오류
10. season/phase/checkpoint 버전 불일치

검증은 창작 품질을 판단하지 않는다.

## 7. GitHub Actions의 역할

Checkpoint, Save 또는 RUNTIME_STATE 변경 시 자동으로:
- JSON schema validation
- State Compiler / consistency tests 실행
- 기존 engine tests
- build regression

을 수행한다.

실패하면 다음 플레이 장면을 억지로 진행하기보다 해당 checkpoint를 수정한다.

이 구조로 AI GM은 `내가 지금 차량을 어디에 뒀지?` 같은 기계적 검산보다 시나리오에 집중한다.

## 8. 플레이 중 저장 빈도

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
> AI GM이 시즌 전체 상태를 계속 재구성하지 않고, 마지막 검증된 Checkpoint + 최근 Delta만 다룬다.

## 9. 화면 출력 분담

ChatGPT 플레이 채팅:
- 장면
- 대사
- 현재 판단에 필요한 정보
- 선택지
- 중요한 Change Log

Netlify State Console:
- 상시 상태판
- 가족/차량/자원/거점 확인
- 최근 Checkpoint
- 정합성 경고

따라서 ChatGPT는 FAMILY/RESOURCE 전체 HUD를 매 턴 반복 출력하지 않는다.
필요한 상태만 장면에 자연스럽게 노출한다.

## 10. Codex의 역할

Codex는 런타임 GM이 아니다.

사용 시점:
- 시즌 시작 전 작은 도구 완성
- 시즌 종료 후 반복 오류 묶음 수정
- Validator/State Compiler 테스트 추가
- Netlify UI 개선
- GitHub Actions/배포 유지보수

시즌 플레이 도중 작은 불편 때문에 Codex 작업으로 전환하지 않는다.
치명적 상태 오류만 예외다.

## 11. 시즌 종료

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

## 12. 시즌 간 시작

새 시즌은 새 채팅을 기본값으로 한다.

새 GM은 baseline runtime + 최신 START_HANDOFF + 검증된 SAVE/CHECKPOINT를 읽고 시작한다.
과거 전체 채팅 로그를 다시 읽는 것을 전제로 하지 않는다.

## 13. 현재 개발 우선순위

다음 2~3개 시즌은 플레이테스트가 우선이다.

S06 시작 전 마지막 개발 패키지:
1. Zero-AI Netlify 화면을 State Console로 전환
2. `RUNTIME_STATE.json` 규격 추가
3. State Compiler 추가
4. consistency validation 추가
5. GitHub Actions에서 자동 검증
6. 모바일 상태판 회귀 테스트

그 이후에는 치명적 상태 오류가 아니라면 개발을 멈추고 S06~S08 데이터를 모은다.

## 14. 성공 기준

이 구조의 성공은 기능 수가 아니다.

성공하면:
- AI GM의 위치/시간/차량/자원 실수가 줄어든다.
- 상태판을 매 턴 장황하게 출력할 필요가 줄어든다.
- 새 시즌/새 채팅 시작이 빨라진다.
- 자유행동과 가족 반응의 질이 유지되거나 올라간다.
- AI GM의 토큰/주의력이 시나리오·대사·압력 설계에 더 많이 쓰인다.
- 사용자는 관리 작업보다 플레이에 더 많은 시간을 쓴다.

## 15. 상용화와 분리

개인용:
- AI GM 필수
- 자유행동/복합행동 유지
- 재미 우선

상용 후보:
- 입력 자유도 제한 가능
- 사전 제작 이벤트/대사/분기 확대
- AI 호출 최소화 또는 제거 가능

두 모드를 현재 단계에서 억지로 하나로 합치지 않는다.
