# Survival Interactive Series — 《생존일기》

현대 한국을 배경으로 **장기 누적 상태 + AI GM + 플레이어 선택**으로 진행하는 텍스트 중심 생존 인터랙티브 프로젝트.

## 현재 프로젝트 상태

저장소에는 서로 다른 세대/세계선이 함께 보존되어 있다.

### A. Legacy
과거 S01~S07 및 초기 runtime/core/player 구조.
현재 플레이 상태가 아니라 역사·설계 참고 자산이다.

### B. Canon v2 Family
준호·서윤·민석·정호 4인 가족 중심의 별도 정식 세계선.
보존하지만 현재 주력 STRONGHOLD와 상태를 공유하지 않는다.

### C. STRONGHOLD — 현재 주력
박도현 중심의 단일 장기 연대기.

- Branch: `worldline/stronghold-chronicle`
- Directory: `worldlines/STRONGHOLD/`
- 새방 진입점: `worldlines/STRONGHOLD/START_ROOM.md`
- 현재 활성 시점: 2032년 3월 말
- 박도현 현재 연령 기준: 39세
- 핵심 방향: 생존 → 적응 → 축적 → 애착 → 실제 대가/손실 가능성 → 변화한 세계에서 다시 생존

## 현재 우선순위

**Play First / Build Later**

지금은 웹 기능 확장보다 실제 플레이의 재미, 장기 연속성, AI GM 품질을 먼저 검증한다.

- 중요한 것은 재미와 몰입
- 세계는 리셋 없이 누적
- 좋은 준비는 실제 보상
- 그러나 모든 사람·자산·관계가 항상 무손실 보존되지는 않음
- 평범한 루틴은 압축
- 실제 갈림길에서만 플레이어 선택
- 회사/사업/건설/행정은 필요할 때만 전면화
- 사람은 독립적으로 판단하며 박도현의 말판이 아님

## STRONGHOLD Source of Truth

### 새 방
`START_ROOM.md` 하나에서 시작한다.

### 상태 계층
- `BOOT.md` — 게임/GM 불변 원칙
- `CURRENT_STATE.json` — Long State 체크포인트
- `STATE_PROTOCOL.md` — 상태 우선순위
- `LIVE_SCENE_STATE.md` — ACTIVE일 때 현재 장면 Hot State
- `PLAYER_FEEDBACK.md` — 현재 유효한 플레이 피드백
- `LEDGER.md` / 최신 append — 영구 변화
- Character Bible — 인물 외형/성향/관계 앵커
- `CANON.md` — 오래된 안정 사실
- RAW transcript — Cold Archive, 정상 부팅 입력 아님

충돌 시:

`사용자 최신 교정 → ACTIVE LIVE → CURRENT_STATE → 최신 영구 기록 → BOOT → 오래된 Canon/Archive`

## AI와 상태 책임

목표는 AI를 제거하는 것이 아니라 책임을 나누는 것이다.

### deterministic state가 맡기 좋은 것
- 날짜/시간
- 인물 age reference
- 위치
- 차량/거점/자산
- resource band
- pending vs completed
- 영구 사건
- 현재 장면 체크포인트

### AI GM이 맡는 것
- 장면 서술
- 대화
- 독립 인물 반응
- 자유행동 해석
- 사건·갈등 생성
- 서사적 결과 표현

## 웹게임 개발

웹 MVP/Thin Engine 실험은 별도 Issue/PR로 보존 중이며 현재 플레이보다 우선하지 않는다.

- 웹 런타임 아키텍처 감사: Issue #69
- STRONGHOLD 운영체계 정리: Issue #74

웹 개발 재개 시 기존 Draft/Preview 흐름을 먼저 검토한다. Production 배포나 main 병합을 자동으로 진행하지 않는다.

## RAW / IP 보존

RAW 대화는 장기 IP 자산의 1차 자료다.

`RAW PLAY → CANON / LEDGER / CURRENT_STATE → IP PACKAGE`

원칙:
- 실제 확인 가능한 원문만 저장
- 기억/요약으로 빠진 대사를 재창작하지 않음
- 신규 플레이는 큰 장/방 종료 때 가능한 범위에서 Cold Archive
- 과거 RAW 전체 백필 완료를 플레이 재개 조건으로 만들지 않음

## 시작 위치

세계선 선택과 부팅은 루트 `START_HERE.md`를 따른다.

## Public repository 주의

실제 주소·전화번호·계정정보·API 키·비밀번호·토큰·개인 접근코드 등 민감정보를 저장하지 않는다.
