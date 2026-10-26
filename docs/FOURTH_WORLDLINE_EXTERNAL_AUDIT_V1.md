# 네 번째 세계관 — 외부 AI 감사 지시서 V1

상태: AUDIT_PREPARED / INDEPENDENT_REVIEW_PENDING / GAME_NOT_STARTED
작성일: 2026-10-17 (Asia/Seoul)
대상: cetin072/survival-interactive-series / docs/fourth-worldline-planning / Draft PR #600
작업 시작 스냅샷: 4588d56f9f9ea77a75a5d0f367f85fad12d68793
재사용 참고 스냅샷: worldline/afterfall-rpg @ 1b2aeb6df8c189ba7185d0a58b48aa3fefa79e6a
감사 시 PR 최신 head와 첨부 패키지 MANIFEST.json의 후보 commit을 대조한다. 서로 다르면 섞지 말고 감사한 정확한 버전을 명시한다.

## 1. 외부 감사자에게 요청

첨부 자료와 실제 파일을 읽고 독립적으로 감사하라. 작성자의 PASS 보고를 그대로 믿거나 감사용 문서의 예시를 실제 플레이 사실로 취급하지 말라.
목적은 시스템을 크게 늘리는 것이 아니라, **창원시 성산구의 일반 배송기사로 시작하는 새 게임을 안전하게 시작할 최소 조건을 확인**하는 것이다.
문제는 숨기지 않되 취미 게임에 필요하지 않은 대형 플랫폼·대시보드·에이전트 체계를 요구하지 말라.

## 2. 현재 준비된 파일 전체

1. docs/FOURTH_WORLDLINE_PLANNING_V1.md — 지금까지의 기획 요약, 확정/잠정/미정/검증 필요, 선택 이력.
2. worldlines/FOURTH_DRAFT/PREPLAY.json — 독립 기획 데이터. 정식 identity는 null, 실제 실행 준비 플래그는 false.
3. worldlines/FOURTH_DRAFT/BOOT_PREPLAY.md — 사전 운영 경계와 기존 시스템 재사용 계획.
4. archive/scripts/check-fourth-worldline-preplay.mjs — 표준 Node만 사용하는 사전 설정 검사.
5. archive/scripts/check-fourth-worldline-preplay.test.mjs — 그 검사의 단위 테스트.
6. docs/FOURTH_WORLDLINE_EXTERNAL_AUDIT_V1.md — 이 감사 요청과 결과 형식.

이 6개는 웹게임 완성본이나 새로운 GM 런타임이 아니다. 신규 worldline 등록·DB 초기화·Save/RAW 연결·실DB 왕복 시험·발행 연결은 미완료다.
패키지는 6개 파일 전문, 수정 전 5개 파일, 변경 diff, 실행 로그, DB 관찰 자료, 재사용 원본 경로를 포함한다. 저장소 전체와 운영 DB 전체의 백업은 아니다.
기획은 의미와 결정의 요약이며 대화 전문이 아니다. 개인 대화·인증키·실제 플레이 원문을 이 감사에 요구하지 말라.

## 3. 반드시 유지할 작품 방향

성인 남성, 일반 배송기사, 창원시 성산구 출발, 미혼·자녀·현재 연인 없음.
자기 일에는 숙련됐지만 재난 생존은 경험으로 배운다. 의료 전문직이나 만능 생존자로 바꾸지 않는다.
전지적 작가 시점, 여러 인물/장소의 카메라, 관찰·궁리·납득 가능한 디테일, 고난 속에서 신뢰를 쌓는 동료, 성인들의 합의된 복수 관계 가능성, 좋은 준비의 실제 보상.
강렬한 초기 붕괴를 충분히 경험한 뒤 잔재·기술·관계를 하나씩 쌓는 재건을 원한다. 반복 회의·행정·경영으로 조기에 전환하지 않는다.
몽골 남부 고비사막 약 2km 충돌은 **잠정안**이다. 실제 한국의 파괴·기후·경고 시점은 미검증이며 원하는 극적 장면만으로 물리적 사실을 확정하지 않는다.

## 4. 현재 구조와 실패 경계

현재 실제 경로:

    기획 문서 → PREPLAY.json → 수동 실행하는 Node 검사/단위 테스트
                               (네트워크·DB 쓰기·게임 생성 없음)

미래에 재사용할 운영 경로 — 아직 새 작품에서 미구현:

    새 identity/독립 Save 확인 → 필요한 scene/NPC/Pressure 로드
      → 사용자 선택 + GM 판정 → 의미 있는 상태 변경
      → 정확한 USER/GM 원문 쌍과 상태 연결 → 플레이어 출력
      → Reader/Wiki/삽화/지식/발행은 별도의 기존 운영 경로

단순 false 플래그나 문서 규칙을 실제 보안 경계·자동 실행 차단으로 착각하지 말라. 현재 검사는 직접 호출할 때만 동작한다.

## 5. 감사 항목

- 기획 일치: 확정 선택이 파일 간 일치하는가? 미정/예시/잠정이 확정으로 승격되지 않았는가? 오래된 세계선의 가족·주인공·말투·스포일러 정책이 유입되지 않는가?
- 실행성: 현재 구현과 필요한 최소 구현을 구분하는가? 정식 식별자·첫 상태·권위 있는 저장 위치·새 방 재개가 실제로 준비됐는가?
- 데이터 무결성: worldline/chronicle/season/session/turn 식별, USER/GM 인접 순서, 동일 재시도 멱등성, 상태 버전, 오래된 Save, 저장 실패·응답 불명확 시 복구를 검증하는가? 누락 RAW를 기억으로 생성하지 않는가?
- 호환성·보안: 기존 AFTERFALL 전용 RPC·테이블 CHECK·트리거·권한을 새 세계관에 그대로 쓰고 있지 않은가? service_role/anon/authenticated 권한과 실제 호출 주체를 구분하는가? RLS 및 함수 SECURITY INVOKER/DEFINER를 함께 확인하는가?
- 경량 운영: 같은 장면의 재조회·전 인물 로드·전체 GitHub 탐색·발행 자동화가 매 턴 끼어들지 않는가? 카메라 변경이 재난 압력이나 인물의 지식을 초기화하지 않는가?
- 검증 정직성: 테스트가 실행됐는가, 정확한 소스/환경/명령/결과가 있는가? 설정 검사 PASS를 실게임/DB/서사 재미 PASS로 확대하지 않는가?
- 재미와 물리적 일관성: 배송기사의 전문성/한계, 선택권·NPC 자율성·기술의 지식 경로가 유지되는가? 몽골 충돌과 성산구의 강렬한 직접 재난을 연결하는 미해결 가정을 표시했는가?

## 6. 이미 알려진 문제도 독립 확인

- BLOCKER 후보: append_public_transcript_turn_with_state_link가 AFTERFALL/C03만 허용한다. linked 테이블 CHECK, enforce_afterfall_turn_state_continuity, lock_afterfall_authoritative_save_head에도 같은 고정이 있다.
- BLOCKER 후보: 새 게임의 정식 identity·독립 Save·원문 저장 세션·재개 시험이 아직 없다. 검사 PASS만으로 실제 플레이 준비 완료가 아니다.
- REVIEW: get_scene_context의 anon/authenticated EXECUTE 허용만으로 정보 유출이라고 단정하지 말라. INVOKER, 기초 테이블 접근권한, 스키마 공개 설정을 확인해야 한다. 실제 역할 테스트는 미실시다.
- REVIEW: check_runtime_consistency의 service_role EXECUTE가 false로 조회됐다. 관리자 connector 조회 성공과 미래 런타임 역할의 접근 가능성은 다르다.
- 정정: 이전 '로컬 테스트 7건 통과'는 보존된 재현 로그가 없었다. 수정 전 파일에는 4개 테스트가 있었고, 이번 지역 회귀 1개를 추가해 현재 5개를 실제 실행했다. 과거 주장과 이번 로그를 혼동하지 말라.
- REVIEW: 기존 AFTERFALL Narrative 문서는 PILOT PROPOSAL이다. 원칙의 유용성과 새 작품에서의 실효성은 별도 검증이다.
- 사소한 문서 검토: 기획 §7.1의 일반적인 미확정 문구에 옛 '한국 출발 지역' 표현이 남아 있다. 최신 확정은 §4/D14의 성산구다. 이런 중복 표현도 지적하되 핵심 차단과 구분하라.

## 7. 재현 방법과 권한

Node v22.16.0에서 패키지 candidate 폴더로 이동해 실행:

    node archive/scripts/check-fourth-worldline-preplay.mjs
    node --test archive/scripts/check-fourth-worldline-preplay.test.mjs

baseline은 수정 전 4개 테스트를 재현한다. candidate는 5개다. 로컬 파일만 읽고 DB에 접속하지 않는다.
패키지의 SQL 자료는 **읽기용 증거**다. 함수 정의에 CREATE 구문이 있더라도 실행/배포하지 말라.
라이브 DB에서는 승인된 읽기 전용 카탈로그 조회만 허용한다. 실제 세션 개설·턴 저장·UPDATE·DDL·권한 변경·Migration·유료 서비스·배포·자동화 변경·main 병합은 금지한다.
추가 행동 시험은 독립적인 임시 테스트 환경에서만 제안/수행하고, 사용할 환경이 없으면 미검증으로 남겨라.

## 8. 보고서 형식

1. 감사한 패키지/commit/파일 범위, 실제 실행한 명령과 접근하지 못한 자료.
2. **자료의 감사 가능성**과 **실제 게임 시작 가능성**을 각각 PASS / PARTIAL / BLOCKED로 판정.
3. 중요도 Critical/High/Medium/Low, 근거 파일·행/DB 객체, 확인된 사실과 가설, 재현 방법, 영향, 최소 수정안, 재검증 방법을 표로 제시.
4. 시작 전 반드시 고칠 항목과 플레이 후 개선해도 되는 항목을 분리.
5. 기존 시스템을 최대한 재사용하는 가장 짧은 실행 순서. 전면 재개발 제안은 기존 구조로 해결되지 않는 근거가 있을 때만.
6. 마지막에 '지금 게임을 시작해도 되는가? 아니라면 정확히 무엇이 남았는가?'에 답하라.

외부 보고서 수령 → 근거별 검토/최소 수정 → 중대한 지적 해소·재검증 → 사용자에게 준비상태 피드백 → 게임 시작 순서를 유지한다.
자료를 준비한 AI가 스스로 외부 감사 완료를 선언하지 않는다.
