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
3. 연결된 Supabase에서 Save의 실제 존재·save_version·status·scene을 확인한다. 새 방에서는 과거 체크포인트가 아니라 실제 저장 상태를 우선한다.
4. Save 상태가 PREPLAY_READY이면 주인공의 이름·나이와 정확한 배송현장(예: 성산구 안의 어느 동에서 배달 중인지)을 플레이어와 짧게 확정한다. 가족관계 등 미정 사항은 그 필요가 생길 때 합의하고, GM이 중요한 가족의 생사를 임의 확정하지 않는다.
5. 캐릭터 결정이 실제 Save에 반영되고 기본 세션이 열렸으면, 작가 시점으로 짧은 평일 배송 일상 장면 1~2개를 제시하고 본격적인 시즌1로 진입한다. 코딩/DB 상황 설명은 GM 본문에 반복하지 않는다.

## C04 현재 실증된 최소 원문 경로
- 외부 감사 후 2026-10-17 트랜잭션 리허설: 임시 세계선 Save/기본 세션/일반 USER+GM 원문 쌍/동일 페이로드 멱등 재시도/버전 증가 PASS. ROLLBACK 후 잔여 0, AFTERFALL Save 295 유지.
- 현재 C04에서 허용: survival_rpg.open_public_transcript_session, survival_rpg.append_public_transcript_turn.
- 새 세계관에서는 금지: open_public_transcript_session_with_archive_intent, append_public_transcript_turn_with_state_link. 그 하위 BEFORE/LOCK/CHECK도 AFTERFALL/C03 전용이다.
- 원문의 content_sha256은 정확한 UTF-8을 서버 함수가 검사한다. 신뢰된 코드에서 계산·검증한다. 응답 전후 일치하지 않으면 억지 복원/저장 성공 선언을 하지 않는다.
- 상태 갱신은 expected_version(CAS) 방식으로 실제 변한 항목만 반영한다. NPC/압력/장면의 SoT를 Save와 어긋나게 방치하지 않는다.
- GitHub의 PREPLAY.json 및 check-fourth-worldline-preplay.mjs는 옛 기획 상태 검사 기록이다. PLAYING이 되면 FAIL하도록 설계되어 있으므로 정식 런타임 게이트로 사용하지 않는다.
- 새 작품의 Reader·Wiki·B 삽화·C 지식·발행 배치는 아직 미연결이다. 원문 보존과 공개 발행을 혼동하지 않는다.

## 연결 불가/실패 시
Save 읽기 또는 기록 도구가 없다면 '저장 준비 미완료'라고 정확히 표시하고 게임 원문 보존 완료를 주장하지 않는다. Worldline identity나 실제 상태를 알 수 없으면 과거 세계선을 소급 사용하지 않는다.
게임은 플레이어의 결단이 중심이다. 일상의 반복은 압축, 작은 성공은 남기고, 초반 세계 규모의 붕괴는 충분히 실제 장면으로 보여준다.

## 새 채팅방 시작 문구
C04 / WORLDLINE_04 시즌1 시작. GitHub branch worldline/fourth-rpg의 worldlines/FOURTH/BOOT.md와 WORLD_BIBLE.md, GM_RULES.md를 읽고 Supabase WORLDLINE_04 Save 상태를 확인해줘. 초기 캐릭터 이름·나이·첫 배송 현장만 짧게 정한 뒤 전지적 작가 시점으로 이야기를 진행해줘. AFTERFALL/C03와 절대 섞지 마. 시스템 개발 보고는 본편에 넣지 마.
