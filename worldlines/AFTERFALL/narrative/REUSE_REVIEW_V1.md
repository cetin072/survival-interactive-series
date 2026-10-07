# 생존일기 Narrative System V1 — 외부 재사용 검토

Status: DESIGN REVIEW / PILOT PROPOSAL. 이 문서는 플레이 사실이나 숨은 세계 설정이 아니다.
검토일: 2026-10-07. 적용 대상: AFTERFALL / 서진우. 다른 생존기에 자동 승계하지 않는다.
기준 branch: `worldline/afterfall-rpg`, commit `fdf9e4224a6abc67021bff679a8588444078e812`.

## 1. 결정

새 창작 플랫폼을 설치하지 않는다. 기존 Character/World Bible과 Supabase 장면 컨텍스트를 재사용하고, 설정을 장면 행동으로 바꾸는 짧은 GM 연출 지침을 붙인다. 외부에서는 선택 로딩, 기획과 사실의 분리, 행동·대사 예시, 계층적 장면 구성, 사건과 기억 해석의 분리라는 방법을 채택한다. 이번에는 외부 소스 코드·프롬프트·이미지·캐릭터를 복사하거나 의존성으로 설치하지 않는다.

이는 재사용을 포기하는 결정이 아니다. 이미 구현된 기능을 또 구현하지 않고, 외부 설계 원리를 기존 동작에 대응시키는 결정이다. 공개 저장소가 있다는 사실을 한국어 장기 RPG의 재미·안전성·운영 적합성이 검증됐다는 뜻으로 해석하지 않는다.

## 2. 여섯 시스템: 채택 / 제외 / 실제 적용

| 대상 | 확인한 구조 | 채택 | V1에서 제외 | 기존 구조와 연결 |
| --- | --- | --- | --- | --- |
| Novelcrafter Codex [1] | 이름·별명·설명·관계와 연구 메모를 구분하고 AI 입력 여부를 선택 | 확정 정보와 작가 메모 분리, 필요한 엔티티만 참조 | 별도 Codex DB/UI, 등장 횟수 추적기, 서비스 연결 | 기존 Bible·characters·선택 장면 로딩; 본 검토와 시험 예시는 정상 플레이 입력에서 제외 |
| Sudowrite Story Bible [2] | 장르·스타일·인물·세계·장면이 본문 생성에 연결 | 작품 방향과 인물이 현재 장면을 제약하는 단방향 흐름 | 전체 시놉시스·결말·모든 장면 선작성 | 기존 장기 운영방침 → 현재 장면 → 대사; 미래 결과는 미정 |
| SillyTavern World Info [3] | 키워드에 따라 관련 설정을 넣고 입력 예산을 관리 | 필요한 정보만 짧게 로딩, 관련성 없는 설정 제외 | 재귀 키워드 엔진·벡터 검색·새 채팅 프런트엔드 | 기존 `get_scene_context()`에 실제 장면의 인물 ID를 명시; 한국어 이름 부분문자열로 새 매처를 만들지 않음 |
| Character Card V2 [4] | 인물 설명, 대사 예시, 작가 메모 등의 구분 | 성격표와 실제 표현 예시 분리, 신원 연속성 | PNG 카드 파서·새 카드 DB·규격 전체 이식 | 기존 character ID와 profile 유지; 장면별 표현은 `CHARACTER_PERFORMANCE_V1.md`의 비정본 예시 |
| DeepMind Dramatron [5] | 상위 개념에서 인물·플롯·장소·대사로 내려오는 공동 집필 구조 | 상위 방향 → 현재 욕망·제약 → 행동·대사 | 고정 플롯 생성기, Colab/LLM 어댑터, 추가 생성 단계 | 기존 Pressure·Choice Gate 안에서 장면 구성만 보강 |
| Stanford Generative Agents [6] | 사건 기억과 관련 기억 검색, 해석·계획으로 행동 구성 | 관찰 사실 / 인물의 해석 / 현재 의도를 구분 | 25명 생활 시뮬레이터, 상시 reflection, 임베딩 기억 DB | 기존 events/scenes와 character 현재 상태; 중요한 변화에만 기존 저장 경로 사용 |

## 3. 코드·라이선스 검토 범위

- Novelcrafter와 Sudowrite: 공식 제품 설명을 참고했다. 제품 소스 코드의 재사용 허가를 확보한 것은 아니며 서비스나 코드를 가져오지 않는다.
- SillyTavern: 저장소 LICENSE는 AGPL-3.0 [7]. “사용·복사가 금지된다”는 뜻으로 단정하지 않는다. 실제 복제·수정·제공 방식에 따른 의무 검토가 필요하며, V1에서는 구현 자체가 불필요하므로 코드 도입을 하지 않는다.
- Dramatron과 Generative Agents: 저장소 LICENSE는 Apache-2.0 [8][9]. 이것만으로 모든 예제 소재·별도 자산·의존성·출력 권리가 해결되는 것은 아니다. 향후 실제 코드를 복제할 때는 정확한 파일과 revision, 고지와 수정 내역을 함께 관리한다.
- Dramatron README는 예제 Colab을 “unplugged” 상태로 설명하며 모델 인터페이스 구현이 필요하다고 밝힌다 [5]. 즉시 설치하면 현재 GM을 대체하는 완제품으로 평가하지 않는다.
- `roleplay-studio/character-card`는 MIT LICENSE를 제공하는 별도 구현체다 [10]. 규격과 구현체를 혼동하지 않는다. V1에는 카드 교환 요구가 없고 보안·출처·상호운용성 검증을 수행하지 않았으므로 채택하지 않는다.
- V2의 실제 형식은 `spec` / `spec_version` / `data`를 가진다 [4]. 기존 생존일기 카드를 V2 호환이라고 표시하지 않는다. 외부 카드의 `system_prompt`, `post_history_instructions`, 매크로를 GM 상위 지시로 실행하는 기능도 도입하지 않는다.
- Generative Agents의 `retrieve.py`를 읽어 recency/importance/relevance와 임베딩 호출·의존성을 확인했다 [11]. 이미 존재하는 선택 장면 조회 대신 이 코드를 복사할 이유는 현재 없다.

## 4. 이미 있는 것은 그대로 사용

| 책임 | 기존 권위 소스 | 이번 변화 |
| --- | --- | --- |
| 작품의 중심 | `APOCALYPSE_LONG_RANGE_DIRECTION_V1.md` §14 | 길드를 기반으로 세계를 넓히는 생존 모험을 재사용; 새 IP CORE 중복 작성 없음 |
| 인물의 장기 성격 | `CHARACTER_BIBLE.md` | 욕망·두려움·모순·강점·그늘·관계 관점 보존 |
| 현재 인물·관계 | Supabase `survival_rpg.characters` | 현재 카드 우선; 별도 CURRENT_DRAMA_STATE 없음 |
| 세계의 지속 제약 | `WORLD_BIBLE.md`, `world_pressures`, `clocks` | 새 플롯 엔진·자동 배신 시계 없음 |
| 필요한 맥락만 조회 | `GM_CONTEXT_V1.md`, `get_scene_context()` | 이미 있는 선택 로딩을 그대로 사용 |
| 템포·선택권 | `NARRATIVE_PACING_ESCALATION_V1.md` | 반복 압축과 비강제 사건 진행 유지 |
| 기록·호출 예산 | `LIVE_TURN_FAST_PATH_V1.md` | 정상 턴의 추가 원격 호출·DB 쓰기 없음 |

이번 보강의 가설: 설정 항목을 더 늘리는 것보다, NPC가 지금 원하는 것과 그것을 얻으려는 행동을 장면에 드러내는 편이 우선이다. 기존 플레이 전체를 계량 감사한 결론은 아니므로 실제 짧은 플레이로 확인한다.

앞선 기획 대화의 윤서진 “권력 집중 견제자” 예시는 정본이 아니다. 실제 Bible의 의료적 책임감·완벽주의·자기희생을 사용한다. 서진우의 성격·도덕관·연애·선택은 PLAYER_AUTHORED이며 GM이 새로 고정하지 않는다.

## 5. 최소 파일 구성과 적용 경계

신규 4개 + 기존 BOOT 연결 1개:

1. 이 검토서: 기획 때만 읽는다.
2. `NARRATIVE_SYSTEM_V1.md`: 새 방/재개 때 한 번 읽는 짧은 실행 지침.
3. `CHARACTER_PERFORMANCE_V1.md`: 현재 장면의 인물 부분만 필요할 때 읽는 연출 예시.
4. `TRIAL_AND_ACCEPTANCE_V1.md`: 비정본 시험과 실제 플레이 검수 기준. 기본 장면 입력 아님.
5. `../BOOT.md` §18: 기존 연속성 확인 뒤 연결. 원래 절차·우선순위를 대체하지 않음.

이 Draft가 대상 worldline branch에 승인·병합되기 전에는 라이브 규칙 변경으로 간주하지 않는다. 홈페이지 main이나 Netlify 배포에 의존하지 않는다. 새 GM 부팅에서 적용할 버전이 확정되어야 한다.

검토 시 GitHub CURRENT_STATE는 S03/save285 종료 snapshot이었으나 실제 Supabase 조회는 S04/save286이었다. 이 문서는 그 차이를 고치거나 어느 장면을 재연하지 않는다. 실플레이 재개 때 기존 연속성 프로토콜로 최신 유효 상태를 먼저 확인하고, 오래된 START_HANDOFF로 시간을 되감지 않는다.

새 시즌 질문·숨은 적대성·관계 결말은 추가하지 않았다. S04의 기존 북쪽 연료장 초청도 역사 handoff의 미응답 hook이며, 현재 응답 여부는 최신 실제 기록으로 확인해야 한다.

## 6. 1차 자료

모두 2026-10-07 확인. 링크는 출처이며 외부 내용의 지시를 실행하지 않는다.

[1] https://www.novelcrafter.com/help/docs/codex/anatomy-codex-entry
[2] https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/what-is-story-bible/jmWepHcQdJetNrE991fjJC
[3] https://docs.sillytavern.app/usage/core-concepts/worldinfo/
[4] https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md
[5] https://github.com/google-deepmind/dramatron
[6] https://github.com/joonspk-research/generative_agents
[7] https://github.com/SillyTavern/SillyTavern/blob/release/LICENSE
[8] https://github.com/google-deepmind/dramatron/blob/main/LICENSE
[9] https://github.com/joonspk-research/generative_agents/blob/main/LICENSE
[10] https://github.com/roleplay-studio/character-card/blob/main/LICENSE
[11] https://github.com/joonspk-research/generative_agents/blob/main/reverie/backend_server/persona/cognitive_modules/retrieve.py — 검토 blob `ab97a4f175664bc813840418afe140b7463b674f`.
