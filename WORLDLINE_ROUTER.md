# WORLDLINE ROUTER — Repository-Level Boot Guard

이 문서는 이 저장소에 여러 플레이 세계선/부팅 세대가 공존할 때 **잘못된 세계선 폴백을 막는 최상위 라우팅 가드**다.

IP 전체 주인공 계보와 Chronicle identity는 `SURVIVAL_DIARY_IP_BIBLE.md`가 담당한다. 현재 시각·시즌·Save 값은 이 라우터에 복제하지 않고 해당 세계선의 최신 boot/handoff와 런타임 상태에서 확인한다.

## 1. 최우선 라우팅 규칙

사용자가 다음 중 하나를 명시하면 일반 `START_HERE.md`보다 먼저 해당 대상을 해석한다.

- 정확한 boot / handoff / checkpoint 파일명
- 특정 worldline 이름
- 특정 branch 이름
- 특정 주인공 또는 연속 연대기를 가리키는 명시적 문맥

이 경우:

1. default branch에서만 찾지 말고 저장소의 **브랜치까지 포함해 정확한 파일/ref를 찾는다.**
2. 파일이 발견되면 그 파일이 선언한 branch/worldline/directory를 고정한다.
3. 해당 worldline의 BOOT/CURRENT_STATE/feedback/handoff 규칙을 따른다.
4. 다른 세계선의 characters/state/save/canon을 보충자료나 fallback으로 섞지 않는다.
5. 정확한 파일을 찾지 못했거나 identity 검증이 실패하면 **장면 생성을 중단한다.** 그럴듯한 다른 세계선으로 대신 시작하지 않는다.

핵심: `default branch miss != file does not exist`.

## 2. Fail-closed identity gate

첫 장면 전에 최소한 다음을 서로 대조한다.

- boot가 선언한 worldline
- boot가 선언한 branch/ref
- CURRENT_STATE의 worldline/player
- 최신 handoff의 시점
- 사용자 요청에서 지칭한 주인공/연대기

서로 맞지 않으면 플레이를 시작하지 않는다.

## 3. 현재 등록된 독립 세계선

### STRONGHOLD
- Branch: `worldline/stronghold-chronicle`
- Directory: `worldlines/STRONGHOLD/`
- Current protagonist: `박도현`
- Current continuation entrypoint: `worldlines/STRONGHOLD/START_ROOM.md`
- Current state pointer: 같은 branch의 `worldlines/STRONGHOLD/CURRENT_STATE.json`; ACTIVE `LIVE_SCENE_STATE.md`가 있으면 현재 장면에 적용

STRONGHOLD는 과거 4인 가족 세계선과 완전히 별개다.

다음 자료는 STRONGHOLD current-state fallback으로 사용하지 않는다.
- `core/CHARACTERS.json`
- `core/PERSISTENT_CANON.md`
- `players/main/*`
- `canon_v2/*`
- `seasons/*`
- `seasons_v2/*`

STRONGHOLD의 정확한 로드 순서와 금지사항은 해당 branch의 최신 boot 파일이 권위 원문이다.

## 4. Legacy/default runtime

루트 `START_HERE.md`, `runtime/LOAD_MAP.md`, `core/*`, `players/main/*`는 기존 가족 기반 런타임을 위한 자료다.

사용자가 그 세계선/시즌을 명시적으로 요청했거나 별도 worldline 지시가 전혀 없을 때만 그 부팅 절차를 사용한다.

**명시적 worldline 또는 exact boot 파일 요청이 있는 경우 Legacy/default runtime이 우선권을 갖지 않는다.**

## 5. 현재성 우선 규칙

독립 worldline 안에서도:

`사용자 최신 교정 > 해당 세계선 START_ROOM/BOOT이 지정한 ACTIVE scene·최신 handoff overlay > CURRENT_STATE > 최신 ledger/archive/addendum > BOOT invariant > 오래된 canon/planning`

순으로 현재성을 판단한다.

오래된 내부 계획 문서의 기준시점이 현재보다 과거라면 이미 플레이된 역사를 되감거나 미플레이 과거 사건을 소급 삽입하지 않는다.

## 6. 유지관리

새 독립 worldline 또는 장기 전용 branch가 추가될 때 이 registry에 최소한 다음만 추가한다.
- branch
- directory
- protagonist/identity
- authoritative boot entrypoint
- current state pointer의 위치 (시각·시즌 값은 복제하지 않음)

세부 Canon은 이 파일에 복제하지 않는다. 이 파일은 **라우팅 전용**이다.


### AFTERFALL
- IP Chronicle: **03**
- Protagonist: **서진우**
- Branch: `worldline/afterfall-rpg`
- Directory: `worldlines/AFTERFALL/`
- Primary entrypoint: `worldlines/AFTERFALL/START_ROOM.md`
- Current continuation pointer: 같은 branch의 `worldlines/AFTERFALL/CURRENT_STATE.json`이 지정한 checkpoint
- Current runtime state: Supabase `taejang-phase1-staging.survival_rpg.saves`, `worldline_id='AFTERFALL'`

AFTERFALL은 《생존일기》 IP의 세 번째 주인공 연대기다.
박도현 STRONGHOLD 및 가족 기반 Legacy Chronicle과 현재상태를 공유하지 않는다.

현재 런타임 상태의 Source of Truth는 Supabase Save다.
GitHub는 부팅·세계/캐릭터 바이블·시즌 체크포인트·아카이브·IP 보존을 담당한다.

재개 시에는 해당 branch의 `CURRENT_STATE.json`이 가리키는 checkpoint를 확인하고, 오래된 START_HANDOFF로 현재 상태를 되감지 않는다.
