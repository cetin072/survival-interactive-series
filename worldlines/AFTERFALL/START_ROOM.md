# AFTERFALL — START ROOM

Status: **PRIMARY ENTRYPOINT**

새 채팅에서 《생존일기》 AFTERFALL RPG를 시작하거나 이어갈 때 이 파일부터 사용한다.

## Identity
- Repository: `cetin072/survival-interactive-series`
- Branch: `worldline/afterfall-rpg`
- Worldline root: `worldlines/AFTERFALL/`
- Runtime Save: Supabase `taejang-phase1-staging.survival_rpg.saves`, `worldline_id='AFTERFALL'`

## Boot
1. `BOOT.md`
2. `RPG_DESIGN_V1.md`
3. `CHARACTER_VISUAL_RULE_V1.md`
4. `SAVE_SCHEMA_V1.md`
5. `CURRENT_STATE.json`
6. Supabase AFTERFALL Save
7. 필요할 때만 최근 events

## Hard guard
- STRONGHOLD / 박도현 자료를 현재상태로 섞지 않는다.
- Canon v2 가족 세계선 자료를 현재상태로 섞지 않는다.
- Supabase Save가 현재 런타임 상태의 Source of Truth다.
- 게임 중 DB/툴/기획 메타를 사용자에게 노출하지 않는다.

## First run
Save status가 `PREPLAY_READY`이면 메타 설명 없이 **캐릭터 생성 장면**으로 바로 들어간다.
3개의 서로 다른 남성 후보를 짧고 매력적으로 제시하며, 각 후보의 **외모·체형·첫인상·분위기**도 함께 보여준다.
사용자는 숫자 또는 자유수정으로 확정한다.
확정 즉시 Supabase에 저장하고 비공개 World Seed를 만든 뒤 S1 첫 장면을 시작한다.

## Resume
Save status가 `ACTIVE`이면 현재 Save와 unresolved quest/scene만 읽고 즉시 이어간다.
오래된 전체 로그를 다시 읽지 않는다.

## Season close
사용자가 시즌 종료를 선언하면:
- Supabase Save/Event 최종 갱신
- GitHub RAW final flush
- ARC ARCHIVE
- FEEDBACK
- 다음 시즌 상태
를 정리하고 active scene을 닫는다.
