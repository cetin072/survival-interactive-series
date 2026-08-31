# S07 Start Handoff

STATUS: READY TO START
CANON_BASE: S05 FINAL
S06: ABORTED / NON-CANON
PRESENTATION_PROFILE: MUD_TEXT_V1

## 시작 기준
S07은 S06 플레이 결과를 이어받지 않는다.
S05 종료 Canon과 이후 승인된 런타임 안정화(#24, #22, #29)를 기준으로 새 시즌을 시작한다.

## BOOT GATE — 첫 장면 전 필수 확인
1. `runtime/GM_KERNEL.md`
2. `core/CHARACTERS.json`
3. `core/RUNTIME_INVARIANTS.json`
4. `core/PERSISTENT_CANON.md`
5. `players/main/RUNTIME_STATE.json`
6. `players/main/SAVE_STATE.json`
7. 이 `START_HANDOFF.md`
8. PRESENTATION GATE (`MUD_TEXT_V1`)

부팅이 끝나기 전에는 첫 장면·가족 위치·자산 소유권을 즉흥 생성하지 않는다.

## 시작 시 반드시 유지할 Canon
- 평일 기본 생활모델: 준호·서윤·민석은 도심, 정호는 외곽 거점 상주
- 주말 기본 생활모델: 가족 4인 외곽 재결집
- 최씨 집 우물은 최씨 가구 개인자산
- 마을 공용 농업용 관정과 공동 저장탱크는 최씨 우물과 별도 시설
- 우리 가족 태양광·배터리·저장수·식량·연료·차량·공구·보안설비는 개인자산
- 우리 가족과 최씨 가족은 최우선 핵심 협력체지만 자산은 통합하지 않음
- 이동형 전원과 예비 우물펌프는 두 가구 50:50 공동자산
- 준호·최씨·이장 3인 체제는 정보/긴급협조 연락망이며 공동정부나 공동자산 권한이 아님

## S07 플레이 목표
추가 기능 개발보다 실제 게임 품질을 검증한다.

우선 관찰:
- 재미와 긴장감
- 선택의 비용과 상충
- 복수행동 순서의 실제 대가
- 가족 자율행동·대사 품질
- 장기 상태 오류 감소
- Canon drift 재발 여부
- MUD_TEXT_V1 누락 여부
- AI GM이 상태 검산보다 장면·세계·가족에 더 집중하는지

## 운영 원칙
- Hidden World Seed는 플레이 직전 비공개로 생성한다. 공개 저장소에 기록하지 않는다.
- 전체 시나리오·고정 클라이맥스·정답 루트를 미리 만들지 않는다.
- 위험한 선택이 자동 사고를 뜻하지 않는다.
- 기존 거점/능력은 실제로 효용을 갖는다.
- 평범한 구간은 AUTO로 압축하되 중요한 선택 비용은 생략하지 않는다.
- 플레이 중 UI·음악·개발 자동화 아이디어는 치명적 blocker가 아니면 시즌 종료 후 회고로 넘긴다.
- 매 턴 GitHub 저장 금지. 큰 phase/가족/차량/거점/자원 변화와 시즌 종료에서만 checkpoint한다.

## 첫 장면 규칙
- Scene Header부터 시작
- plain prose only 금지
- 필요한 WORLD/FAMILY/RESOURCE/EVENT/AUTO 태그만 선택적으로 사용
- 숫자 선택지 제공
- 자연어 자유행동·복합행동 허용
- 게임 중 `NPC`, `GM`, `Canon`, `Runtime` 같은 메타 단어를 플레이어 화면에 노출하지 않는다.

S07 첫 장면의 사건 종류와 시작 압력은 이 문서에 고정하지 않는다.
