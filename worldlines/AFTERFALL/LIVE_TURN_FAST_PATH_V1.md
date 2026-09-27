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
   새 season의 LIVE RAW가 있는데 authoritative `saves`가 이전 season에
   머물러 있으면 정상 턴을 이어가기 전에 실제 플레이 기록으로 runtime을
   정합화한다. 오래된 save version을 `NO_STATE_CHANGE`라고 주장하거나
   legacy RAW 호출을 정상 경로처럼 반복하지 않는다.
2. 새 gameplay turn마다 새 USER idempotency UUID와 별개의 새 GM idempotency UUID를
   만든다. **같은 turn의 retry에만** 정확히 같은 두 UUID, USER/GM text, hashes와
   message order를 재사용한다. 과거 turn의 UUID를 새 turn에 재사용하지 않는다.
3. 같은 scene의 안정된 컨텍스트를 이미 가지고 있으면 재조립하지 않는다.
   새 장면이거나 등장인물·큰 Pressure·의미 있는 runtime delta가 바뀐 경우에만
   장면 관련 인물만 지정해 `get_scene_context()`를 읽는다.
4. **이미 로드된 활성 Pressure를 장면 판정에 먼저 적용한다.** 이동·외부인 도착·
   거래·구조·차량운행 같은 행동이 현재 제약과 모순되지 않는지 확인한다.
   서브플롯이나 카메라가 바뀌었다는 이유만으로 Pressure를 완화하지 않는다.
   예외적인 통과는 이미 확립된 조건·준비·비용이 있을 때만 허용하고, 모순이
   해소되지 않았으면 정착된 사실처럼 서술하지 않는다. 이 체크를 위해 normal
   turn마다 별도 DB 호출을 추가하지 않고 현재 scene context의 Pressure를 사용한다.
5. GM이 현재 장면을 판정하고 최종 공개 답변을 확정한다.
6. player/body, 핵심 자원·장비, 파티·거점·차량·세력·주요 관계, 현재 scene,
   durable quest, 중요한 Pressure/Clock 중 실제로 변한 항목만 갱신한다.
7. 정확한 USER input과 **확정된 동일한 GM output**은 한 번의 transcript pair 호출로 보존한다.
   - 평범한 대화·이동·정보확인·반복 운영처럼 durable state를 바꾸지 않는 턴은 `append_public_transcript_turn(...)`만 호출한다.
   - 이미 gameplay 때문에 의미 있는 runtime mutation을 저장한 턴은 그때 확보한 실제 version/outcome을 사용해 `append_public_transcript_turn_with_state_link(...)`를 호출한다.
   - Archive를 위해 별도 save reconciliation이나 추가 state mutation을 만들지 않는다.
8. RAW 호출이 한 번 실패하면 같은 payload로 한 번만 빠르게 재시도한다. 그래도 실패하면 Archive 때문에 플레이어를 더 기다리게 하지 말고 동일 GM 문자열을 출력한다. 보이는 채팅방의 exact pair는 room-close/daily recovery source로 남긴다.

평범한 대사, 몇 분 이동, 반복 정비, 자동 상쇄되는 일상소비, 상태를 바꾸지
않는 정보 확인은 Save/Scene/Event/Pressure/Clock을 전부 갱신하지 않는다.

## Required remote work

| 상황 | 기본 호출 |
| --- | --- |
| 새 scene 또는 안정 컨텍스트가 없을 때 | 관련 인물만 포함한 `get_scene_context()` 1회 |
| meaningful runtime delta가 있을 때 | 필요한 runtime mutation 0~1회 |
| routine USER→GM turn | `append_public_transcript_turn(...)` 1회 |
| meaningful runtime mutation turn | 해당 mutation 0~1회 + `append_public_transcript_turn_with_state_link(...)` 1회 |

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
- routine turn의 기본은 빠른 atomic RAW pair다. state link가 없는 RAW도 역사 원문으로 보존할 수 있지만, 그것만으로 현재 Canon/Graph 사실을 승격하지 않는다.
- meaningful state mutation turn은 실제 version/outcome이 이미 있을 때 linked pair를 남긴다.
- append acknowledgement가 모호하면 같은 payload로 한 번 재시도한다. Archive 실패를 이유로 normal turn을 장시간 막지 않으며, 누락 원문을 기억이나 Canon으로 재구성하지 않는다.

## Visual backfill is not a sweep

현재 scene에 이미 로드된 반복 인물만 본다. `appearance_anchor`가 없고
의미 있는 high-resolution 등장이라면 2~5문장으로 자연스럽게 외형을 확정하고
그 인물 카드만 저장한다. 모든 18명을 매 턴 조회하거나 Archive를 갱신하지 않는다.

## Operational boundary

RAW durable publication, Reader/Wiki/Graph/appearance snapshot, 일러스트 queue, 지식 후보, GitHub PR와 Netlify는 04:30 batch가 담당한다. 중요한 되돌릴 수 없는 변화는 예외적으로 checkpoint/state-link/조기 publication 후보가 될 수 있지만, 이를 normal turn을 막는 동기로 쓰지 않는다.
