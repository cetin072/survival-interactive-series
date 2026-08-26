# Autosave & Memory Policy

사용자가 저장 위치나 파일 구조를 기억하지 않아도 되도록 GM이 플레이 중 상태 변화를 자동 기록하는 운영 규칙.

## 자동 저장 시점
아래 상황에서는 사용자가 `저장`이라고 말하지 않아도 GM이 가능한 한 GitHub 상태를 갱신한다.
- 중요한 선택의 결과가 확정된 직후
- 장면/에피소드/날짜가 크게 전환될 때
- 파티가 분리되거나 다시 합류할 때
- 가족의 부상·상태·관계가 크게 바뀔 때
- 거점, 차량, 핵심 장비, 주요 자원이 크게 변할 때
- 새 중요 장소/정보/NPC가 Canon으로 확인될 때
- 세션을 마치거나 사용자가 다른 채팅으로 이동한다고 명시할 때
- 시즌 종료 시

## 자동 기록 항목
필요에 따라 다음 파일을 갱신한다.
- `players/main/SAVE_STATE.json`
- `players/main/CHECKPOINT.md`
- `players/main/SESSION_LOG.md`
- 현재 시즌 `GM_STATE.json`
- 현재 시즌 `EVENTS.json`
- `idea_vault/INBOX.md`
- `playtests/PLAYTEST_NOTES.md`

## 아이디어 감지
플레이 중 사용자가 게임 밖 관점에서 새 기능, 재난, 갈림길, NPC, 연출, 삽화, 시스템 아이디어를 말하면:
1. 현재 플레이를 불필요하게 중단하지 않는다.
2. 아이디어를 `idea_vault/INBOX.md`에 우선 기록한다.
3. 명백한 공식 설정 확정이 아니라면 Canon으로 바로 승격하지 않는다.
4. 적절한 시점에 DISASTERS / DILEMMAS / SURVIVAL_KNOWLEDGE 등으로 분류한다.

## 시즌 종료 자동 정리
시즌이 끝나면 `docs/SEASON_COMPLETION_PIPELINE.md`를 실행 대상으로 본다.
즉, 실제 플레이 로그를 보존하고, 시나리오 자산화·Branch Map·삽화 계획·플레이테스트 정리 항목을 생성 또는 갱신한다.

## 한계
이 자동화는 백그라운드에서 독립적으로 실행되는 작업이 아니다. ChatGPT와 사용자가 대화하고 있고 GitHub 연결/쓰기 권한을 사용할 수 있는 동안 GM이 규칙에 따라 저장 작업을 수행하는 방식이다.
새 채팅에서는 먼저 `START_HERE.md`와 최신 저장 상태를 읽어 연속성을 복구한다.
