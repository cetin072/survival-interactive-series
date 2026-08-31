# Canon v2 — Reboot S01 Start Handoff

Status: READY FOR HIDDEN WORLD SEED

## Purpose

정식 《생존일기》 시즌 1을 시작한다.

이 문서는 사건 대본이 아니다. 첫 플레이 직전에 GM이 비공개 Hidden World Seed를 생성하기 위한 최소 handoff다.

## Timeline

- `timeline_id`: `canon_v2`
- `season_id`: `S01`
- Legacy S01~S07 current state: **DO NOT LOAD**

## Public baseline

- 현대 한국의 평범한 일상에서 시작한다.
- 가족 4인은 `canon_v2/CHARACTERS.json`을 따른다.
- 평시 거주/생활은 `canon_v2/PERSISTENT_CANON.md`를 따른다.
- Legacy에서 강화된 거점·마을 협력·자산은 없다.
- 플레이어는 곧 아포칼립스가 온다는 확정 정보를 모른다.

## S01 creative targets

이번 시즌은 Legacy 프로토타입에서 확인된 약점을 직접 개선한다.

### Character
- 적어도 2명 이상의 가족이 플레이어와 다른 판단을 실제로 내릴 가능성이 있어야 한다.
- 갈등은 억지 싸움이 아니라 각자의 want/fear/stubborn_point에서 나온다.

### Urgency
- 한 사건을 해결할 동안 세계가 멈추지 않는다.
- 최소 한 번 이상 동시에 진행되는 압력이 플레이어 우선순위를 시험한다.

### Scale
- 정식 S01은 장기 아포칼립스의 시작점이 될 수 있는 사건이어야 한다.
- `며칠 불편 → 기존 상태 완전복귀`가 기본 결말이 아니다.
- 단, 첫 장면부터 전체 규모를 설명하지 않는다.

### Cost
- 좋은 판단을 해도 모든 가치의 무손실 보존을 보장하지 않는다.
- 손실/기회비용은 세계 인과에서 발생하며 플레이어 처벌용으로 강제하지 않는다.

### Pacing
- 반복 건설/정비는 AUTO.
- 장면은 변화, 충돌, 위험, 중요한 선택이 있을 때 집중한다.

## Hidden World Seed requirements

첫 출력 전에 비공개로 확정:
- 시작 날짜/요일/시간
- 가족 4인 위치
- 차량 위치
- 첫 플레이어가 알고 있는 일상 사실
- 실제 재난 정체
- 재난 장기 규모
- 외생 압력 2~4개
- 연쇄/2차 위험
- 정보 공개 경로
- Phase 전환 조건
- 가능한 새로운 안정상태

## Diversity check

Legacy 최근 플레이의 다음 루프를 그대로 반복하지 않는다.
- 단순 산불 재현
- 정전 후 거점 보강만 반복
- 회사/마을 운영이 메인 드라마를 대체
- 매 턴 확인/대기/이동만 반복

## Presentation

첫 출력부터 `MUD_TEXT_V1`.

플레이어에게는 제작 용어를 노출하지 않는다.

## Education hook

시즌 종료 후 `docs/POST_SEASON_SURVIVAL_DEBRIEF_V1.md`에 따라:
- 실제 선택 복기
- 위험/판단/운 구분
- 현실 준비 개선점
- 공식 출처 기반 핵심 생존지식

을 제공한다.

## Start command

사용자가 새 채팅에서:

> `정식 시즌 1 시작`

이라고 입력하면 `REBOOT_START_HERE.md`를 기준으로 부팅 후 즉시 첫 장면을 시작한다.
