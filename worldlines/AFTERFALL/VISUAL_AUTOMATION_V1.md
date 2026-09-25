# AFTERFALL — Visual Archive Automation v1

Status: **DESIGN CONTRACT / ISSUE #121**
Worldline: AFTERFALL
Priority: **LOW-TOUCH AUTOMATION > CONSISTENCY > PEAK IMAGE QUALITY**

## 1. Goal

AFTERFALL 비주얼은 별도 미술 프로젝트가 아니다.

사용자는:
- 본편 플레이
- PD 판단
- 주요 Canon 승인

에 집중한다.

비주얼 시스템은 이미 발생하고 확정된 플레이 데이터를 재사용하여
지도 / 거점 / 캐릭터 / 사건 자료를 자동 또는 승인 1회 수준으로 축적한다.

성공 기준:

> 게임을 계속하면 아카이브의 비주얼도 자연스럽게 쌓인다.

## 2. Hard boundaries

- 매 턴 이미지 생성 금지.
- 플레이를 중단하고 이미지 제작 세션을 반복하지 않는다.
- Canva/Figma 수작업을 정상 운영 경로에 넣지 않는다.
- AI 이미지 안에 장문 텍스트 / 정확한 숫자 / 좌표 / 설명문을 굽지 않는다.
- 텍스트와 메타데이터는 사이트 템플릿이 렌더링한다.
- Hidden GM 정보 / 미래 플롯 / 비공개 후방거점 보안정보를 공개 자산에 자동 노출하지 않는다.
- 정확한 거리 / 좌표 / 도로 관계는 deterministic world data가 담당한다.
- AI 이미지는 분위기 / 환경 / 장면의 시각화만 담당한다.
- 유료 외부 이미지 API / 신규 비용 구조는 별도 Human Decision 전까지 연결하지 않는다.
- 현재 Web Game MVP Issue #57 범위를 침범하지 않는다.

## 3. Existing source data — reuse first

새로운 입력 업무를 만들지 않고 현재 데이터를 재사용한다.

### WORLD_MAP
- `WORLD_MAP_GRID_V1.md`
- `saves.state.bases`
- 향후 확정된 route / node delta

### LOCATION
- `saves.state.bases`
- Canon base events
- scene location / outcome

### CHARACTER
- `survival_rpg.characters.known_facts.appearance_anchor`
- `presence`
- `role`
- 사건으로 확정된 visual_changes

### EVENT
- `survival_rpg.scenes.key_image`
- `outcome_summary`
- `participants`
- `location`
- `game_time`
- 연결된 `events`

원칙:

> 이미 GM이 플레이 저장을 위해 만든 데이터를 비주얼 입력으로 다시 쓴다.

## 4. Asset types — v1 only

초기에는 네 종류만 운영한다.

### WORLD_MAP
세계관 / 생활권 / 거점망 대표 지도.

생성 빈도:
- 최초 주요 거점망 확정
- 거점 이전
- 핵심 도로망의 영구 변화
- 시즌 단위 대형 지도 업데이트

### LOCATION
중요 거점 대표 이미지.

생성 빈도:
- 신규 주요 거점 확정
- 거점 외형 / 역할의 대규모 변화

단순 상태변화는 이미지 재생성 대신 사이트 데이터만 갱신한다.

### CHARACTER
핵심 캐릭터 Master Portrait.

생성 빈도:
- PLAYER / CORE
- 장기 반복성이 확정된 MAJOR 인물
- 외모 Canon이 충분히 존재할 때

Master Portrait 이후 복장 / 계절 / 부상 변화는 필요한 경우에만 파생한다.

### EVENT
시즌의 중요한 사건 카드.

모든 scene을 생성하지 않는다.
강한 장면 / 큰 결과 / 장기 Canon 변화가 있는 scene만 후보가 된다.

## 5. Lifecycle

각 visual asset은 아래 상태 중 하나를 가진다.

```text
CANDIDATE
  ↓
WAITING_CANON
  ↓
READY
  ↓
GENERATING
  ↓
GENERATED
  ↓
PUBLISHED
```

예외:
- REJECTED
- SUPERSEDED
- ERROR

의미:

- CANDIDATE: 자동 탐지됨. 제작 의무 없음.
- WAITING_CANON: 좋은 후보지만 위치/외형/결과가 아직 안정되지 않음.
- READY: 현재 Canon으로 생성 가능.
- GENERATING: provider job 진행 중.
- GENERATED: 이미지 확보됨.
- PUBLISHED: 아카이브 공개 manifest에 포함됨.
- REJECTED: 만들 가치가 없거나 품질/보안 문제로 제외.
- SUPERSEDED: 새 자산이 기존 자산을 대체함.

## 6. Automation rule

### 기본
AI가 매 턴 임의로 이미지를 만들지 않는다.

비주얼 후보는 저장된 Canon / scene / character / base 변경을 기반으로 파생한다.

### WORLD_MAP trigger
다음 조건이 모두 충족되면 READY 후보:
1. 핵심 거점 역할이 Canon으로 확정
2. 주요 거점 간 거리/경로가 현재 지도 모델과 정합
3. 공개용 지도에서 숨겨야 할 정보가 분류됨
4. 대규모 이전/재배치가 당장 예정되어 있지 않음

### CHARACTER trigger
다음 조건:
- tier가 PLAYER / CORE / 장기 MAJOR
- appearance_anchor가 충분함
- 아직 active master portrait가 없음

### LOCATION trigger
다음 조건:
- active base / recurring major location
- 이름과 기능이 Canon
- 외형 설명이 너무 불확정하지 않음

### EVENT trigger
scene의 `key_image`를 기본 seed로 사용하되 모든 scene을 자동 생성하지 않는다.

v1에서는 deterministic score 또는 시즌/체크포인트 후처리로 후보 수를 제한한다.

중요:
- 후보 선정은 자동화 가능
- 유료 생성 호출은 별도 비용 정책 승인 전에는 자동 실행하지 않음

## 7. Information / security class

모든 자산은 최소 아래 공개등급을 가진다.

- `PUBLIC_ARCHIVE`
- `PLAYER_ARCHIVE`
- `CORE_PRIVATE`

### PUBLIC_ARCHIVE
독자 / 일반 아카이브에 노출 가능.

### PLAYER_ARCHIVE
플레이어에게는 이미 공개된 Canon이지만 일반 공개 아카이브에는 선택적.

### CORE_PRIVATE
정확한 후방거점 좌표, 은닉 이동선, GM-only 정보 등.
공개 manifest 생성 대상에서 제외.

현재 `WORLD_MAP_GRID_V1.md`의 지도보안 규칙을 그대로 존중한다.

## 8. Minimal asset record — proposed

v1은 과도한 테이블 분리를 피한다.

`visual_briefs`, `visual_jobs`, `visual_assets`를 처음부터 각각 만들지 않는다.

우선 단일 asset record가 후보/brief/job/result를 함께 보유할 수 있게 한다.

권장 개념 구조:

```json
{
  "worldline_id": "AFTERFALL",
  "asset_id": "AF-MAP-001",
  "asset_type": "WORLD_MAP",
  "status": "WAITING_CANON",
  "title": "서림 생활권",
  "source_type": "WORLD_MAP",
  "source_ref": "WORLD_MAP_GRID_V1",
  "style_version": "AFTERFALL_ARCHIVE_V1",
  "visibility": "PLAYER_ARCHIVE",
  "brief": {},
  "prompt_snapshot": null,
  "provider": null,
  "provider_asset_id": null,
  "image_url": null,
  "generation_meta": {},
  "published_at": null
}
```

실제 DB DDL은 Phase 2에서 기존 RLS / 저장소 소유권을 확인한 뒤 적용한다.

## 9. Style version

프롬프트를 매번 새로 창작하지 않는다.

스타일은 버전으로 관리한다.

초기 식별자:

`AFTERFALL_ARCHIVE_V1`

v1의 방향:
- non-photorealistic
- realistic proportions and believable Korean environments
- illustrated / painterly treatment
- restrained detail so variation is acceptable
- low-to-medium saturation
- lived-in survival environment
- quiet atmosphere allowed
- no embedded typography
- no generic zombie / cyberpunk / tactical-poster default

정확한 Visual Bible은 reference가 더 쌓인 뒤 별도 문서로 승격한다.
현재 `VISUAL_REFERENCE_NOTES.md`는 creative reference로 유지한다.

## 10. Deterministic map rule

WORLD_MAP은 일반 AI 그림처럼 생성하지 않는다.

정확한 요소:
- node
- edge
- 거리
- 상대 방향
- 공개/비공개 layer

는 구조화 데이터에서 그린다.

AI를 사용한다면:
- 종이 질감
- 지형 분위기
- 장식적 환경 레이어
- 대표 배경

정도에 제한한다.

권장 출력 layer:

1. PUBLIC MAP
2. TRUSTED OPERATIONS MAP
3. CORE MAP

아카이브 대문용 첫 지도는 기본적으로 PUBLIC 또는 PLAYER_ARCHIVE 등급을 사용한다.

## 11. Archive manifest contract

사이트는 이미지 자체를 분석하지 않는다.

비주얼 자산의 구조화된 manifest를 읽어서 자동 카드화한다.

개념 예:

```json
{
  "asset_id": "AF-EVT-014",
  "type": "EVENT",
  "title": "대혹한 첫 붕괴",
  "image_url": "...",
  "game_time": "...",
  "location": ["..."],
  "characters": ["..."],
  "summary": "...",
  "related_scene_id": "...",
  "style_version": "AFTERFALL_ARCHIVE_V1"
}
```

사이트가 담당:
- 제목
- 날짜
- 설명
- 태그
- 관련 인물/거점/사건 링크
- 모바일 레이아웃

AI 이미지가 담당:
- 시각적 분위기 / 대표 장면

## 12. Provider boundary

Phase 1/2는 특정 이미지 모델에 종속하지 않는다.

향후 provider adapter contract:

```text
VisualAsset READY
→ build brief
→ render prompt
→ provider.generate()
→ validate result
→ upload object
→ GENERATED
→ archive publish rule
```

필수 guard:
- idempotency
- retry limit
- 최대 생성 장수
- 일/월 비용 상한
- provider/model/version 기록
- 실패해도 플레이 runtime에 영향 없음

비주얼 생성 장애는 게임 장애가 아니다.

## 13. First planned asset — world map

첫 공식 비주얼 목표:

`AF-MAP-001 — AFTERFALL / 서림 생활권 지도`

현재 상태:
`WAITING_CANON`

이유:
- 거리 모델은 이미 존재함.
- 그러나 제3거점 확장 이전 / 전면 2거점 / 후방 실습센터 역할 재편이 플레이에서 아직 최종 확정 전.
- 몇 턴 뒤 실제 거점 배치가 Canon으로 확정되면 첫 지도 제작 시점으로 승격한다.

지도 확정 후:
1. `WORLD_MAP_GRID_V1.md` 업데이트
2. 공개/비공개 layer 확인
3. map manifest 생성
4. 첫 대표 비주얼 생성
5. 아카이브 대문 배치

## 14. User workload target

정상 운영에서 사용자에게 요구되는 입력:

- 0회: 자동 후보 생성
- 필요 시 1회: 대표 비주얼 승인/기각
- 스타일 자체를 바꾸고 싶을 때만 PD 결정

사용자가 직접:
- 프롬프트 작성
- 카드 레이아웃 작업
- 텍스트 타이포 수정
- 파일명 정리
- Canva 편집

을 반복하지 않는 것을 목표로 한다.

## 15. Rollout

### Phase 1 — now
- 본 contract 저장
- Issue #121로 추적
- 기존 source data 재사용 확정

### Phase 2
- 최소 DB schema / RLS
- WORLD_MAP 최초 pending asset
- manifest read contract

### Phase 3
- provider 선택
- generation worker
- object storage
- 비용 guard

### Phase 4
- archive site renderer
- 대문 지도
- 카드 자동연결

## Final principle

> 플레이가 원본이다.
> 비주얼은 플레이에서 파생된다.
> 비주얼을 만들기 위해 플레이를 멈추지 않는다.
