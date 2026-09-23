# AFTERFALL — Next Chat Start Prompt

새 채팅에서 아래 한 문장을 사용한다.

> 《생존일기》 Chronicle 03 / AFTERFALL 시즌 2 이어가기. `cetin072/survival-interactive-series`의 `worldline/afterfall-rpg` 브랜치에서 `START_ROOM.md`, `BOOT.md`, `CHARACTER_BIBLE.md`, `WORLD_BIBLE.md`, `GM_CONTEXT_V1.md`, `PERSISTENT_CANON.md`, `CURRENT_STATE.json`, `seasons/S02/CURRENT_CHECKPOINT.md`를 읽어. Supabase에서는 먼저 `check_runtime_consistency('AFTERFALL')`를 확인하고, 현재 장면 관련 인물만 지정해서 `get_gm_context`를 불러와. 전체 Save/Events/RAW를 습관적으로 통째로 읽지 말고, 과거 세부가 필요할 때만 scenes→events 순으로 내려가. 미래 사건·정부붕괴 촉발·손실·NPC 관계를 스포일러하지 말고 현재 장면부터 바로 이어가.

이 프롬프트는:
- 서진우가 《생존일기》 제3주인공임을 고정한다.
- 시즌 1 캐릭터 생성으로 되돌아가는 것을 막는다.
- STRONGHOLD / Legacy 가족 Chronicle과 섞이는 것을 막는다.
- GM Context v1의 compact loading을 사용한다.
- Character / World Bible을 정적 설계 정본으로만 사용한다.
- 최신 S02 checkpoint에서 이어간다.
- 전체 RAW/과거 Event가 hot context를 오염시키지 않게 한다.
- 미래 플롯을 사전 설명하지 않게 한다.
