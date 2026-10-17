# WORLDLINE_04 / C04 — 독립 시즌1 BOOT

Branch: worldline/fourth-rpg
Chronicle: C04
Worldline: WORLDLINE_04
Season: S01
Runtime SoT: Supabase taejang-phase1-staging / survival_rpg.saves(worldline_id='WORLDLINE_04')
기획 감사본: docs/FOURTH_WORLDLINE_AUDIT_RESPONSE_V1.md (GM 평시 입력이 아님)

## 일반 ChatGPT 프로젝트 채팅에서 최초 시작하기
1. 세계선 정체성을 WORLDLINE_04/C04/S01로 고정한다. 다른 작품 AFTERFALL/C03나 STRONGHOLD/C02를 대체자료로 쓰지 않는다.
2. 이 폴더의 WORLD_BIBLE.md와 GM_RULES.md를 새 방 첫 진입에 한 번 읽는다. 기존 모든 시즌·감사·자동화 문서를 기본 입력으로 불러오지 않는다.
3. 연결된 Supabase에서 `SELECT save_version, state, gm_state FROM survival_rpg.saves WHERE worldline_id='WORLDLINE_04'`로 현재 상태를 **직접** 읽는다. 기준 시간은 `state.game_time`, 장면은 `state.current_scene`, NPC는 `state.npcs`, 활성 압력은 `gm_state.pressures`, 소지품·가방·차량은 `state`가 정본이다. 기존 `get_scene_context`는 C04에서 이전 JSON 경로/별도 테이블을 읽으므로 시간·장소·인물·압력이 비어 있어도 *없다고 단정 금지*. Save 버전은 읽은 실제 값을 사용한다.
4. Save 상태가 PREPLAY_READY이면 주인공의 이름·나이와 정확한 배송현장(예: 성산구 안의 어느 동에서 배달 중인지)을 플레이어와 짧게 확정한다. 가족관계 등 미정 사항은 그 필요가 생길 때 합의하고, GM이 중요한 가족의 생사를 임의 확정하지 않는다.
5. 캐릭터 결정이 실제 Save에 반영되고 기본 세션이 열렸으면, 작가 시점으로 짧은 평일 배송 일상 장면 1~2개를 제시하고 본격적인 시즌1로 진입한다. 코딩/DB 상황 설명은 GM 본문에 반복하지 않는다.

## C04 현재 실증된 최소 원문 경로
- 외부 감사 후 2026-10-17 트랜잭션 리허설: 임시 세계선 Save/기본 세션/일반 USER+GM 원문 쌍/동일 페이로드 멱등 재시도/버전 증가 PASS. ROLLBACK 후 잔여 0, AFTERFALL Save 295 유지.
- 세션은 기존 범용 `survival_rpg.open_public_transcript_session`으로 연다. 일반 턴 원문 저장은 2026-10-17 새로 적용·검증된 **`survival_rpg.append_c04_public_turn`**을 우선 사용한다. 이 C04 전용 얇은 함수는 고정 식별자·UTF-8 SHA·결정적 멱등 UUID·메시지 순서를 계산하고, USER 입력에 검출 가능한 Codex 도구 오류 문구가 있으면 **거부**한다. `append_public_transcript_turn`을 내부에서 재사용한다. 원본 내용·GM 최종 공개 답변을 정확히 전달할 것.
- 새 세계관에서는 금지: open_public_transcript_session_with_archive_intent, append_public_transcript_turn_with_state_link. 그 하위 BEFORE/LOCK/CHECK도 AFTERFALL/C03 전용이다.
- `append_c04_public_turn(session_id, turn_no, user_content, gm_content, user_save_version, gm_save_version, game_time, scene_id, source_type)`를 사용한다. **`turn_no`는 실제 세션 기록을 확인한 뒤 매 새 턴 증가**시키고, 재시도는 같은 session/turn/원문을 그대로 쓴다. 도구·첨부 이미지 읽기 실패의 진단 메시지는 사용자 발언이 아니다. USER 원문에 해당 문구가 있으면 먼저 입력 출처를 바로잡고 저장을 재시도한다. 임의로 사용자 발언을 만들거나 이전 원문을 수정하지 않는다. 응답 출력과 실제 DB 보관 본문이 달라지면 저장 성공이라고 말하지 않는다.
- 상태 갱신은 `saves`의 expected_version(CAS) 조건으로 실제 변한 항목만 반영한다. C04 초반에는 `state.npcs` / `gm_state.pressures` / `state.game_time` / `state.current_scene`에서 읽는다. `state.known_world.time/location`이나 별도 NPC/Pressure 테이블을 정본으로 혼동하지 않는다. 새 장면으로 이동할 때 `state.current_location`을 기존 사실과 일치하도록 기록한다. 차량·가방 등 여러 표시가 있을 때는 최신 `state.vehicles`, `state.go_bag`가 상세 위치의 정본이고 `state.gear`의 오래된 문구는 장면 갱신 때만 정정한다. 모순 발견 시 저장값을 확인하고 임의 창작 없이 최소 보정한다.
- GitHub의 PREPLAY.json 및 check-fourth-worldline-preplay.mjs는 옛 기획 상태 검사 기록이다. PLAYING이 되면 FAIL하도록 설계되어 있으므로 정식 런타임 게이트로 사용하지 않는다.
- 새 작품의 Reader·Wiki·B 삽화·C 지식·발행 배치는 아직 미연결이다. 원문 보존과 공개 발행을 혼동하지 않는다.
- **C04 독자용 편집:** 플레이 RAW는 정확한 원문으로 보존한다. 기존 장면의 반복 해설·단역 과잉 묘사·선택 UI는 `worldlines/FOURTH/editorial/`에 별도의 `EDITED_NARRATIVE` 초안으로 수정하며, 사람 검수 전에는 공개하지 않는다. 향후 Reader/생존지식 사이트의 재편집·버전 갱신은 `editorial/EDITORIAL_PUBLICATION_POLICY_V1.md`를 따른다. 편집 작업은 일반 턴을 막지 않는다.

## C04 초기 QA 인계 (2026-10-17)
- 초기 저장된 USER 턴 0~6에 도구 이미지 읽기 실패 진단문이 섞인 사실 확인. **기존 원문은 append-only이므로 수정·삭제하지 않는다.** 새 C04 전용 저장 함수는 같은 패턴의 오염 입력을 거부한다. 이후 입력이 실제 사용자 발언만 포함하는지 확인한다.
- Save 6에서 `gear`의 착용 중 문구와 `go_bag.worn=false`가 충돌했으나, Save 7에서는 집 현관 근처/미착용으로 서로 일치하므로 과거 값으로 되돌리지 않는다.
- Save 기반 NPC/압력과 기존 별도 테이블은 현재 서로 다르다. 새 전용 스키마를 만들지 않고 C04에서는 Save를 읽는다. 자세한 기록은 `worldlines/FOURTH/QA_FINDINGS_20261017.md` 참고.

## 연결 불가/실패 시
Save 읽기 또는 기록 도구가 없다면 '저장 준비 미완료'라고 정확히 표시하고 게임 원문 보존 완료를 주장하지 않는다. Worldline identity나 실제 상태를 알 수 없으면 과거 세계선을 소급 사용하지 않는다.
게임은 플레이어의 결단이 중심이다. 일상의 반복은 압축, 작은 성공은 남기고, 초반 세계 규모의 붕괴는 충분히 실제 장면으로 보여준다.

## 새 채팅방 시작 문구
C04 / WORLDLINE_04 시즌1 시작. GitHub branch worldline/fourth-rpg의 worldlines/FOURTH/BOOT.md와 WORLD_BIBLE.md, GM_RULES.md를 읽고 Supabase WORLDLINE_04 Save 상태를 확인해줘. 초기 캐릭터 이름·나이·첫 배송 현장만 짧게 정한 뒤 전지적 작가 시점으로 이야기를 진행해줘. AFTERFALL/C03와 절대 섞지 마. 시스템 개발 보고는 본편에 넣지 마.
