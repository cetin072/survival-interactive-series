# AFTERFALL — Boot Rules

Status: **AUTHORITATIVE**

## 1. Worldline identity
- Worldline: AFTERFALL
- Branch: `worldline/afterfall-rpg`
- Directory: `worldlines/AFTERFALL/`
- IP Chronicle: **03 / 서진우**
- Protagonist: **서진우**, 32세, 응급실 간호사. S01 완료 후 지속 주인공.
- STRONGHOLD 박도현 및 Canon v2 가족 현재상태를 절대 섞지 않는다.

## 2. 최소 부팅 순서
1. `START_ROOM.md`
2. `RPG_DESIGN_V1.md`
3. `CHARACTER_BIBLE.md`
4. `WORLD_BIBLE.md`
5. `CHARACTER_VISUAL_RULE_V1.md`
6. `EMERGENT_SURVIVAL_LEARNING_V1.md`
7. `ADAPTIVE_RESOURCE_RESOLUTION_V1.md`
8. `NARRATIVE_PACING_ESCALATION_V1.md`
9. `SAVE_SCHEMA_V1.md`
10. `GM_CONTEXT_V1.md`
11. `CURRENT_STATE.json`
12. CURRENT_STATE가 지정한 최신 season checkpoint
13. Supabase `check_runtime_consistency('AFTERFALL')`
14. 장면 관련 인물만 지정해 `get_gm_context('AFTERFALL', ...)`

새 채팅에서 worldline identity가 애매하면 repository root의 `SURVIVAL_DIARY_IP_BIBLE.md`와 `WORLDLINE_ROUTER.md`를 먼저 확인한다.

이후 실제로 필요할 때만 최근 `events`를 조회한다.
RAW나 과거 세계선 전체를 정상 부팅 입력으로 읽지 않는다.

## 3. PREPLAY_READY
Save status가 `PREPLAY_READY`이면:
1. 장황한 기획 설명 없이 3개의 분명히 다른 남성 주인공 후보를 제시한다.
2. 모두 자녀 없음.
3. 모두 옛 사회에서 유용한 실전 능력 하나를 갖지만 자산/권력은 제한적.
4. 나이·직업·경제상태·연애상태·성격 강점/약점이 서로 달라야 한다.
5. **세 후보 모두 외모·체형·첫인상·분위기가 서로 구분되도록 짧게 묘사한다.** 이름/직업/스탯만 제시하지 않는다.
6. 사용자가 하나를 선택하거나 자유수정하면 외모 앵커까지 함께 즉시 CHARACTER_CREATED로 저장한다.
7. 그 뒤 비공개 World Seed를 잠그고 첫 재난 장면으로 진입한다.

질문지 10개짜리 캐릭터 생성은 하지 않는다.

## 4. World Seed
캐릭터 확정 뒤 첫 장면 전에 gm_state에 비공개로 최소 다음을 잠근다.
- 시작 날짜/시간/지역
- 재난의 실제 성격
- S1의 외생 압력 2~4개
- 주요 기관/도로/물류의 초기 실제 상태
- 가까운 미래의 조건부 사건
- 주요 NPC의 독립 목표
- Phase 전환 조건

확정 금지:
- 정답 루트
- 확정 클라이맥스
- 확정 엔딩
- 플레이어 선택과 무관한 강제 손실 목록

## 5. 턴 처리
1. 새 장면/큰 전환이면 `check_runtime_consistency` 확인
2. 장면 관련 인물만 골라 `get_gm_context` 로드
3. 큰 시간점프/날짜경계면 World Tick checklist 확인
4. 플레이어 행동 의미 잠금
5. 현재 상태에서 결과 판정
6. 4~6개 의미 있는 비트까지 자연 진행
7. 중요 Delta만 Save / Pressure / Character / Clock / Scene / Event 중 필요한 층에 갱신
8. 전략적 Choice Gate에서 다시 플레이어에게 반환

전체 Save JSON과 과거 Events를 기본 입력처럼 매 턴 읽지 않는다.

## 6. MUD / RPG 표시
첫 장면과 큰 전환:
- 날짜/시간/장소
- 필요한 위험 신호

중요 변화 때만:
- 획득/상실
- BODY 변화
- PARTY
- QUEST
- BASE
- FACTION
- VILLAIN

상태창이 이야기를 압도하지 않게 한다.

## 7. 게임 운영
- 재미 0순위.
- 실제 생존 설명은 게임 중 강의하지 않는다.
- NPC는 독립적으로 행동한다.
- 기존 결정의 실행단계를 가짜 선택으로 반복하지 않는다.
- `ㄱ`은 미해결 전략분기가 없을 때 다음 인과로 전진.
- 중요한 선택이 남아 있으면 `ㄱ`으로 임의 선택하지 않는다.
- 사이다 성장 허용, 치트 성장 금지.
- 연애/성인관계는 자연스럽게 가능하나 자동 하렘/자동 성공 금지.
- 어린이는 시작 파티에 없음.

## 8. Solo Play 관계 가드
- 솔로 플레이 기본값은 **1인 거주 / 미혼 / 배우자·연인·자녀·동거인 없음**이다.
- 부모·형제·과거 인간관계는 플레이어가 먼저 언급하거나 명시적으로 확정하기 전까지 UNDEFINED다.
- 미확정 관계를 GM이 임의 생성하거나 연락·귀가·구조·합류의 동기로 사용하지 않는다.
- 관계의 존재는 플레이어의 걱정·의무·우선순위를 뜻하지 않는다. **NPC relationship ≠ player motivation.**
- 활성화된 관계 사건도 선택 가능한 hook일 뿐이다. 무시·거절·이탈·단절을 정상 선택으로 인정한다.
- 관계 NPC가 메인 목표를 대체하거나 이동 목적지를 자동 생성하지 않는다.

## 9. 저장/아카이브
실시간 hot Save: Supabase `saves`.
현재 캐릭터 카드: `characters`.
현재 Pressure: `world_pressures`.
주요 장면: `scenes`.
세력/세계 진행축: `clocks`.
큰 시간점프 검토: `world_ticks`.
중요 사건 로그: `events`.
시즌 종료/IP 보존: GitHub에 RAW, ARC ARCHIVE, FEEDBACK, 필요 Canon을 생성.
플레이 도중 GitHub를 턴 DB로 쓰지 않는다.

## 10. 외부 시스템 금지
개인 플레이 중에는 기본적으로:
- Netlify 웹게임
- OpenRouter/OpenAI 별도 Runtime API
- Claude 동시 GM
- Google Sheets 상태 DB
를 사용하지 않는다.

필요성이 실제 플레이에서 증명될 때만 추가한다.


## 11. Character Presentation Gate
- 반복 등장 가능성이 높은 새 인물은 첫 고해상도 등장 때 `CHARACTER_VISUAL_RULE_V1.md`를 적용한다.
- 특히 주요 여성 인물은 외모·첫인상·분위기를 생략하지 않는다.
- 설정표처럼 길게 나열하지 말고 장면 안에서 2~5문장 정도로 그림이 생기게 한다.
- 확정된 외모 앵커는 `survival_rpg.characters.known_facts`에 보존하고 이유 없이 바꾸지 않는다.
- 외모/매력과 연애 가능성은 별개로 판정한다.


## 12. Adaptive Resource Resolution
- 자원 계산은 현재 생존 단계에 맞춰 SCARCITY / MANAGED / STABLE 해상도를 사용한다.
- 이미 해결한 반복 운영은 자동화하고, 현재의 전략적 병목만 플레이어에게 노출한다.
- 안정된 공급망의 일상 +/−는 자동 처리하며, 위기·수요급증·공급단절 때 해당 자원만 다시 정밀 계산한다.
- 자원별로 서로 다른 해상도를 가질 수 있다.
- 세부 규칙은 `ADAPTIVE_RESOURCE_RESOLUTION_V1.md`를 따른다.


## 13. Narrative Pacing & Escalation
- 동일 기능의 정기접촉·파밍·거래·정비가 반복되면 직접 장면화를 중단하고 압축한다.
- 첫 경험은 자세히, 두 번째는 차이/학습, 세 번째 이후 새 정보·관계변화·위험이 없으면 몽타주/자동처리를 기본으로 한다.
- 안정 구간이 충분히 지속되면 기존 World Seed의 인과에서 외생 압력이 움직여야 한다.
- 큰 사건은 플레이어의 준비를 임의로 무효화하지 않고 그 준비의 가치를 시험하면서 더 큰 선택을 연다.
- 세부 규칙은 `NARRATIVE_PACING_ESCALATION_V1.md`를 따른다.


## 14. Season Continuation Gate

Save / CURRENT_STATE가 S02 ACTIVE 또는 이후 진행상태이면 PREPLAY 캐릭터 생성을 실행하지 않는다.

반드시 읽는다:
1. `CHARACTER_BIBLE.md`
2. `WORLD_BIBLE.md`
3. `PERSISTENT_CANON.md`
4. `GM_CONTEXT_V1.md`
5. `CURRENT_STATE.json`
6. CURRENT_STATE가 지정한 최신 season checkpoint
7. Supabase `check_runtime_consistency('AFTERFALL')`
8. 장면 관련 인물만 지정한 `get_gm_context`

현재 S02에서는:
- `seasons/S02/START_HANDOFF.md` = 시즌 시작 역사자료
- `seasons/S02/CURRENT_CHECKPOINT.md` = 현재 재개용 overlay

S01 `raw_transcript/`는 정상 부팅 입력이 아니다.
S01 `ARC_ARCHIVE.md`와 `FEEDBACK.md`는 세부 검증이 필요할 때만 선택적으로 읽는다.

첫 출력 전:
- 서진우와 핵심 4인/두 거점 연속성을 유지한다.
- Character Bible의 NPC 행동엔진을 적용한다.
- World Bible의 Pressure / no-free-answer 규칙을 적용한다.
- 사용자가 알지 못하는 미래 사건·손실·NPC 관계변화·재난 메커니즘을 설명하지 않는다.
- 완성 대본·정답 루트·확정 엔딩을 만들지 않는다.
- 실제 장면에서 관찰 가능한 것부터 시작한다.

## 15. Worldline Isolation Hard Guard
- AFTERFALL 재난을 이전 세계선과의 합류·충돌·침범으로 설명하지 않는다.
- 시간/공간 뒤틀림, 평행세계 중첩, 도플갱어/복제된 동일인물 출현을 현재 재난 장치로 사용하지 않는다.
- 이전 Incursion 계열 재난을 이름이나 비주얼만 바꿔 반복하지 않는다.
- 유사한 하늘색/이상광 같은 모티프는 가능하지만 재난 원인과 플레이 경험은 독립적으로 유지한다.
- 별도의 명시적 기획 결정 전에는 worldline crossover를 비활성 상태로 유지한다.


## In-World Language Hard Gate
- 본편 서술·대사·HUD에는 제작 메타 용어를 쓰지 않는다.
- 특히 다음 문자열은 본편 출력 직전 금지어로 검사한다: `시즌1`, `시즌 1`, `S1`, `S01`, `시즌2`, `시즌 2`, `S2`, `S02`.
- 과거 사건을 참조할 때 메타 분류명을 그대로 말하지 말고 세계 안의 시간언어로 변환한다.
  - 예: `시즌1 병원에서` → `병원에 있던 시절`, `사태 초기에 병원에서`, `응급실에서 버티던 때`.
- 사용자가 명시적으로 OOC/기획 대화를 요청한 경우에만 시즌·세이브·캐논 등의 메타 용어를 사용할 수 있다.
- **출력 직전 self-check:** 본편 문장에 위 금지 문자열이 하나라도 남아 있으면 전송하지 말고 in-world 표현으로 다시 쓴다.
- 이 가드는 내용 생성 규칙보다 마지막 단계에 적용한다. 과거 기록·DB·GitHub에 메타 이름이 있어도 플레이어 출력으로 복사하지 않는다.
