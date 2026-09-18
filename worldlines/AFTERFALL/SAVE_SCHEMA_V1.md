# AFTERFALL — Save Contract v1

Status: **AUTHORITATIVE RUNTIME STORAGE CONTRACT**

## Source of Truth
실시간 현재상태의 유일한 원본은 Supabase:
- Project: `taejang-phase1-staging`
- Schema: `survival_rpg`
- Table: `saves`
- Key: `worldline_id = 'AFTERFALL'`

GitHub의 CURRENT_STATE는 런타임 상태 복제본이 아니라 이 Save를 가리키는 부팅 포인터다.

## saves.state — 플레이어에게 공개 가능한 현재상태
권장 최상위 구조:

```json
{
  "worldline": "AFTERFALL",
  "status": "PREPLAY_READY",
  "season": 1,
  "player": {},
  "body": {},
  "gear": [],
  "supplies": {},
  "party": [],
  "vehicles": [],
  "bases": [],
  "quests": {},
  "factions": {},
  "villains": {},
  "world_phase": "PRE_COLLAPSE",
  "known_world": {},
  "flags": {},
  "recent_events": []
}
```

초기에는 필요한 것만 채운다.
빈 시스템을 억지로 수치화하지 않는다.

## 관계 상태 계약
솔로 플레이에서는 player.relationship_profile을 권장한다.

```json
{
  "mode": "SOLO",
  "living_arrangement": "ALONE",
  "spouse": "NONE",
  "partner": "NONE",
  "children": "NONE",
  "cohabitants": "NONE",
  "parents": "UNDEFINED",
  "siblings": "UNDEFINED",
  "generation_policy": "LAZY",
  "relationship_is_not_motivation": true
}
```

- NONE은 현재 없다고 확정된 관계다.
- UNDEFINED는 생사·관계·거주지 모두 미확정이며, 부재나 사망을 뜻하지 않는다.
- UNDEFINED 관계는 known_characters, 관측 기록, 퀘스트, 목적지, pending consequence에 생성하지 않는다.
- 플레이어가 직접 언급하거나 확정하기 전에는 관계 NPC를 만들지 않는다.
- 관계가 확정되어도 연락·귀가·구조·합류 의지는 별도 선택 없이는 저장하지 않는다.
- 관계 교정 시 과거 이벤트를 삭제하지 않고 CONTINUITY_CORRECTION 이벤트로 무효 범위를 남긴다.

## saves.gm_state — GM 전용 비공개 런타임
- Hidden World Seed
- 아직 공개되지 않은 외부 사건
- 숨은 NPC 목표/정보
- pending consequences
- 재난 압력/전환 조건
- 플레이어가 아직 모르는 세력/경로/자원 사실

사용자에게 게임 중 노출하지 않는다.
특정 세계관 설명을 미리 확정하는 대본 저장소로 쓰지 않는다.

## events
`survival_rpg.events`는 과거 중요 사건 장부다.
현재상태의 Source of Truth가 아니다.

기록 후보:
- CHARACTER_CREATED
- INJURY / RECOVERY
- ITEM_GAIN / ITEM_LOSS
- VEHICLE_GAIN / VEHICLE_LOSS
- PARTY_JOIN / PARTY_LEAVE / PARTY_DEATH
- RELATIONSHIP_MAJOR_CHANGE
- BASE_GAIN / BASE_LOSS / BASE_MAJOR_UPGRADE
- QUEST_MAJOR_CHANGE
- FACTION_RELATION_CHANGE
- VILLAIN_DEFEATED
- SEASON_PHASE_CHANGE
- SEASON_CLOSE

## Save 시점
다음이 실제로 바뀌면 같은 턴 종료 전에 saves를 갱신한다.
- 플레이어 상태/부상
- 장비/핵심 자원
- 파티 구성/위치의 중요한 변화
- 차량
- 거점
- 퀘스트
- 주요 관계
- 세력/빌런 상태
- 시즌/세계 Phase

평범한 대화·몇 분 이동·일상 소비처럼 현재 판단에 영향이 없는 미세 변화는 매번 저장하지 않는다.

## 원칙
- **State before Story**: 중요한 판정 전 현재 Save를 우선 확인.
- 이야기에서 얻지 않은 자산을 Save에 만들지 않는다.
- Save에 없는 과거 사실을 GM 기억만으로 확정하지 않는다.
- 상태와 서사가 충돌하면 사용자 최신 명시교정 > Supabase Save > 현재 턴의 확정 Delta > GitHub 아카이브 순으로 해결한다.


## 중요 인물 외모 저장
반복 등장 가능성이 높은 중요 인물은 최소한의 외모 Canon을 Save에 보존할 수 있다.

권장 필드:
- `appearance_anchor`: 나이 인상 / 키 / 체형 / 얼굴 핵심 / 머리 / 목소리 / 특징
- `presence`: 분위기 1~3개
- `visual_changes`: 흉터·부상·노화·장비 변화 등 사건 이후 변화

외모 수치화는 기본값이 아니다.
`beauty_score` 같은 단순 미모 점수는 저장하지 않는다.
