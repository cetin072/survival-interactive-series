# Survival Interactive Series

가칭 **《생존기록》** — 현대 가족 중심의 현실형 생존 인터랙티브 드라마.

## 현재 상태
- S01~S05 첫 플레이 완료.
- S01~S05 중간점검 완료: `docs/MIDTERM_REVIEW_S01_S05.md`
- Runtime: **v4**
- 다음 단계: **S06 post-midterm playtest**
- S06 상태: `READY FOR HIDDEN WORLD SEED`

현재 프로젝트는 새 시스템 탐색보다 **선택 비용·장면 박동·가족 자율성·시즌 다양성의 실행 검증 단계**다.

## 목표
- 재미와 몰입이 0순위.
- 가족 4인을 실제 파티처럼 운영.
- 현실적인 재난·사회·거점·정보·경제 압력을 경험.
- 플레이 중 강의하지 않고 시즌 종료 후 원할 때만 복기.
- 시즌 길이와 전개는 고정 대본보다 실제 플레이 완성도를 따른다.
- 좋은 준비는 실제 보상하되, 모든 목표의 무손실 보존이 매번 기본값이 되지는 않게 한다.

## 핵심 재미
1. 가족 운영
2. 거점 성장
3. 이해관계 기반 협업
4. 플레이어와 독립적으로 움직이는 세계 압력
5. 무엇을 우선하고 무엇을 포기할지 결정하는 비싼 선택

## 새 채팅 시작점
ChatGPT GM은 **`START_HERE.md` 하나부터** 읽는다.

### 실제 플레이 기본 로드
1. `runtime/GM_KERNEL.md`
2. `core/CHARACTERS.json`
3. `core/PERSISTENT_CANON.md`
4. `players/main/SAVE_STATE.json`

진행 중인 시즌을 이어갈 때만 해당 `GM_STATE.json`을 추가한다.
나머지 문서는 `runtime/LOAD_MAP.md`에 따라 필요할 때만 읽는다.

## 핵심 명령
- `S06 시작` / `생존기록 시작` → 새 시즌 시작
- `생존기록 이어서` → 최신 저장 상태에서 계속
- `메모: ...` → 아이디어 저장
- `저장` → 의미 있는 체크포인트 저장
- `종료` → 체크포인트 저장 후 세션 종료

## Source of Truth
이 저장소가 장기 설정·세이브·시나리오 기록의 원본이다.

우선권 핵심:
- 플레이 운영 핵심 → `runtime/GM_KERNEL.md`
- 캐릭터 최신값 → `core/CHARACTERS.json`
- 지속 세계/거점/관계 → `core/PERSISTENT_CANON.md`
- 현재 공개 상태 → `players/main/SAVE_STATE.json`
- 현재 시즌 숨은 상태 → 해당 시즌 `GM_STATE.json`

## 구조
- `runtime/` : 실제 플레이에 필요한 경량 GM 계층
- `core/` : 최신 캐릭터·Persistent Canon + 장기 설계 참조
- `players/` : 현재 SAVE, CHECKPOINT, 로그
- `seasons/` : 시즌별 상태, 실제 플레이 Canon, 회고
- `docs/` : 상세 규칙·모듈·중간점검·파이프라인
- `schemas/` : JSON 형식 검증
- `tools/` : SAVE/현재 시즌 상태 검증
- `playtests/` : 과거 테스트 기록
- `idea_vault/` : 미래 아이디어
- `knowledge/` : 현실 검증 자료

## 운영 원칙
- 규칙을 많이 읽는 것이 정확성이라고 보지 않는다.
- 새 문제가 생길 때마다 규칙을 추가하지 않는다.
- 먼저 GM_KERNEL의 기존 규칙으로 해결한다.
- 상세 규칙은 해당 시스템이 실제 장면에 등장할 때만 로드한다.
- GitHub는 매 턴 저장장치가 아니라 장기 기억용 체크포인트다.
- 최근 시즌과 같은 재난 이름뿐 아니라 같은 **플레이 행동 루프**의 반복도 피한다.

## S06 핵심 테스트
상세: `seasons/S06/DESIGN_STATUS.md`

요약:
- Decision Collision
- 복수선택 실제 기회비용
- 가족 자율행동/제안
- 최근 기반시설 시즌과 다른 행동군
- Phase별 플레이 동사 변화
- 메인 압력 종료 후 빠른 시즌 종료
- 새 시스템 없이 Runtime v4로 재미 개선

## 제품화
대형 게임엔진/복잡한 앱은 아직 자동 착수하지 않는다.

S06 또는 S07 이후:
1. 외부 블라인드 플레이 1회 이상
2. 핵심 루프 재미 확인
3. 필요하면 ChatGPT GM을 유지한 얇은 MUD UI 프로토타입
순서로 검토한다.

## 상태 검증
`tools/validate_state.py`는 현재 SAVE와 현재 시즌 상태의 주요 정합성을 교차 검증한다.

## 주의
저장소는 Public이다. 실제 주소·전화번호·계정정보·API 키·비밀번호·토큰 등 민감정보를 저장하지 않는다.
