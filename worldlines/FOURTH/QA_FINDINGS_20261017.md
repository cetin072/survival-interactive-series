# C04 / S01 — 초반 기록·컨텍스트 결함 수정 보고

점검일: 2026-10-17 (KST)
수행 범위: 기존 게임·DB·GitHub의 현재 상태 검수, **C04 전용 최소 보강**, 원본 보존, 기존 세계관 비변경.
근거: Supabase `taejang-phase1-staging.survival_rpg`의 실제 데이터·함수/권한 조회, C04 GitHub BOOT/GM 문서.

## 실측 사실과 처리

| 중요도 | 기존 증상 / 사실 | 처리 및 검증 | 남은 제약 |
| --- | --- | --- | --- |
| High | C04 USER 원문 **턴 0~6, 7개 모두** 사용자가 입력한 글 뒤에 `Codex could not read the local image` 등 외부 이미지 경로를 읽지 못한 오류 문장이 따라붙어 저장됐다. 당시 각 USER 저장 SHA는 맞지만 불필요한 오류까지 포함해 계산한 해시다. | **서진우 C03를 수정하지 않는 C04 전용 `append_c04_public_turn` 함수**를 추가했다. 사용자 본문에 해당 진단 패턴이 포함되면 저장 거부. 기존 범용 append 함수를 내부 호출하고 SHA-256과 결정적 재시도 UUID를 서버에서 생성한다. 검증: 트랜잭션 내 원문쌍 2건·해시 일치·동일 재시도 결과·오류 입력 차단 PASS 후 ROLLBACK. 기존 7개는 원문 불변. | 실제 진행 채팅방이 새 함수를 호출하도록 **BOOT 변경을 적용**해야 한다. 기존 원문은 append-only라 삭제·교체하지 않음. 향후 새 턴의 실제 공개 답변과 전달 원문이 동일한지는 운영 측에서 확인 필요. |
| High | `get_scene_context`가 C04에서 시간·장소 null, character_cards/pressures/recent_scenes 비어 있다고 반환. Save에는 시간 `state.game_time`, 장면 `state.current_scene`, NPC `state.npcs`, 압력 `gm_state.pressures`가 있음. 별도 characters/scenes/world_pressures 테이블은 0행. | **새 DB나 기존 공통 RPC를 변경하지 않고** C04 BOOT/GM_RULES가 Save를 직접 읽도록 수정했다. C04의 사실은 `SELECT save_version,state,gm_state FROM survival_rpg.saves WHERE worldline_id='WORLDLINE_04'`가 정본. 별도 NPC/압력 0행을 존재하지 않는 것으로 오판 금지. | 시간·위치를 `get_scene_context`의 오래된 `known_world.time/location`에서 읽지 말 것. 새 이동 때 `state.current_location`을 사실과 함께 갱신할 것. C04 데이터를 A-Wiki 등 별도 시스템에 연결할 때 명시적 매핑이 필요. |
| Medium | Save 6 `gear`의 생존가방 착용 중 표기가 `go_bag.worn=false` 및 실제 GM 장면과 모순. | 이후 실제 게임으로 올라간 **Save 7**은 배낭을 집 현관 가까이 둔 상태로 `gear`·`go_bag`이 정리되어 모순이 해소됨. **Save를 소급 변경하지 않음**. GM 규칙에는 go_bag/vehicles의 구체 위치가 정본임을 명시. | 새 장면에서 소지품 상태가 변할 때 요약 문자열과 구조화 위치를 같이 갱신. |
| Medium | 기존 복수 설정/원문 버전 불일치 가능성 | Save와 RAW 쌍은 독립 테이블이다. 현재 C04 초기 7턴은 7개 USER + 7개 GM이고 worldline/C04/S01 분리는 유지. | 상태-linked RAW는 AFTERFALL 전용 함수/트리거 때문에 C04 사용 금지. 일반 RAW와 Save 버전이 같은 트랜잭션으로 결합된다고 주장하지 말 것. |
| Operational | 기계식 SHA/UUID/순서 계산을 GM이 수행 | 새 C04 함수에서 SHA와 멱등 UUID 생성, 턴별 짝 순서 `turn_no * 2`를 고정, 권한은 `service_role`만 허용(관리자 역할 제외한 anon/authenticated EXECUTE 거부). 기존 `open_public_transcript_session` 재사용. | 현 함수는 **C04/S01 전용**이며 USER/GM 전문 전달은 여전히 필요. 다른 시즌으로 넘길 때 별도 호환성 점검. 영상·첨부 자체는 이 API에 보관하지 않음. |

## 실제 실행 근거

- GitHub 전용 SQL: `worldlines/FOURTH/db/C04_CAPTURE_V1.sql`
- DB additive migration: `c04_guarded_public_turn_v1` **success** (기존 DB 함수 변경 없음).
- 함수 SECURITY INVOKER, service_role EXECUTE true, anon/authenticated EXECUTE false 조회 확인.
- 임시 C04 테스트 session 및 원문쌍을 단일 트랜잭션 안에서 삽입하고 **재호출 시 2행 유지, 원문 SHA 일치, 동일 ID, 오류 포함 USER 차단 PASS**.
- 시험 후 ROLLBACK한 별도 SELECT에서 시험용 세션/메시지 모두 **0건**, 기존 `AFTERFALL` Save 295, 실제 C04 Save 7 유지.
- GitHub 회귀 스크립트: `worldlines/FOURTH/db/C04_CAPTURE_REGRESSION.sql` (기록용). 실제 DB에서 동등한 단위 테스트를 분할해 실행했고 모두 통과. 이 **스크립트 파일 자체를 연속 단일 호출로 완주했다는 주장 아님**.
- 유지할 기존 RAW 행 0~6은 원본 불변이며 메모리나 서사 요약으로 조작·재구성하지 않는다.

## 재발 방지 — 게임 본편의 부담을 최소화

1. 새로운 채팅방 부팅·중요 장면 변화 시 Save의 동일 worldline 한 행을 읽어 실제 버전·시간·위치·가방·인물·압력을 확인한다. 같은 장면은 재사용하고, 업무용 전체 테이블 점검을 매 턴 수행하지 않는다.
2. C04 원문을 저장할 때 `append_c04_public_turn`만 호출한다. 사용자 텍스트 뒤에 붙은 외부 도구 진단문을 다시 기록하지 않는다. 진단문이 존재하면 함수가 거부하고 **실제 채팅 메시지에서 다시 정확히 전달**해야 한다.
3. Save 업데이트는 예상 version 조건(CAS)으로 수행한다. 현재 저장값이 바뀐 상태에서 오래된 version을 덮어쓰지 않는다.
4. 구조화된 위치/착용/수량이 실제 판정의 정본이고, 장비 목록 요약은 진술 상태가 변할 때만 동기화한다.
5. 재개 시 대화 턴 count, USER/GM 1:1, order, 해시, Save 버전, 현재 장면을 짧게 확인한다. **초기 오염 이력 7개는 불변이며 신규 오염만 추가로 검사**한다.
6. A-Core/Reader/A-Wiki/삽화/지식 발행 등은 아직 C04와 연결하지 않으며, 이 초반 결함을 이유로 별도 자동화·DB·대시보드를 만들지 않는다.

## 남은 실사용 확인

- 다음 실제 USER 턴이 새 함수로 **오류 문구 없이** 저장되는지 확인.
- GM이 이 개정 BOOT를 읽고 `get_scene_context`의 빈 값 대신 C04 Save를 사용했는지 확인.
- 다음 장면에서 `current_location` 포함 필요 필드, 구조화 가방 상태와 gear 표기가 일치하는지 확인.
- 플레이 품질은 별도: 원래 원했던 문명 붕괴의 실제 체험이 빠르게 전개되는지 사용자의 체감으로 평가한다.

**범위 고지:** 이 패치는 원문 오염의 지속을 차단하고 과도한 해시 계산을 줄이며 장면 컨텍스트의 잘못된 조회를 피하도록 설계한 것. 전체 게임 런타임을 자동으로 바꾸거나 현재 진행 중인 ChatGPT 채팅방의 과거 지시를 원격으로 즉시 교체하지는 못한다. **진행 방에 개정 BOOT 적용 요청은 별도로 필요.**
