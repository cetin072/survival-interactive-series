# START HERE — Worldline Router

이 저장소에는 서로 다른 세대/세계선이 공존한다. **현재 상태를 섞어 읽지 않는다.**

## 1. 현재 주력 — STRONGHOLD

현재 `worldline/stronghold-chronicle` 브랜치에서 주력으로 플레이 중인 연속 세계선이다.

- 주인공: 박도현
- 현재 활성 시점: 2032년 3월 말
- 새 채팅 시작/재개 진입점: `worldlines/STRONGHOLD/START_ROOM.md`

STRONGHOLD를 시작하거나 이어갈 때는 **루트 Legacy runtime이나 Canon v2 가족 세계선으로 폴백하지 않는다.**

### STRONGHOLD 최소 부팅
1. `worldlines/STRONGHOLD/START_ROOM.md`
2. 그 파일이 지시하는 최소 파일만 읽는다.

`START_ROOM.md`가 STRONGHOLD 새방 부팅의 유일한 권위 진입점이다.

---

## 2. Canon v2 — 4인 가족 세계선

준호·서윤·민석·정호 중심의 별도 정식 세계선이다.
현재 STRONGHOLD와 상태를 공유하지 않는다.

Canon v2를 명시적으로 시작/재개할 때만:
- `REBOOT_START_HERE.md`
- `canon_v2/*`
- `seasons_v2/*`

를 사용한다.

---

## 3. Legacy

과거 S01~S07 및 초기 runtime/core/player 구조는 역사·설계 참고용이다.
현재 STRONGHOLD 또는 Canon v2의 현재 상태로 사용하지 않는다.

대표 경로:
- `runtime/*`
- `core/*`
- `players/*`
- `seasons/*`

---

## 4. 현재 개발 전략

현재 우선순위는 **Play First / Build Later**다.

- 실제 장기 플레이로 재미·GM 구조를 먼저 검증한다.
- 웹게임 개발은 별도 Issue/PR에서 재개한다.
- STRONGHOLD의 현재 장면·관계·상태를 기존 가족 Thin Engine에 억지로 끼워 넣지 않는다.
- 개발이 다시 시작되면 AI GM과 deterministic state 책임을 분리한다.

웹 런타임 감사: Issue #69
STRONGHOLD 운영체계 정리: Issue #74

---

## 5. Source of Truth 원칙

### STRONGHOLD
- 새방 라우팅: `worldlines/STRONGHOLD/START_ROOM.md`
- 게임 규칙: `BOOT.md`
- Long State: `CURRENT_STATE.json`
- 상태 우선순위: `STATE_PROTOCOL.md`
- 현재 활성 장면: ACTIVE `LIVE_SCENE_STATE.md`
- 현재 플레이 피드백: `PLAYER_FEEDBACK.md`
- 영구 사건: `LEDGER.md` / 최신 append
- 캐릭터 앵커: Character Bible
- 오래된 안정 사실: `CANON.md`
- RAW: Cold Archive이며 정상 부팅 입력이 아님

### 충돌 시
STRONGHOLD에서는 사용자 최신 교정 → ACTIVE LIVE → CURRENT_STATE → 최신 영구 기록 → BOOT → 오래된 Canon/Archive 순으로 본다.

---

## 6. 보안/저장소 주의

저장소는 Public이다.
실제 주소·전화번호·계정정보·API 키·비밀번호·토큰·개인 접근코드 등 민감정보를 저장하지 않는다.
