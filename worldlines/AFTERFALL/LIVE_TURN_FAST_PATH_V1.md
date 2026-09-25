# AFTERFALL — Live Turn Fast Path v1

Status: **AUTHORITATIVE LIVE PLAY OPERATING RULE**

목적은 TURN을 덜 보존하는 것이 아니라, 플레이어가 기다리는 평범한
턴에서 필요한 현재 장면만 읽고 정확한 USER→GM 원문 쌍을 한 번에 남기는
것이다.

## Normal turn

1. 같은 healthy room/session에서는 `session_id`를 재사용한다. 마지막으로
   acknowledgement된 `message_order`를 보관해 다음 order를 계산하되, reconnect,
   acknowledgement 불명확, retry 또는 corruption 의심 때에는 실제 DB를 다시 읽는다.
   새 gameplay turn마다 `turn_no`는 정상적으로 증가한다.
2. 새 gameplay turn마다 새 USER idempotency UUID와 별개의 새 GM idempotency UUID를
   만든다. **같은 turn의 retry에만** 정확히 같은 두 UUID, USER/GM text, hashes와
   message order를 재사용한다. 과거 turn의 UUID를 새 turn에 재사용하지 않는다.
3. 같은 scene의 안정된 컨텍스트를 이미 가지고 있으면 재조립하지 않는다.
   새 장면이거나 등장인물·큰 Pressure·의미 있는 runtime delta가 바뀐 경우에만
   장면 관련 인물만 지정해 `get_scene_context()`를 읽는다.
4. GM이 현재 장면을 판정하고 최종 공개 답변을 확정한다.
5. player/body, 핵심 자원·장비, 파티·거점·차량·세력·주요 관계, 현재 scene,
   durable quest, 중요한 Pressure/Clock 중 실제로 변한 항목만 갱신한다.
6. 정확한 USER input과 **확정된 동일한 GM output**을
   `append_public_transcript_turn(...)` 한 번으로 원자 저장한다.
7. 해당 GM 문자열을 플레이어에게 출력한다.

평범한 대사, 몇 분 이동, 반복 정비, 자동 상쇄되는 일상소비, 상태를 바꾸지
않는 정보 확인은 Save/Scene/Event/Pressure/Clock을 전부 갱신하지 않는다.

## Required remote work

| 상황 | 기본 호출 |
| --- | --- |
| 새 scene 또는 안정 컨텍스트가 없을 때 | 관련 인물만 포함한 `get_scene_context()` 1회 |
| meaningful runtime delta가 있을 때 | 필요한 runtime mutation 0~1회 |
| 정상 USER→GM turn | `append_public_transcript_turn(...)` 1회 |

세션이 정상 OPEN이고 마지막 append acknowledgement가 명확하면 session discovery와
last-message-order 조회를 반복하지 않는다. reconnect, room 이동, acknowledgement
불명확, idempotency retry, session corruption 의심 때에는 실제 DB를 다시 확인한다.

## Heavy path only

다음에서만 `check_runtime_consistency('AFTERFALL')`, world tick 또는 깊은
history 조회를 추가한다.

- 새 ChatGPT room boot
- 새 scene 또는 큰 scene transition
- 날짜 경계·큰 시간점프·AUTO 압축
- 중요한 runtime mutation 직후
- 저장/응답 acknowledgement 오류 또는 continuity 충돌 의심

`get_gm_context()`는 감사·디버깅·기획 점검 전용이다. 본편 장면 생성,
전체 Character/Events/Save 조회, GitHub, Archive publication, Reader build,
Netlify deploy는 normal turn path에 넣지 않는다.

## RAW safety is unchanged

- USER/GM pair는 같은 database statement에서 인접 order로 commit한다.
- exact UTF-8 SHA-256, stable idempotency keys, session ordering, rollback와
  save-before-emit을 유지한다.
- append acknowledgement가 모호하면 출력 전에 재시도/확인한다. 실패한 반쪽을
  기억이나 Canon으로 복구하지 않는다.

## Visual backfill is not a sweep

현재 scene에 이미 로드된 반복 인물만 본다. `appearance_anchor`가 없고
의미 있는 high-resolution 등장이라면 2~5문장으로 자연스럽게 외형을 확정하고
그 인물 카드만 저장한다. 모든 18명을 매 턴 조회하거나 Archive를 갱신하지 않는다.

## Operational boundary

RAW durable publication, Reader/Wiki/Graph/appearance snapshot, GitHub PR와
Netlify는 04:30 batch가 담당한다. 중요한 되돌릴 수 없는 변화는 예외적으로
조기 publication 후보가 될 수 있지만, 이를 normal turn을 막는 동기으로 쓰지 않는다.
