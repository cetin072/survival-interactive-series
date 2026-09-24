# 생존일기 ARCHIVE Sync Policy v2

Status: ACTIVE  
Worldline: AFTERFALL  
Purpose: 플레이를 방해하지 않으면서 플레이어가 이미 발견한 세계를 읽기 전용 아카이브로 축적한다.

## 1. 역할 분리

- ChatGPT / GM: 게임 진행, 정본 판정, 에피소드 종료 시 공개 아카이브 동기화
- Supabase: 현재 Runtime source of truth
- GitHub: 장기 Canon / Archive 소스와 웹 코드
- Netlify: 읽기 전용 웹 표시
- Player: 게임만 플레이하고 필요할 때 Archive를 열람

## 2. 동기화 시점

Archive는 **이벤트 기반 + 일일 정합성 보정**으로 운영한다.

### A. 즉시/에피소드 기반 갱신
다음이 발생하면 Archive 갱신 후보로 처리한다.

1. 중요한 사실이 Canon으로 확정될 때
2. 주요 장면/에피소드가 종료될 때
3. 주요 인물·관계·장소·거점 상태가 변할 때
4. 새로운 PLAYER_SAFE 공개 transcript 구간이 확보될 때

매 대사/매 턴마다 Netlify를 재배포하지 않는다.
플레이 세션 중 누적된 공개 변화는 의미 있는 장면/에피소드 경계에서 묶어 반영한다.

### B. 일일 정합성 보정
매일 **04:20 KST**를 기본 보정 시각으로 사용한다.

점검 대상:
- Supabase Runtime ↔ GitHub Canon ↔ Archive snapshot 불일치
- 새 Canon 사건/Scene 누락
- 인물/장소/관계 Edge 누락
- 공개 transcript 누락
- 최신 사건 정렬(newest-first)
- Archive의 Chronicle/Worldline/Season 표기
- 현재 save/checkpoint revision
- PLAYER_SAFE 경계 위반 여부

변경이 없으면 불필요한 배포를 만들지 않는다.

### C. 시즌 종료
시즌 종료 시에는 일상 갱신보다 큰 full closeout을 수행한다.

- 전체 시즌 transcript inventory
- Persistent Canon
- ARC / End State
- Chronicle / Worldline 상태
- 인물/장소/사건/Graph 정합성
- 다음 시즌 Handoff
- Archive publication 상태

사소한 일일 소비, 반복 파밍, 일시적인 장면 상태는 Archive에 매번 쓰지 않는다.

## 3. 공개 안전 규칙

Archive는 PLAYER_SAFE만 표시한다.

허용:
- 이미 플레이에서 확인된 인물 정보
- 현재 공개된 관계와 소속
- 이미 방문/확인한 장소
- Canon 사건 요약
- 공개 World Pressure
- 플레이어가 이미 획득한 지속 사실
- Creative Reference임이 명확한 참고자료

금지:
- survival_rpg.saves.gm_state
- survival_rpg.characters.hidden_state
- 미래 사건 / 예정 손실 / 예정 사망
- 플레이어가 아직 발견하지 않은 NPC 동기·관계 결과
- Hidden World Seed
- GM-only 기획 문서의 미발생 내용

## 4. 현재 V1 데이터 소스

Runtime:
- survival_rpg.characters — hidden_state 제외
- survival_rpg.scenes — CANON만
- survival_rpg.world_pressures
- survival_rpg.events — 필요 시 CANON 요약
- survival_rpg.saves — 공개 state만, gm_state 제외

Long-term source:
- worldlines/AFTERFALL/CHARACTER_BIBLE.md
- worldlines/AFTERFALL/PERSISTENT_CANON.md
- worldlines/AFTERFALL/seasons/* approved archive / checkpoint
- worldlines/AFTERFALL/VISUAL_REFERENCE_NOTES.md

## 5. 웹 구조

V1:
- 통합검색
- 인물 / 지역 / 사건 / 자료 분류
- Wiki형 상세 패널
- 선택 노드의 1-hop 관계 그래프
- 주요 사건 Timeline
- 공개 World Pressure

원칙:
- 3D 그래프보다 2D 관계 탐색을 우선한다.
- 전체 그래프를 한 번에 보여주지 않고 선택 노드 주변부터 펼친다.
- Archive는 게임 엔진이 아니다.
- 편집 UI, 전투 시스템, 인벤토리 시스템을 Archive에 추가하지 않는다.

## 6. Episode closeout 절차

주요 에피소드 종료 후:

1. Runtime consistency 확인
2. 세션/장면의 공개 transcript 확보 범위 확인
3. 새 Canon 사건/관계/장소 변화 추출
4. PLAYER_SAFE 여부 판정
5. transcript publication layer 갱신
6. Archive node / edge / timeline snapshot 갱신
7. GitHub 반영
8. Netlify 배포 확인

시즌 종료 시에는 추가로:
- Season archive
- Persistent Canon
- End State
- 다음 시즌 Handoff
와 Archive 상태를 함께 정리한다.

## 7. 현재 구현 위치

- Web entry: archive/web/src/App.tsx → standalone Archive
- Archive UI: archive/web/src/archive/ArchiveApp.tsx
- Player-safe snapshot: archive/web/src/archive/archiveData.ts
- Styles: archive/web/src/archive/archive.css

향후 자동화가 충분히 안정되기 전까지는 PLAYER_SAFE snapshot을 명시적으로 생성해 배포한다.

## 8. 공개 URL 운영 원칙

공개 주소는 고정한다.

- Primary: `https://survival-diary-archive.netlify.app`

사용자는 이 URL 하나만 외부에 공유하면 된다.
배포가 반복되어도 공개 주소는 바꾸지 않는다.

사이트에는 가능하면 다음 publication metadata를 표시한다.

- Last updated
- Chronicle
- Worldline
- Season
- Canon / Archive revision

독자는 같은 URL에서 계속 최신 공개 기록을 본다.

## 9. Chat Room Independence

ChatGPT 채팅방은 Archive 저장단위가 아니다.

- 채팅방 = 플레이 surface
- Supabase = live runtime
- GitHub = durable canon
- transcript archive = 공개 원문
- Netlify Archive = publication surface

방을 옮기더라도 Archive continuity는 `worldline / chronicle / season / session_id / source` 기준으로 이어진다.

AFTERFALL의 세션 운영 규칙은:
`worldlines/AFTERFALL/PLAY_SESSION_PROTOCOL_V1.md`
를 따른다.

새 원문은 `survival_rpg.transcript_messages`에 먼저 append-only로 보관할 수
있다. 이 저장은 Archive publication이나 Canon 확정이 아니며, 실행 절차와
보안 경계는 `docs/RAW_ROLLING_CAPTURE_V1.md`를 따른다.

## 10. Transcript Publication Rule

Archive의 공개 원문은 VERIFIED_TRANSCRIPT만 원문으로 표시한다.

구분:
- VERIFIED_TRANSCRIPT
- VERIFIED_FRAGMENT
- CANON_SUMMARY
- MISSING_TRANSCRIPT
- SUPERSEDED

원문이 확보되지 않은 구간을 Canon 요약이나 기억으로 대사화해 원문처럼 게시하지 않는다.

`VERIFIED_FRAGMENT`는 출처에서 문자 그대로 확인한 공개 USER/GM 텍스트가
일부만 남은 경우다. Reader는 이를 완결 원문으로 승격하지 않고, 누락 구간과
확인 범위를 함께 표시한다.

## 11. Chronicle Scope

Archive 최상위 정보구조는 단일 AFTERFALL이 아니라 다음 확장을 허용한다.

```text
Survival Diary IP
→ Chronicle
→ Worldline
→ Season
→ Episode / Session
```

현재 활성 기록:
- Chronicle 03
- Worldline AFTERFALL
- Protagonist 서진우

다른 Chronicle/Worldline의 Canon을 섞지 않는다.

## 12. Public Novel / Chronicle hierarchy (V4)

Archive의 최상위 정보모델은 단일 Worldline이 아니다.

`Survival Diary IP → Chronicle → Worldline → Season → content record`

- 현재 활성 namespace는 `C03 AFTERFALL / 서진우`다.
- C01, C02를 포함한 다른 Chronicle은 확인된 공개 기록만 각각의 namespace에
  저장한다. 서로 다른 Chronicle의 Canon, 관계, 요약, transcript를 섞거나 빈
  구간을 보완하는 데 사용하지 않는다.
- 원문 reader record는 chronicleId, worldlineId, seasonId, source,
  sourceVerified를 가져야 한다.
- 공개 source-root 매핑은 고정한다: `seasons_v2/**`는 C01 한준호,
  `worldlines/STRONGHOLD/**`는 C02 박도현, `worldlines/AFTERFALL/**`는
  C03 서진우만 가리킨다. 이 경계를 넘는 entity edge와 transcript 연결은
  허용하지 않는다.
- `verified transcript`, `canon narrative summary`, `missing transcript`는
  데이터와 화면에서 모두 구분한다. 원문 미확보 구간은 정본·이벤트·기억을
  이용해 USER/GM 대사로 재구성하지 않는다.
- 공개 원문은 Raw Archive 정책의 금지 항목을 다시 포함하지 않으며, 정적
  Archive frontend는 Supabase에 직접 연결하지 않는다.
