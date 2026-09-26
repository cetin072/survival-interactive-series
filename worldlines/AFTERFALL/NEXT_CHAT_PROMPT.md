# AFTERFALL — Next Chat Start Prompt

새 채팅에서 아래 한 문장을 사용한다.

> 《생존일기》 Chronicle 03 / AFTERFALL 이어가기. `cetin072/survival-interactive-series`의 `worldline/afterfall-rpg` 브랜치에서 `START_ROOM.md`, `BOOT.md`, `CHARACTER_BIBLE.md`, `WORLD_BIBLE.md`, `CHARACTER_VISUAL_RULE_V1.md`, `GM_CONTEXT_V1.md`, `LIVE_TURN_FAST_PATH_V1.md`, `PLAY_SESSION_PROTOCOL_V3.md`, `PERSISTENT_CANON.md`, `CURRENT_STATE.json`을 읽어. 이어서 `CURRENT_STATE.json`의 `current_checkpoint`가 가리키는 파일만 현재 재개용 checkpoint로 읽어. Supabase에서는 새 room boot이므로 먼저 `check_runtime_consistency('AFTERFALL')`를 확인하고 Live RAW capture session을 확인·개설한 뒤, 현재 장면 관련 인물만 지정해서 `get_scene_context`를 불러와. normal turn에는 같은 scene의 stable context를 재사용하고 의미 있는 delta만 갱신한 뒤 exact USER/GM을 `append_public_transcript_turn`으로 원자 저장하고 출력해. 전체 Save/Events/RAW나 과거 checkpoint를 습관적으로 통째로 읽지 마. CURRENT_STATE가 season COMPLETE / next season NOT STARTED라면 종료 checkpoint를 연속성 앵커로만 사용하고 미래 사건·손실·NPC 관계를 미리 확정하지 마.

이 프롬프트는:
- 서진우가 《생존일기》 제3주인공임을 고정한다.
- 시즌 1 캐릭터 생성으로 되돌아가는 것을 막는다.
- STRONGHOLD / Legacy 가족 Chronicle과 섞이는 것을 막는다.
- GM Context v1의 compact loading을 사용한다.
- Character / World Bible을 정적 설계 정본으로만 사용한다.
- `CURRENT_STATE.json`이 지정한 현재 checkpoint에서 이어간다.
- 전체 RAW/과거 Event가 hot context를 오염시키지 않게 한다.
- 미래 플롯을 사전 설명하지 않게 한다.
