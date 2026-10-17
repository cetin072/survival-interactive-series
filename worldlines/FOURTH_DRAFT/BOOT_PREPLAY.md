# 네 번째 세계관 — 프리플레이 부팅·운영 경계

상태: **PLANNING_ONLY / GAME BLOCKED**
기준일: 2026-10-17

## 역할

이 문서는 새 게임의 실행 가능한 BOOT가 아니라 **안전한 사전 준비 계약**이다.
주인공 이름·나이·첫 장면 시각, 정식 worldline/chronicle ID, 독립 Save와 원문 저장 경로는 아직 정하지 않았다.
설정 결정의 서술 원본은 docs/FOURTH_WORLDLINE_PLANNING_V1.md이고 기계 점검 데이터는 worldlines/FOURTH_DRAFT/PREPLAY.json이다.
둘이 충돌하면 장면을 생성하지 않는다. AFTERFALL 기록에서 이름이나 Save를 대신 가져오지 않는다.

## 현재 선택

- 한국 **창원시 성산구**, **일반 배송기사**. 구 안의 담당 동·직장·차종·경력·이름·나이 미정.
- 가상의 성인 남성, 미혼·자녀와 현재 연인 없음. 부모 관계 미정.
- 몽골 남부 고비사막 **약 2km 소행성 충돌은 잠정안**이고 정확한 충돌 조건/피해 강도는 미검증.
- 과학계가 먼저 파악하고 시민은 임박해서 아는 절충형 사전 인지 방식.
- 강렬한 초기 붕괴·실제 생존의 관찰/궁리/기술·자율적인 동료·전지적 작가 시점·점진적인 재건.

## 기존 AFTERFALL 패턴을 독립적으로 재사용

검토 원본: worldline/afterfall-rpg 브랜치의 worldlines/AFTERFALL 폴더 및 저장소 루트 WORLDLINE_ROUTER.md.

| 재사용 대상 | 원본 운영 파일 | 새 세계관에 적용할 성질 |
| --- | --- | --- |
| Identity와 부팅 | BOOT.md, CURRENT_STATE.json | 잘못된 주인공·worldline·시즌·Save를 섞지 않고 fail-closed |
| 장면 로딩 | GM_CONTEXT_V1.md, LIVE_TURN_FAST_PATH_V1.md | 관련 인물·Pressure만, 장면별 캐시 재사용 |
| 원문 캡처 | PLAY_SESSION_PROTOCOL_V3.md | USER/GM 원문을 일관된 순서·멱등 키로 보존 |
| 상태와 지속 설정 | SAVE_SCHEMA_V1.md, PERSISTENT_CANON.md | 현재 상태·Canon·RAW 역할 분리, 의미 있는 변화만 쓰기 |
| 연출과 압축 | NARRATIVE_PACING_ESCALATION_V1.md, narrative/NARRATIVE_SYSTEM_V1.md | 반복행동 압축, NPC 자율성, 성공의 보상, 감정·기술의 디테일 |

**재사용할 것은 패턴이지 AFTERFALL 데이터가 아니다.**
게임 시작 승인 후 선택된 부분만 복제·독립 수정한다. 이전 세계선의 런타임이나 브랜치를 신규 게임의 실행 의존성으로 삼지 않는다.
기존 파일에 적힌 파일럿 규칙과 문서상 설계는 실제 효과를 확인하기 전까지 기술/재미 PASS로 주장하지 않는다.

## 실제 Supabase 호환성 실사 (읽기 전용)

2026-10-17 taejang-phase1-staging / survival_rpg 조회:

- 현재 saves에는 AFTERFALL Save 295만 확인되며 새 게임 Save는 없다.
- get_scene_context, check_runtime_consistency, append_public_transcript_turn, open_public_transcript_session_with_archive_intent 정의에서는 직접적인 AFTERFALL/C03 문자열 고정을 확인하지 못했다. 이것만으로 전체 호출 경로가 새 worldline에서 동작한다고 보증할 수는 없다.
- **중요 차단점:** append_public_transcript_turn_with_state_link 함수는 AFTERFALL/C03를 요구하고 lock_afterfall_authoritative_save_head를 사용한다.
- transcript_turn_state_links 테이블에도 AFTERFALL/C03 CHECK와 enforce_afterfall_turn_state_continuity 트리거가 있다.
- 따라서 **기존 linked RAW/Save 경로는 새 세계관에 아직 호환되지 않는다.** 무작정 적용하면 기록 오류와 원본 영향 위험이 있다.

현재 Production DB 함수·제약·트리거는 수정하지 않는다.

## 실제 플레이 시작 전 기술 Gate

1. 추가 기획을 마치고 새 정식 identity·독립 상태를 결정한다.
2. 기존 운영 코드를 새 대상으로 복제·수정한다. AFTERFALL 원본의 Save·RAW·Canon·인물은 유지한다.
3. 새 저장 경로에서 RLS·권한·세션·원문 쌍·의미 있는 상태 링크·연속성 검증·재시도를 독립적으로 시험한다.
4. 서진우가 변경되지 않았음을 확인하고 사용자 **게임 시작 승인**을 받은 뒤 첫 장면을 생성한다.
5. Reader·Wiki·일러스트·생존지식·배포는 본편 턴과 분리한다. 새로운 DB·대시보드·공통 프레임워크부터 만들지 않는다.

현재 실행된 업그레이드는 **설정 기록 + 프리플레이 fail-closed 검증 + 기존 저장 기능 호환성 장애 확인**까지다.
실제 새 게임 런타임 도입/Production DB 변경은 아직 완료하지 않았다.

오프라인 검사:
- node archive/scripts/check-fourth-worldline-preplay.mjs
- node --test archive/scripts/check-fourth-worldline-preplay.test.mjs

이 검사는 사전 기획 데이터 게이트일 뿐, 실제 게임 Save·RAW·자동화·배포의 검증이 아니다.

## 외부 AI 감사 대기 — 2026-10-17

사용자는 성산구를 선택하고, 현재 준비물 전부를 외부 AI에게 감사받은 뒤 피드백하고 게임으로 넘어가기로 했다.
감사 입구는 `docs/FOURTH_WORLDLINE_EXTERNAL_AUDIT_V1.md`다. 외부 감사는 아직 수행되지 않았다.
감사 완료만으로 신규 게임 기록 경로의 안전이 입증되지는 않는다. 중대한 지적 해소·재시험·짧은 준비상태 피드백 후 실제 시작한다.
사전 검사 CLI는 스스로 실행되는 런타임/보안 장치가 아니다. `false` 설정과 문서만으로 실제 DB 접근·GM 장면 생성이 차단됐다고 해석하지 않는다.
기존 7건 PASS 보고는 근거 로그가 없어 승계하지 않는다. 이번 감사 패키지의 정확한 소스·실행 로그를 기준으로 검수한다.
