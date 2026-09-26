# AFTERFALL — Season 2 Current Checkpoint

Status: AUTHORITATIVE CURRENT CONTINUATION OVERLAY
Game time: 2027-02-24 19:00
Runtime source of truth: Supabase `survival_rpg.saves` / AFTERFALL

이 문서는 새 채팅이 최신 공개 플레이 연속성에서 재개되도록 하는 현재 checkpoint다. 수치·부상·일시 상태·장면이 충돌하면 Supabase hot Runtime과 `get_scene_context`가 우선한다. 미래 사건, 숨겨진 의도, 미공개 손실을 보충하지 않는다.

## 1. Identity

- IP: 《생존일기》
- Chronicle: 03
- Worldline: AFTERFALL
- Protagonist: 서진우, 32세, 응급실 간호사
- Season: 2 ACTIVE
- World phase: FRACTURE

## 2. Current resume point

**2027-02-24 19:00.**

- Runtime save version: 250
- Current scene: `S02_RESIDENCE_VISIBILITY_AND_PRIVATE_CONTINGENCY`
- Active arc: `WINTER_LONG_ARC_V2`
- 현재 장면의 다음 판단·대사·세부 인물 상태는 이 문서로 추측하지 않고, consistency 확인 뒤 현재 장면 관련 인물만 지정한 `get_scene_context`에서 읽는다.

## 3. Verified operating structure

현재 공개 플레이에서 확정된 운영 구조는 다섯 거점이다.

1. **직업훈련원** — 핵심 4인의 주거 거점이다. 건물의 존재는 숨기지 않지만 거주자 신원과 생활 패턴은 제한한다.
2. **스포츠 복합센터** — 길드·작업·대형 교환·차량·물류·창고·사무와 주간 장터를 담당하는 중심 허브다. 목재 보일러가 설치되어 있다.
3. **기존 세 번째 거점** — 소수 검증 인력의 공개 전방 관문·완충 거점이다. 첫 접점, 개별 사례, 짧은 대기·체류, 기초 분류, 저가치 물류와 정보 기능을 맡는다.
4. **북서 훈련센터** — 7인 연합의 공동 은닉 fallback bunker다. 공동 비축과 각 집단의 봉인 보관을 분리하며, 시설은 48시간, 집단은 96시간 주기로 확인한다.
5. **아그리테크** — 생산·물·종자 핵심 거점이다.

서진우와 장태훈만 기존 세 번째 거점에 비공개 contingency 층을 유지한다. 이 층의 역할은 조기 경보, 통신, 후퇴 유도와 완충이며 공개 군사기지·민병대·공격 조직이 아니다.

## 4. Continuation guard

- 새 room boot는 `CURRENT_STATE.json`을 읽고, 그 파일의 `current_checkpoint`가 지정한 이 checkpoint만 이어 읽는다.
- `CURRENT_CHECKPOINT.md`와 이전 dated checkpoint는 역사 snapshot으로 보존한다. 현재 pointer가 아닌 파일을 hot context로 섞지 않는다.
- `check_runtime_consistency('AFTERFALL')` 후 Live RAW capture session을 개설·복구하고, 현재 장면 관련 인물만 지정한 `get_scene_context`로 시작한다.
- normal turn에는 GitHub·Archive·Netlify·전체 Save/Events/RAW를 읽지 않는다. 의미 있는 Runtime delta만 저장하고, exact USER→GM을 atomic pair로 저장한 뒤 출력한다.
- C01/C02 또는 S01 복원되지 않은 opening을 이 checkpoint에 섞거나 추정하지 않는다.
