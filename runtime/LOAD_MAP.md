# GM LOAD MAP — Runtime v4 On-demand Context

목적: 저장소 전체를 매번 읽지 않고 **필요한 문서만 호출**한다.

---

## A. 항상 읽기 — 최소 부팅 세트
새 채팅에서 실제 플레이를 시작/재개할 때 기본적으로 아래만 읽는다.

1. `runtime/GM_KERNEL.md`
2. `core/CHARACTERS.json`
3. `core/PERSISTENT_CANON.md`
4. `players/main/SAVE_STATE.json`

### 이어서 플레이인 경우에만
5. 현재 시즌 `seasons/Sxx/GM_STATE.json`

CHECKPOINT는 사람이 읽는 재개 요약이다. SAVE_STATE로 충분하면 필수 로드하지 않는다.

---

## B. 새 시즌 생성 때만
- `docs/WORLD_SEED_PROTOCOL.md`
- 대규모 장기재난이면 `docs/MEGADISASTER_LONG_ARC_RULE.md`
- NORMAL 세부 난이도 판단이 필요한 경우 `docs/NORMAL_DIFFICULTY_RULE.md`

시작 위치·거점 상식이 모호할 때만:
- `core/FAMILY_RESIDENCE_AND_START_INFO.md`

최근 시즌과의 반복 검사는 `WORLD_SEED_PROTOCOL`의 Diversity Gate를 따른다.

---

## C. 상황별 모듈 — 실제 쟁점이 생길 때만
### 정상사회/기관 압박
- `docs/NORMAL_SOCIETY_CONTINUITY_RULE.md`

### 가족/주요 인물 자율성·관계 설계
- `docs/NPC_DESIGN_V2.md`

### 거점 능력 성장·새 업그레이드 판단
- `docs/BASE_GROWTH_RULE.md`

### 화면 표현 세부 스타일 참고
- `docs/TEXT_VISUAL_GRAMMAR.md`

`TEXT_VISUAL_GRAMMAR.md`는 MUD 사용 여부를 결정하는 문서가 아니다. 기본 presentation
profile `MUD_TEXT_V1`은 항상 읽는 `runtime/GM_KERNEL.md`의 Personal Play Runtime
Invariant로 이미 활성화되어 있다. 이 문서는 태그·여백·자원표현 등 세부 스타일의 예시나
조정이 실제로 필요할 때만 추가로 읽는다.

### 시즌 종료/자산화
- `docs/SEASON_COMPLETION_PIPELINE.md`
- 해당 시즌 `PLAYTHROUGH_CANON.md`
- 해당 시즌 `RETROSPECTIVE.md`

### 저장/Canon Correction 정책
- `docs/AUTOSAVE_POLICY.md`

---

## D. 설계·역사층 — 기본 플레이에서는 읽지 않음
다음은 중요하지만 런타임 부팅 문서가 아니다.
- `core/GAME_BIBLE.md`
- `core/GM_RULES.md`
- `core/PROJECT_DECISIONS.md`
- `docs/PLAYTEST_DERIVED_RULES_V1.md`
- `docs/CORE_GAME_SYSTEMS_V1.md`
- `docs/MIDTERM_REVIEW_S01_S05.md`
- 과거 시즌 회고·브랜치맵·플레이로그
- `playtests/*`
- `idea_vault/*`
- `knowledge/*`

이들은 설계 변경, 중간점검, 충돌 해결, 시즌 자산화 때만 참고한다.

---

## E. 설정 충돌 우선순위
1. 사용자가 명시적으로 바로잡은 최신 Canon Correction
2. `core/CHARACTERS.json`
3. `core/PERSISTENT_CANON.md`
4. 현재 시즌 `GM_STATE.json`
5. `players/main/SAVE_STATE.json`
6. 해당 시즌 PLAYTHROUGH_CANON / CHECKPOINT
7. 설계·회고·과거 문서
8. GM 즉흥 생성

과거 시즌 문서는 역사 기록이지 현재값의 자동 우선권이 아니다.

---

## F. 읽기 예산
플레이 시작 시 원칙적으로 **4개 파일 이내**에서 장면을 시작한다.
진행 중 한 장면을 판단하기 위한 상세문서는 보통 **관련 모듈 1개만 추가**한다.

문서를 많이 읽는 것을 정확성으로 간주하지 않는다.
핵심 Canon과 현재 상태가 충분하면 바로 플레이한다.
