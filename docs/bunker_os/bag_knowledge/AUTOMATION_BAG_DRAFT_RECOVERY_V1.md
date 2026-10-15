# 생존가방 시간당 집필 — 원자 저장·재개 패치 V1

- 2026-10-15, 원본 저장소: `cetin072/survival-interactive-series`
- 작업 브랜치: `feat/bag-side-item-knowledge-template-v1` / 기존 Draft PR #525 / 기존 시간당 예약만 사용.
- 재사용한 설계: A-Wiki source+SHA binding, B 예약 durable receipt/readback/resume, C PREPARED→SUBMIT의 멱등성과 재검증 게이트.

## 18·19시 장애의 사실과 한계

2026-10-15 18:00 KST 예약에서 `GUIDE_09_DRAFT_V01.md`가 커밋 `6487474f3dc7f3da220b1f076b1b0e1a81890405`로 생성됐지만 상태 큐에는 미등록. 19:00 실행 기록은 있지만 다음 글·큐 변경 없음. 이후 사용자 요청에 따라 `guide-09` 원본을 그대로 보존하고 큐만 수동으로 복구했다(커밋 `b9cfd32416afd1aea31a7ea106b9a042e39fdd92`).

**확정된 구조적 문제:** 두 별도 쓰기(원고 생성 → 큐 갱신)는 하나의 트랜잭션이 아니므로 중간 실패 시 불일치가 생긴다. 두 번째 쓰기가 도구 정책에 막혔는지, 작업 종료/시간 초과였는지, 실행 단계 누락인지는 예약 실행 상세 로그가 없어 단정할 수 없다.

## 예약 1회 계약 — 반드시 순서대로

1. 시작 시 PR OPEN/Draft/미병합/정확 브랜치 및 HEAD commit SHA·tree SHA를 확인하고 **그 ref**에서 `AGENTS.md`, `ITEM_ARTICLE_TEMPLATE_V1.md`, 기존 승인 8편, 카탈로그, `DRAFT_QUEUE_V1.json`을 읽는다.
2. **새 집필보다 orphan 복구 먼저**: nextCandidate 원고 파일이 이미 있다면 덮어쓰지 않는다. catalogId·catalogName·DRAFT·섹션·체크 3개를 확인하고 큐에만 등록해 다음 ID로 이동하는 복구용 커밋 1개를 작성, readback하고 **그 실행 종료**. 내용 충돌이면 BLOCKED.
3. 파일이 없고 큐에도 없는 최저 미작성 품목 1개를 선택해 실제 공식 근거를 확인하고 8편의 확정 문체로 글 1편만 작성한다. 첫 문장에 이유를 답하고 안전상 실제 유해한 위험은 관련 절에만 쓴다. 검수 대기 수와 상관없이 49편을 계속 작성한다.
4. **원고와 큐를 같은 Git 커밋으로 저장**: 기존 GitHub 커넥터의 `create_tree`(base_tree_sha=현재 HEAD의 tree SHA, entries=[원고 UTF-8 파일, 큐 UTF-8 파일]) → `create_commit`(parent_sha=시작 HEAD) → `update_ref`(기존 브랜치, expected_sha=시작 HEAD, force=false) 순서. ref 이동 전 생성된 tree/commit 객체는 운영상 '저장 성공'이 아니다. ref 이동은 한 번만 하고, 충돌 시 강제 덮어쓰지 않는다.
5. ref 이동 후 PR HEAD가 제출한 커밋인지, **그 커밋 SHA의 두 파일 내용**과 큐의 nextCandidate·상태가 정확히 일치하는지 읽어 검증한다. **원고 파일 + 큐 2개 readback** 통과 시에만 PASS. HEAD 충돌/불명확 결과면 갱신을 반복하지 말고 현재 상태를 재조회한 후 BLOCKED/UNKNOWN으로 보고한다.
6. create_tree/commit/update_ref가 정책/권한으로 막힐 때는 `ATOMIC_WRITE_BLOCKED`만 보고한다. 기존의 두 개 별도 `create_file`+`update_file` 방식으로 되돌리거나 다른 계정·API를 우회 사용하지 않는다.
7. 파일은 있는데 큐 누락이면 orphan 복구만 하고 신규 집필은 다음 시간 실행에 맡긴다. 큐만 있는데 파일이 없으면 무조건 BLOCKED; 승인을 건드리거나 가짜 내용을 쓰지 않는다.

## 보호 대상

- 집필과 독립 검수·사용자 승인·프론트 게시·정기 Production 배포는 분리한다.
- 이미 검수/승인된 8편, 미검수 원고, RAW, 앱/재고, A/A-Wiki/B/C, Supabase, Netlify, 다른 예약을 수정하지 않는다.
- 새 PR·브랜치·DB·자동화 생성 금지. 기존 PR #525 및 예약만 사용한다.
- 현재 `maxPendingIndependentReview=49`는 과거 호환 필드이며 **실행 차단 조건으로 사용 금지**.
