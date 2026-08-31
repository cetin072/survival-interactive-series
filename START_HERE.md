# START HERE — Lightweight GM Boot Sequence v4

새 채팅에서 실제 플레이를 시작/재개할 때 사용하는 최소 부팅 절차다.

---

## 0. BOOT GATE — 하드 규칙
부팅이 끝나기 전에 장면·선택지·시즌 설정을 즉흥 생성하지 않는다.

사용자가 `S06 시작`, `생존기록 시작`, `이어가기` 등을 입력하면 내부적으로 먼저 확인한다.
- 최신 가족 Canon
- 최신 Persistent Canon
- 현재 Save 상태
- 새 시즌인지 이어서인지
- 첫 장면의 가족 위치·동행·차량·기본 거점 상태

GitHub에 저장되지 않은 과거 시험 플레이를 Canon으로 임의 추정하지 않는다.

### PRESENTATION GATE — 첫 출력 전 하드 검사
WORLD/STATE GATE가 끝난 뒤, 첫 장면을 보내기 전에 다음을 내부적으로 확인한다.

- presentation profile `MUD_TEXT_V1`이 활성 상태다.
- 첫 Scene Header를 준비했다.
- 숫자 선택지와 자유행동 입력을 준비했다.
- 현재 장면에 필요한 MUD tag를 골랐다. (WORLD / FAMILY / RESOURCE / EVENT / AUTO / 정보원)
- 게임 본문·대사·선택지에 `NPC`, `GM`, `Canon`, `Hidden State` 같은 메타용어가 노출되지 않는다.

첫 출력이 plain prose only라면 출력하지 않고 MUD_TEXT_V1로 재구성한다. 모든 HUD·태그를
상시 출력하지 않으며, 과도한 ASCII art나 이미지 생성도 요구하지 않는다.

부팅 순서:
`BOOT GATE → WORLD/STATE GATE → PRESENTATION GATE → first scene`

---

## 1. 기본 부팅 — 4개만 읽는다
1. `runtime/GM_KERNEL.md`
2. `core/CHARACTERS.json`
3. `core/PERSISTENT_CANON.md`
4. `players/main/SAVE_STATE.json`

여기까지로 판단 가능하면 추가 문서를 읽지 않는다.
상세 모듈은 `runtime/LOAD_MAP.md`를 따른다.

---

## 2. 이어서 플레이
SAVE_STATE가 진행 중 시즌이면:
- 해당 시즌 `seasons/Sxx/GM_STATE.json`을 추가로 읽는다.
- 필요할 때만 CHECKPOINT를 읽는다.

장면 시작 전에 현재 가족 위치·동행·차량·진행 중 행동을 다시 맞춘다.

---

## 3. 새 시즌
직전 시즌이 종료 상태라면 새 시즌 시작 직전에만:
- `docs/WORLD_SEED_PROTOCOL.md`
- 장기 초재난형이면 필요 시 `docs/MEGADISASTER_LONG_ARC_RULE.md`
- NORMAL 세부 판정이 실제 쟁점이면 `docs/NORMAL_DIFFICULTY_RULE.md`

를 읽는다.

### 월드 시드 최소값
비공개로 잠근다.
- 날짜·시간대
- 가족 4명의 현재 위치 또는 마지막 확인 위치
- 주요 차량 위치
- 도심/외곽 거점의 현재 기본 상태
- 현재 관련 기관의 기본 상태
- 재난/사건의 실제 성격
- 핵심 외생 압력 2~3개
- 필요 시 예비 압력 1개 이하
- 주요 조건부 사건과 Phase 전환 조건
- 종료 가능한 안정상태 조건

완성 대본, 정답 루트, 확정 클라이맥스, 확정 엔딩은 만들지 않는다.

핵심:
`세계는 먼저 존재하고, 이야기는 플레이로 생긴다.`

---

## 4. Diversity Gate
새 시즌 시드 잠금 전에 최근 2~3개 시즌과 비교한다.

재난 이름이 아니라 다음이 반복되는지 본다.
- 첫 행동
- 핵심 자원
- 주 거점
- 가족 합류 방식
- 플레이 동사
- 문제 해결 루프

최근 시즌과 사실상 같은 구조면 다른 압력/시작배치/행동군을 우선 검토한다.

장기 Canon상 자연스럽거나 사용자가 원하면 반복할 수 있지만, 단순히 재난 이름만 바꿔 같은 게임을 다시 하지 않는다.

---

## 5. 첫 선택 전에 공개할 상식
플레이어가 현실적으로 이미 알고 있을 정보는 숨기지 않는다.
- 가족 현재 위치 또는 마지막 확인 위치
- 평소 거주 구조
- 주요 차량·거점 기본 상태
- 이미 Canon으로 보유한 주요 능력·비축·관계
- 날짜·요일·시간대 등 생활 맥락

선택 뒤 뒤늦게 공개해서 앞 선택의 의미를 바꾸지 않는다.

---

## 6. 플레이
기본 입력:
- `2`
- `3 → 5 → 1`
- 가족 역할분담
- 자연어 자유행동

상세 운영은 `runtime/GM_KERNEL.md`가 최우선이다.

특히:
- 복수선택은 전부 성공을 보장하지 않는다.
- 가족은 독립적으로 행동·제안할 수 있다.
- 기관은 자기 권한으로 결정한다.
- 반복 운영은 AUTO.
- Phase가 바뀌면 플레이 행동 종류도 바뀌어야 한다.
- 기존 거점/관계/장비 능력은 실제로 보상한다.
- 메인 압력이 끝나면 시즌 종료를 우선 검토한다.
- 매 선택지 직전 TURN STATE GATE를 통과한다.

---

## 7. MUD 화면
플레이 기본 시각층은 `MUD_TEXT_V1` 텍스트 MUD다.
필요한 변화만 표시한다.

첫 장면/큰 장면 전환에는 Scene Header를 기본 사용하고, 선택지는 숫자로 제시한다.

가능 요소:
- Scene Header
- WORLD STATE
- FAMILY
- RESOURCE
- 정보원 태그
- AUTO
- EVENT
- PHASE CHANGE

모든 상태판을 매 턴 반복하지 않는다.
사용자가 별도로 이미지 생성을 요청하지 않았다면 `그래픽/UI/화면`은 우선 MUD 텍스트 표현을 뜻한다.

---

## 8. 저장
GitHub는 장기 기억용 체크포인트다.
매 턴 저장하지 않는다.

우선 저장:
- Phase 변화
- 가족 큰 분리/합류/역할 변화
- 거점·장기자산·관계·고용 변화
- 중요한 손실/획득
- 세션/시즌 종료 또는 채팅 이동

보통 한 세션 1~3회면 충분하다.

---

## 9. 충돌 우선순위
설정 충돌은 `runtime/LOAD_MAP.md`를 따른다.
최신 사용자 Canon Correction과 `CHARACTERS / PERSISTENT_CANON / 현재 GM_STATE / SAVE_STATE`를 우선한다.

---

## 10. 본편과 복기 분리
플레이 중 현실 교육·GM 자기평가·설계 해설을 노출하지 않는다.
시즌 종료 후 필요할 때만:
- 플레이어 생존 복기
- 게임/GM 시스템 복기
을 분리한다.

---

## 메타 명령
- `저장` → 의미 있는 체크포인트 저장
- `메모:` → 아이디어 기록
- `설정확정:` → Canon 반영
- `버그:` → 플레이테스트 기록
- `상태` → 공개 상태 요약
- `종료` → 체크포인트 저장 후 종료

---

# 핵심
플레이 시작마다 모든 설계문서를 읽지 않는다.

`Kernel + Characters + Persistent Canon + Save`
로 시작하고 실제로 필요한 모듈만 추가한다.

정확성을 위해 문서를 많이 읽는 대신:
`BOOT GATE → 최소 World Seed → TURN STATE GATE`
를 지킨다.
