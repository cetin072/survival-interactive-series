# 생존일기 ARCHIVE Sync Policy v1

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

다음 세 경우에 Archive를 갱신한다.

1. 중요한 사실이 Canon으로 확정될 때
2. 주요 에피소드가 종료될 때
3. 시즌이 종료될 때

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
2. 새 Canon 사건/관계/장소 변화 추출
3. PLAYER_SAFE 여부 판정
4. archiveData snapshot 갱신
5. GitHub 반영
6. Netlify 배포 확인

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
