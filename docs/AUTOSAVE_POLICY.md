# Autosave & Memory Policy — Lightweight v2

이 문서는 저장이 실제 쟁점일 때만 읽는 상세 모듈이다.
기본 원칙은 `runtime/GM_KERNEL.md`의 저장 규칙이 우선한다.

## 1. GitHub의 역할
GitHub는 **장기 기억과 복구용 체크포인트**다.
대화·선택·자원변화를 매 턴 복제하는 실시간 로그가 아니다.

기본:
- 일반 선택은 저장하지 않는다.
- 여러 장면을 저장 없이 진행해도 된다.
- 보통 한 플레이 세션 1~3회 저장이면 충분하다.
- 저장 때문에 본편 템포를 끊지 않는다.

## 2. 체크포인트 3단계
### A. Runtime Checkpoint
다음 중 하나면 SAVE와 필요한 시즌 상태를 갱신한다.
- Phase 전환
- 가족의 큰 분리/합류/역할구조 변화
- 거점·차량·핵심자산의 의미 있는 변화
- 고용·주거·장기 생활구조 변화
- 중요한 손실/획득

기본 대상:
- `players/main/SAVE_STATE.json`
- 현재 시즌 `GM_STATE.json` — 숨은 상태가 변한 경우만

### B. Session Checkpoint
채팅방 이동, 장기 중단, 사용자의 `저장/종료` 요청 시:
- `SAVE_STATE.json`
- `CHECKPOINT.md`
- 필요한 경우 `GM_STATE.json`

`SESSION_LOG.md`는 모든 세션에 의무 갱신하지 않는다. 장기 기록 가치가 있을 때만 사용한다.

### C. Canon Checkpoint
시즌을 넘어 지속될 사실이 확정되면:
- `core/PERSISTENT_CANON.md`
- 필요한 현재 SAVE/GM 상태

Canon 대상 예:
- 가족 구조/거주방식
- 거점 핵심 능력
- 중요 NPC 관계
- 공동 소유/비용/접근권
- 장기 직장·학교·병원 구조

일회성 소모품·임시 위치·짧은 일정은 Persistent Canon에 넣지 않는다.

## 3. 시즌 종료
최소 종료 저장만 먼저 한다.
- `SAVE_STATE.json`
- `CHECKPOINT.md`
- 해당 시즌 `GM_STATE.json`
- 실제 플레이를 보존할 필요가 있으면 `PLAYTHROUGH_CANON.md`
- 지속 사실만 `PERSISTENT_CANON.md`에 승격

Branch Map, Scenario v1.0, Visual Bible, 미디어 계획 등은 **자동 의무작업이 아니다.**
사용자가 시즌을 자산화하기로 결정할 때 `SEASON_COMPLETION_PIPELINE.md`의 확장 단계를 실행한다.

## 4. Canon Correction
사용자가 과거 사실을 바로잡으면:
1. 현재 장면을 즉시 수정한다.
2. 최신 Source of Truth를 확인한다.
3. 시즌을 넘어 지속되는 사실이면 `PERSISTENT_CANON.md`를 수정한다.
4. 현재 SAVE/GM_STATE에 영향이 있으면 함께 수정한다.
5. 과거 시즌 문서 수정은 **향후 오해를 막는 데 실제로 필요할 때만** 한다.

과거 모든 파일을 연쇄적으로 고치는 것을 기본값으로 삼지 않는다.

## 5. 아이디어/버그
플레이 중 아이디어나 버그가 나와도 즉시 별도 GitHub 쓰기를 강제하지 않는다.
- 현재 장면을 계속 진행할 수 있으면 플레이 우선.
- 다음 의미 있는 체크포인트에서 함께 기록할 수 있다.
- 즉시 잊히면 안 되는 Canon Correction만 예외적으로 우선 처리한다.

## 6. 파일 역할
- `SAVE_STATE.json` — 최신 공개 플레이 상태, 기계 친화적.
- `CHECKPOINT.md` — 사람이 읽는 빠른 재개 요약.
- `GM_STATE.json` — 현재 시즌의 숨은 세계/시드/Phase.
- `PERSISTENT_CANON.md` — 시즌 간 지속 사실만.
- `PLAYTHROUGH_CANON.md` — 종료된 시즌의 실제 역사.
- `RETROSPECTIVE.md` — 게임/플레이 평가 기록.

같은 사실을 여러 파일에 복사하는 것을 최소화한다.
중복이 필요한 경우 SAVE↔GM_STATE처럼 검증 가능한 핵심 상태만 허용한다.

핵심:
`필요한 사실을 잃지 않되, 저장 자체가 게임이 되지 않게 한다.`
