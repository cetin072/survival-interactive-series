# GM LOAD MAP — On-demand Context

목적: GM이 저장소 전체를 매번 읽지 않고 **필요한 문서만 호출**하게 한다.

## A. 항상 읽기 — 최소 부팅 세트
새 채팅에서 실제 플레이를 시작/재개할 때 기본적으로 아래만 읽는다.

1. `runtime/GM_KERNEL.md` — 플레이 운영 핵심규칙
2. `core/CHARACTERS.json` — 가족 최신값
3. `core/PERSISTENT_CANON.md` — 시즌 간 지속되는 실제 세계/관계/거점
4. `players/main/SAVE_STATE.json` — 가장 최근 공개 플레이 상태

### 이어서 플레이인 경우에만
5. 현재 시즌 `seasons/Sxx/GM_STATE.json`

`players/main/CHECKPOINT.md`는 사람이 읽는 재개 요약이다. SAVE_STATE가 충분하면 GM 필수 로드가 아니다.

## B. 새 시즌 생성 때만
- `docs/WORLD_SEED_PROTOCOL.md`
- 필요 시 `docs/MEGADISASTER_LONG_ARC_RULE.md`
- 필요 시 `docs/NORMAL_DIFFICULTY_RULE.md`

새 시즌 시작 위치/거점 상식이 모호할 때만:
- `core/FAMILY_RESIDENCE_AND_START_INFO.md`

## C. 상황별 모듈 — 실제 등장할 때만
### 정상사회/기관 압박
- `docs/NORMAL_SOCIETY_CONTINUITY_RULE.md`

### NPC 관계·Anchor 설계가 필요할 때
- `docs/NPC_DESIGN_V2.md`

### 거점 확장·능력 성장 판단이 핵심일 때
- `docs/BASE_GROWTH_RULE.md`

### 화면 표현을 다시 맞춰야 할 때
- `docs/TEXT_VISUAL_GRAMMAR.md`

### 시즌 종료/자산화 때
- `docs/SEASON_COMPLETION_PIPELINE.md`
- 해당 시즌 `PLAYTHROUGH_CANON.md`
- 해당 시즌 `RETROSPECTIVE.md`

### 저장/Canon Correction 정책이 실제 쟁점일 때
- `docs/AUTOSAVE_POLICY.md`

## D. 기본 플레이에서는 읽지 않는 참조/역사층
다음 문서는 중요하지만 **런타임 부팅 문서가 아니다.**
- `core/GAME_BIBLE.md`
- `core/GM_RULES.md`
- `core/PROJECT_DECISIONS.md`
- `docs/PLAYTEST_DERIVED_RULES_V1.md`
- `docs/CORE_GAME_SYSTEMS_V1.md`
- 과거 시즌의 회고·브랜치맵·플레이로그
- `playtests/*`
- `idea_vault/*`
- `knowledge/*`

이들은 설계 변경, 회고, 충돌 해결, 시나리오 동결 때만 참고한다.

## E. 설정 충돌 우선순위
1. 사용자가 명시적으로 바로잡은 최신 Canon Correction
2. `core/CHARACTERS.json` — 캐릭터 최신값
3. `core/PERSISTENT_CANON.md` — 지속 세계/관계/거점
4. 현재 시즌 `GM_STATE.json` — 숨은 현재 세계
5. `players/main/SAVE_STATE.json` — 공개 현재 상태
6. 해당 시즌 PLAYTHROUGH_CANON / CHECKPOINT
7. 설계·회고·과거 문서
8. GM 즉흥 생성

### 중요
- `PROJECT_DECISIONS.md`의 오래된 캐릭터 수치가 `CHARACTERS.json`과 충돌하면 **CHARACTERS가 우선**한다.
- 과거 시즌 문서는 역사 기록이지 현재값의 자동 우선권이 아니다.

## F. 읽기 예산
플레이 시작 시 원칙적으로 **4개 파일 이내**에서 장면을 시작한다.
진행 중 한 장면을 판단하기 위해 추가 상세문서를 읽는 경우도 보통 **1개 모듈**만 더 읽는다.

문서를 많이 읽는 것이 정확성이라고 간주하지 않는다.
핵심 Canon과 현재 상태가 충분하면 바로 플레이한다.
