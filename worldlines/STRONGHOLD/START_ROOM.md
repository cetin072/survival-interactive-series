# STRONGHOLD — Authoritative New-Room Entry

Status: **AUTHORITATIVE BOOT ENTRYPOINT**

이 파일은 STRONGHOLD 새 채팅방 시작/재개용 **유일한 부팅 진입점**이다.
`BOOT.md`, 과거 `NEXT_ROOM_BOOT_*`, 루트 Legacy/Canon v2 부팅문서가 독자적인 새방 순서를 만들지 않는다.

## 0. Fail-closed worldline gate

장면을 쓰기 전에 반드시 확인한다.

- Repository: `cetin072/survival-interactive-series`
- Branch/ref: `worldline/stronghold-chronicle`
- Directory: `worldlines/STRONGHOLD/`
- `BOOT.md` identity: `STRONGHOLD`
- `CURRENT_STATE.json` player: `박도현`

하나라도 확인할 수 없으면 **다른 세계선으로 폴백하지 말고 부팅을 중단**한다.

다음 자료는 STRONGHOLD 현재 상태의 대체 소스로 사용하지 않는다.
- 루트 Legacy runtime/core/player state
- `canon_v2/*`, `seasons_v2/*`
- 한준호·서윤·민석·정호 4인 가족 세계선의 현재 상태
- 오래된 `NEXT_ROOM_BOOT_*` 파일
- RETIRED / HISTORICAL 표시가 된 과거 운영문서

## 1. 새 방 최소 부팅 순서

아래 순서가 유일한 새방 부팅 순서다.

1. `START_ROOM.md` — 이 라우팅 규칙
2. `BOOT.md` — 변하지 않는 게임/GM 원칙
3. `CURRENT_STATE.json` — 최신 Long State 체크포인트
4. `STATE_PROTOCOL.md` — 상태 우선순위와 업데이트 규칙
5. `LIVE_SCENE_STATE.md` — **Status가 ACTIVE일 때 반드시 읽고 현재 장면에 오버레이**
6. `PLAYER_FEEDBACK.md` — 현재 유효한 플레이 취향/운영 교정
7. 필요할 때만 최근 `LEDGER.md`/`LEDGER_APPEND_*`, `CHARACTER_BIBLE_V1.md`, `RELATIONSHIP_CHARACTER_POLICY_V2.md`, `CANON.md`

기본 부팅에서 과거 RAW 전체, ROOM_ARCHIVE, `NEXT_ROOM_BOOT_*`, 개별 회고문, retired addendum, retired macro 계획을 읽지 않는다.

## 2. 현재성 우선순위

충돌 시 우선순위:

1. 사용자의 최신 명시 교정
2. ACTIVE `LIVE_SCENE_STATE.md`의 현재 장면 사실/rollback boundary
3. `CURRENT_STATE.json` Long State
4. 최신 영구 변화 `LEDGER` / `CHARACTER_BIBLE_V1.md`
5. `BOOT.md`의 불변 운영 원칙
6. 오래된 `CANON.md` / Archive
7. 비활성·과거 계획 문서

중요:
- `CURRENT_STATE`와 ACTIVE `LIVE` 날짜가 달라도 오류가 아니다.
- CURRENT_STATE는 마지막 장기 체크포인트다.
- LIVE는 그 이후의 진행 중인 Hot State다.
- `이동 중`, `합류 예정`, `통화 예정`을 완료된 사실로 선행 확정하지 않는다.

## 3. 장기계획 상태

현재 `gm_private/MACRO_SPINE_V1.md`는 **RETIRED** 상태다.
정상 부팅에서 읽지 않는다.

새 장기 방향이 필요하면:
- 현재 세계 상태에서 자연스럽게 설계
- 정확한 미래 장면/사망/관계결과/손실/엔딩을 선확정하지 않음
- 플레이어 축적과 선택이 결과를 바꾸게 함
- 현재와 가까운 hours / days / weeks만 고해상도로 계획

## 4. 게임 시작

부팅이 끝나면 메타 설명 없이 현재 장면에서 바로 이어간다.

- MUD + 읽기 좋은 웹소설형 진행
- 실제 갈림길에서만 선택권 반환
- 보통 2~3개의 의미 있는 선택지 + 자유행동 가능
- 사용자의 `ㄱ`/`계속`은 이미 존재하는 갈림길을 자동 위임하는 명령이 아니라, 갈림길이 없을 때 다음 장면을 계속하라는 뜻으로 해석
- 이미 전략이 정해진 루틴은 자동처리
- 중요한 장기 방향, 관계 전환, 큰 투자/포기, 큰 위험 수용은 자동확정하지 않음

## 5. 같은 장면의 다음 턴

새방 부팅을 반복하지 않는다.

1. 직전 사용자 입력
2. ACTIVE Hot State / 직전 장면 사실
3. 충돌이 있을 때만 Long State

장면 연속성이 민감한 이동·합류·분리·통화·위기에서는 `LIVE_SCENE_STATE.md`를 짧게 유지한다.

## 6. 종료/방 이동

큰 장 또는 방을 닫을 때:
- Long State가 변했으면 `CURRENT_STATE.json` 체크포인트
- 영구 변화만 LEDGER
- ACTIVE 장면이 남으면 LIVE 갱신
- 종료된 장면이면 LIVE 비활성/교체
- RAW는 정확한 원문에 접근 가능한 범위에서 Cold Archive 처리
- 기억/요약으로 RAW 대사를 재창작하지 않음

과거 인수인계용 `NEXT_ROOM_BOOT_*`를 새로 만들지 않는다. 다음 방도 이 `START_ROOM.md` 하나에서 시작한다.
