# AFTERFALL — Play Session & Transcript Protocol v1

Status: **AUTHORITATIVE OPERATING POLICY**  
Chronicle: **03 / AFTERFALL / 서진우**  
Purpose: ChatGPT 채팅방이 늘어나도 게임 상태·정본·공개 원문이 끊기지 않게 한다.

## 1. 핵심 원칙

> **채팅방은 세이브가 아니다. 채팅방은 게임 화면이다.**

- 현재 게임 상태의 source of truth: Supabase `survival_rpg`
- 장기 정본/설계/시즌 기록: GitHub `worldlines/AFTERFALL/`
- 공개 플레이 원문: 검증된 transcript archive
- 공개 독자용 사이트: Survival Diary Archive / Netlify

채팅방이 바뀌어도 위 저장층이 이어지면 같은 게임이다.

## 2. 새 채팅방 시작

사용자는 긴 인수인계문을 다시 작성할 필요가 없다.

기본 시작 문구 예:
- `생존일기 이어서`
- `AFTERFALL 이어서`
- `시즌 2 계속`

GM은 기억만으로 이어가지 않는다.

새 방 부팅 순서:
1. `BOOT.md`
2. `CURRENT_STATE.json`
3. CURRENT_STATE가 가리키는 최신 checkpoint
4. Supabase `check_runtime_consistency('AFTERFALL')`
5. 현재 장면 관련 인물만 `get_scene_context()`
6. 필요 시 직전 공개 transcript tail / 최근 major scene 확인
7. 현재 재개점에서 바로 플레이

과거 채팅방 전체를 정상 부팅 입력으로 다시 읽지 않는다.

## 3. 채팅방 교체 권장 시점

채팅방은 자유롭게 바꿔도 된다.

권장 교체 시점:
- 중요한 에피소드가 끝났을 때
- 날짜가 크게 넘어갈 때
- 주요 장소/상황이 전환될 때
- 시즌 내 새 장이 시작될 때
- 대화가 지나치게 길어져 문맥 품질이 떨어질 때

원칙:
> 채팅방 ≈ Episode / Chapter 단위의 플레이 화면

단, 방 교체 자체가 Canon 경계는 아니다.

## 4. Session Open

세션 시작 시 최소 확인:
- worldline = AFTERFALL
- ip_chronicle = 03
- protagonist = 서진우
- season / game time
- current checkpoint
- current scene
- save version
- relevant characters
- unresolved strategic choice가 있는지

이전 Worldline / Chronicle의 주인공·가족·NPC·사건을 섞지 않는다.

## 5. Session Close

방을 옮기거나 중요한 에피소드가 끝날 때 시스템은 다음을 남길 수 있어야 한다.

- session_id
- worldline / chronicle / season
- 마지막 game time
- 마지막 scene
- 현재 장소
- 참여 인물
- 미해결 선택 / 다음 재개점
- save version
- transcript 마지막 turn 위치
- major canon changes
- archive sync 필요 여부

사용자가 별도의 수동 인수인계문을 작성하지 않는 것을 목표로 한다.

## 6. 공개 플레이 원문 보존

장기 목표:
> USER/GM의 **공개 플레이 메시지 원문을 append-only로 보존**한다.

보존 대상:
- PLAYER/User의 실제 선택·자유행동·대사
- GM/Assistant가 실제 공개한 장면·NPC 대사·결과

보존 금지:
- system/developer prompt
- hidden reasoning / chain of thought
- tool call / tool result
- GM-only future plot
- hidden NPC state
- secret / credential
- 비공개 제작 메타

권장 구조:
- Runtime capture: Supabase 또는 동등한 append-only transcript store
- Episode/Season closeout: GitHub cold archive
- Public Archive: PLAYER_SAFE transcript만 publication layer로 승격

## 7. Transcript Integrity

**원문은 기억으로 재구성하지 않는다.**

구분:
- VERIFIED_TRANSCRIPT: 실제 공개 메시지 원문이 검증됨
- CANON_SUMMARY: 실제 Canon 사실을 요약/서사화
- MISSING_TRANSCRIPT: 원문 미확보
- SUPERSEDED: 과거 리부트/비정본화

CANON_SUMMARY를 VERIFIED_TRANSCRIPT처럼 표시하지 않는다.

현재 S01 RAW는 일부 `BACKFILL REQUIRED` 상태다.
원문이 없는 구간은 없는 상태로 남긴다.

## 8. Turn / Scene / Canon의 차이

- Turn: 실제 USER↔GM 메시지 흐름
- Scene: 이후 인과에 다시 돌아올 가치가 있는 주요 장면
- Canon: 시즌을 넘어 지속되거나 이후 플레이 판단을 바꾸는 사실

모든 Turn을 Scene/Canon으로 승격하지 않는다.
하지만 공개 원문은 중요도와 무관하게 보존할 수 있다.

## 9. Archive Sync Trigger

플레이 중 다음이 발생하면 Archive 갱신 후보:
- 주요 인물 등장/변화
- 관계 깊이 변화
- 장소 발견/상태 변화
- 중요한 사건 종료
- 거점 변화
- 합류/이탈/사망
- 플레이어가 실제로 확인한 세계 정보
- 새로운 공개 transcript 구간

Archive 갱신은 본편 진행을 방해하지 않는다.

## 10. 플레이어 경험 원칙

사용자는 기본적으로:
1. 게임을 한다.
2. 방이 길면 새 방으로 옮긴다.

그 외:
- save
- checkpoint
- canon
- transcript
- archive
- graph

관리는 시스템이 맡는 방향으로 발전시킨다.

## 11. Failure-safe

새 방에서 저장층 접근이 불가능하거나 서로 충돌하면:
- 추측으로 이어가지 않는다.
- 최신 확인 가능한 source를 명시한다.
- Current Save / Checkpoint / Transcript의 충돌을 먼저 해소한다.

특히 공개 원문 누락을 기억으로 메우지 않는다.

## 12. 목표 상태

최종적으로 채팅방이 수십~수백 개가 되어도:

```text
ChatGPT room = disposable play surface
Supabase = live save
GitHub = durable canon
Transcript archive = verbatim public history
Archive site = public reading/exploration surface
```

가 유지되어야 한다.
