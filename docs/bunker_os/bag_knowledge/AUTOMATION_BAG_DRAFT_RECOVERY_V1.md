# 생존가방 물품지식 시간당 집필 복구 규칙 — V2 (2026-10-15)

> **운영 기준:** A-Wiki/B/C에서 검증한 원본 보존·멱등성·readback·작업/출판 분리를 재사용한다.
> 이 문서는 2026-10-15 발생한 예약 환경의 GitHub ref safety 차단 이후 **V1 Git-tree 단일 커밋 갱신을 대체**한다. 구형 V1 지시 중 Git `create_tree → create_commit → update_ref`는 더 이상 실행하지 않는다.

## 실제 원인과 남겨야 할 이력

- 18:00: guide-09 원고는 GitHub 작업 브랜치에 저장됐지만 별도 쓰기 단계인 `DRAFT_QUEUE_V1.json` 갱신이 누락됐다. 원고/큐 2개 독립 쓰기에 원자성이 없다는 구조적 원인 확인.
- 20:06: guide-10 원고와 큐를 한 커밋으로 준비했다(`52e3dae1356d8e9bd5533c5e19653f4dbef65d55`, parent `77f53f0b99b3d5cb944c3d4d595e9bdad221c322`). 하지만 예약의 `update_ref`가 **도구 안전 검사에서 차단**되어 브랜치에는 반영되지 않았다. 세부 안전 검사 내부 규칙을 GitHub 로그에서 확정할 수 없으므로 GitHub 서버 권한·브랜치 보호 오류라고 단정하지 않는다.
- 같은 준비 커밋의 guide-10 내용은 삭제하거나 다시 집필하지 않고 **허용된 파일 단위 GitHub 생성 API**로 복구했다. 복구 커밋 `1579013fdc69ab80d28db062367f45c69f2b6c9e`, 원고 blob SHA `5494fc187fe2fe13635a5ac160e943e057081b57`. 브랜치 파일과 준비 원고 SHA 일치 확인.
- 이제 중요한 것은 '원고 1편을 잃지 않고 시간마다 보관'이다. 원고와 별도 대기 목록을 같은 시간에 쓰도록 강제하지 않는다.

## 새로운 집필 실행 계약: 1회 = 새 원고 파일 1개

1. **권위**: 기존 OPEN/Draft PR #525의 브랜치 `feat/bag-side-item-knowledge-template-v1`, 실제 `docs/bunker_os/bag_knowledge/GUIDE_XX..._DRAFT_V01.md` 파일들이다. `DRAFT_QUEUE_V1.json`은 구형 승인/검수 메타데이터 스냅샷이며 **다음 집필 ID 결정·집필 차단의 권위가 아니다**. 승인 상태는 변경하지 않는다.
2. 시작 시 PR 정확한 head/state와 같은 브랜치의 `AGENTS.md`, `ITEM_ARTICLE_TEMPLATE_V1.md`, 승인된 초도 8편, 원본 `archive/web/public/bag-lab/catalog.mjs`를 확인한다.
3. **한 번의 GitHub 읽기로 실제 문서 목록 얻기**: `GET /repos/cetin072/survival-interactive-series/contents/docs/bunker_os/bag_knowledge?ref=feat%2Fbag-side-item-knowledge-template-v1`. `^GUIDE_(\\d{2})(?:_[A-Z0-9]+)*_DRAFT_V01\\.md$`를 만족하는 문서의 ID를 모은다. 같은 번호의 두 파일은 **DUPLICATE_ID_BLOCKED**로 즉시 중단한다. 1..49 ID 전체에서 없던 **가장 작은 하나**를 골라 작성한다.
4. 대상 ID의 카탈로그 **ID·품명·group·category**를 실제 코드에서 직접 확인한다. 이미 같은 ID 파일이 있으면 절대 덮어쓰거나 중복 생성하지 않고 다음 미작성 번호로 넘어간다.
5. 사용자 검수 완료 8편과 템플릿을 따라서 첫 문장 즉답 → 생활 상황 → 활용/선택/보관/주의 → 30초 점검 3개 → 관련 글 후보/실제 확인된 링크 → 검증된 근거로 구성한다. 실제 안전상 위해 요소는 빼지 않는다. 근거 검증 실패는 SOURCE_BLOCKED. 고위험 글도 미검수 원고로 보관하고 공개하지 않는다.
6. `contentType: bag-item-knowledge`, `catalogId`, `catalogName`, `group`, `category`, `slug`, `title`, `status: DRAFT_NEEDS_INDEPENDENT_REVIEW`, `reviewedAt: null`, `version: 0.1.0`을 포함한다. 파일명은 `GUIDE_XX_DRAFT_V01.md` 하나만 생성한다. 기존 파일/주석/원고 및 `DRAFT_QUEUE_V1.json`은 변경하지 않는다.
7. **GitHub 공식 `create_file` 한 번만 사용**해 지정 Draft 브랜치에 새 원고 파일 1개를 커밋한다. 호출 직전 실제 새 경로 미존재를 재확인하고, GitHub에서 실제 파일을 다시 열어 내용/품명/ID/DRAFT/커밋을 readback한다. `create_file` 실패 또는 안전 차단은 `WRITE_BLOCKED`, 갱신 여부 모호하면 `VERIFY_PENDING`으로 기록하고 브랜치/디렉터리 상태를 재조회한다. 이미 생성된 파일은 절대 다시 쓰지 않는다.
8. 한 번의 실행에서 **최대 신규 원고 1편**. 검수 대기 수와 `maxPendingIndependentReview`은 작성 중단 조건이 아니다. 카탈로그 49개가 모두 존재하면 `ALL_49_WRITTEN`만 보고한다(예약 OFF 변경 금지).
9. **절대 하지 말 것**: Git ref 강제 변경·우회 API·두 파일 동시 갱신 요구·사용자 승인/게시·main 병합·새 PR/DB/일정 생성, 기존 앱·RAW·A/A-Wiki/B/C·Netlify 운영 변경. 기존 시간당 예약이 소유하는 것은 초안 한 편 생성뿐이다.

## 운영자 글감함 / 대기 목록

- 운영자 원고함은 GitHub 폴더의 실제 GUIDE 파일 목록을 조회하고, 필수 메타데이터 및 기존 승인 상태는 보조 큐와 결합해 표시한다. **큐에 파일이 늦게 반영돼도 작성·열람이 중단되면 안 된다.**
- 사람의 검수/발행 승인 시에만 큐/게시 매니페스트를 정확 원고 SHA와 일치시켜 갱신한다. `USER_APPROVED_FOR_PUBLICATION` 8편의 이력은 기존 `main` 출판 매니페스트가 권위이다.
- PR #525는 집필 작업공간으로 계속 유지한다. 구형 '원고+큐 단일 커밋'은 예약 실행의 안전 검사에서 차단되어 반복 재시도하지 않는다.

## 보고 계약

`PASS / WRITE_BLOCKED / SOURCE_BLOCKED / DUPLICATE_ID_BLOCKED / VERIFY_PENDING / ALL_49_WRITTEN`과 해당 ID·품명·원고 URL·저장 커밋 SHA·GitHub 파일 readback·실제 작성 수/미작성 수를 한국어로 보고한다. **예약 ON, Git object만 생성, 준비 커밋만 존재하는 상태를 PASS로 보고하지 않는다.**
