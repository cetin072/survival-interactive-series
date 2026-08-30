# Survival Interactive Series

가칭 **《생존기록》** — 현대 가족 중심의 현실형 생존 인터랙티브 드라마.

## 목표
- 재미와 몰입이 0순위.
- 가족 4인을 실제 파티처럼 운영.
- 현실적인 재난·사회·거점·정보·경제 압력을 경험.
- 플레이 중 강의하지 않고 시즌 종료 후 원할 때만 복기.
- 시즌 길이와 전개는 고정 대본보다 실제 플레이 완성도를 따른다.

## 새 채팅 시작점
ChatGPT GM은 **`START_HERE.md` 하나부터** 읽는다.

START_HERE는 다시 최소 런타임 문서만 로드한다.

### 실제 플레이 기본 로드
1. `runtime/GM_KERNEL.md`
2. `core/CHARACTERS.json`
3. `core/PERSISTENT_CANON.md`
4. `players/main/SAVE_STATE.json`

진행 중인 시즌을 이어갈 때만 해당 `GM_STATE.json`을 추가한다.
나머지 문서는 `runtime/LOAD_MAP.md`에 따라 필요할 때만 읽는다.

## 핵심 명령
- `생존기록 시작` → 새 시즌 시작
- `생존기록 이어서` → 최신 저장 상태에서 계속
- `메모: ...` → 아이디어 저장
- `저장` → 의미 있는 체크포인트 저장
- `종료` → 체크포인트 저장 후 세션 종료

## Source of Truth
이 저장소가 장기 설정·세이브·시나리오 기록의 원본이다.

우선권 핵심:
- 캐릭터 최신값 → `core/CHARACTERS.json`
- 지속 세계/거점/관계 → `core/PERSISTENT_CANON.md`
- 현재 공개 상태 → `players/main/SAVE_STATE.json`
- 현재 시즌 숨은 상태 → 해당 시즌 `GM_STATE.json`
- 플레이 운영 핵심 → `runtime/GM_KERNEL.md`

## 구조
- `runtime/` : **실제 플레이에 필요한 경량 GM 계층**
- `core/` : 최신 캐릭터·Persistent Canon + 상세 설계 참조
- `players/` : 현재 SAVE, 사람이 읽는 CHECKPOINT, 로그
- `seasons/` : 시즌별 Hidden State, 실제 플레이 Canon, 회고
- `docs/` : 상세 규칙·모듈·파이프라인. 기본 플레이에서는 조건부 로드
- `schemas/` : JSON 형식 검증
- `tools/` : 현재 SAVE와 현재 시즌 상태 교차 검증
- `playtests/` : 과거 테스트 기록
- `idea_vault/` : 미래 아이디어
- `knowledge/` : 현실 검증 자료

## 운영 원칙
- 규칙을 많이 읽는 것이 정확성이라고 보지 않는다.
- 새 문제가 생길 때마다 규칙을 추가하지 않는다.
- 먼저 GM_KERNEL의 기존 규칙으로 해결한다.
- 상세 규칙은 해당 시스템이 실제 장면에 등장할 때만 로드한다.
- GitHub는 매 턴 저장장치가 아니라 장기 기억용 체크포인트다.

## 상태 검증
`tools/validate_state.py`는 현재:
- 캐릭터
- 최신 SAVE
- SAVE가 가리키는 시즌의 GM_STATE
- season_id
- Phase
- 시즌 완료 상태
을 교차 검증한다.

## 주의
저장소는 Public이다. 실제 주소·전화번호·계정정보·API 키·비밀번호·토큰 등 민감정보를 저장하지 않는다.
