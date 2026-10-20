# 생존가방 원고 등록·공개 연결 운영 V1

확인일: 2026-10-20. 기준 main `3f475b4a366acc6e1ed62921ae35c1a5a9ae2ca6`.

## 현재 증거와 완료 경계

| 항목 | 확인 결과 |
| --- | --- |
| 카탈로그 | 49개 ID, 중복 없음 |
| GitHub 원고 | PR #525 HEAD `c1029820248224c27ea34efc32537c2b8ad169fa`에서 21편 |
| Library ZIP | 이번 대화에 첨부되지 않음. `/workspace/library-files`, `shared/downloads`, `scratch`에도 원문 없음. 28편과 MANIFEST.json의 파일명·SHA 검증은 **BLOCKED** |
| 실제 ID→원고 파일·slug 매핑 | **21/49 준비**, 28개는 원문 미확보. 49행이 있다는 사실을 49편 원고 확보로 보고하지 않음 |
| 기존 승인·공개 목록 | `guide-01~07`, `guide-43` 8개. 기존 URL·원고 바이트·승인일·증거 보존 |
| 확보된 미승인 원고 | 13편. 미확보 28편과 함께 41개 ID는 공개 목록에 없음 |
| 원고 준비와 발행 준비 | 별개. 기존 렌더러에 맞지 않는 하단 헤딩·미확인 내부 링크는 `readerProjection`에서 진단하며 원문을 고쳐 통과시키지 않음 |

8개 승인 원고는 main과 집필 브랜치의 blob이 동일하다. 추가 13편은 원고 파일만 추출하여 현재 main 기반 브랜치에 바이트 그대로 보관했다. #525의 앱 브랜치 전체나 큐를 병합하지 않았다. #525·기존 예약·Library 원본은 변경하지 않았다.

## 권위와 재사용 구조

- `catalog.mjs`: 유일한 카탈로그 ID·품명·group·저장 category의 권위. 배열 위치로 원고 slug를 만들지 않는다.
- `SOURCE_RECEIPTS_V1.json`: 원고별 최초 전달 출처와 원본 바이트 증거. GitHub는 정확 commit/blob/SHA-256, Library는 원문 SHA-256·Git blob·ZIP SHA-256·MANIFEST SHA-256을 기록한다. 원문을 변경하면 현재 receipt에 자동으로 맞추지 않는다.
- `ARTICLE_REGISTRY_V1.json`: 49개 catalogId의 편집 매핑. 실물 파일이 있는 ID에만 파일명·slug·해시가 있다. 없는 원고는 null과 `SOURCE_NOT_RECEIVED`로 기록한다. 독자 번들에 넣지 않는다.
- `DRAFT_QUEUE_V1.json`: 기존 사용자 승인 이력과 검수 상태. 집필 진행 수는 실제 GUIDE 파일 목록으로 계산한다. `maxPendingIndependentReview`나 오래된 `nextCandidate`를 집필 중단 근거로 사용하지 않는다. 기존 예약 정책 필드는 수정하지 않았다.
- `PUBLISHED_ITEMS`: 실제 발행 승인된 URL만. 전체 편집 매핑과 별개다. 현재 8개를 그대로 유지한다.
- `approvedBagArticles()`: 기존 승인 상태·증거·날짜·URL·템플릿·링크 게이트에 정확 원고 SHA 일치를 추가했다. 정상 빌드도 registry 최신성을 검사한다. 기존 8편은 재승인하지 않고 이미 승인된 동일 바이트를 해시에 묶었다.
- `knowledgeFor()` / `publishedKnowledgeForItem()` / `articlePage()`: 추천 목록, 등록 물품, 지식 하단 복귀를 계속 담당한다. V1 재고 ID·스키마는 그대로다. 안정적인 `catalog-guide-XX`가 있으면 사용자가 수정한 물품명보다 ID를 먼저 사용한다. 해당 ID가 미게시이면 이름이 공개 품목과 같아도 다른 글로 오연결하지 않는다.

실행:

```sh
node archive/scripts/build-bag-knowledge-registry.mjs --check
node archive/scripts/build-bag-knowledge-registry.mjs --check --require-complete
```

첫 명령은 확보한 파일의 정합성과 미확보 상태를 검사한다. 두 번째는 원고가 49편이 아니면 **실패**한다. `readerProjection.ready`는 기존 렌더러로 해석 가능하다는 뜻이며 안전 검수·사람 승인·실제 게시를 뜻하지 않는다.

## ZIP을 전달받으면

1. ZIP 원본과 MANIFEST를 그대로 보존하고 각 파일의 이름·SHA-256을 실제 바이트와 비교한다. 경로 순회·절대 경로·심볼릭 링크·동일 ID/slug·미등록 품목을 거부한다. MANIFEST 구조를 먼저 읽고 검증하며 구조나 내용을 추측하지 않는다.
2. 최신 #525와 ZIP의 합집합을 비교한다. 동일 ID의 내용이 다르면 덮어쓰지 않고 차단한다. 같은 원문이 양쪽에 있어도 ID 하나로만 계산한다.
3. 각 원고의 `catalogId/catalogName/group/category/slug`를 실제 카탈로그와 대조한다. 기존 원고·승인·예약·집필 큐를 자동으로 재작성하지 않는다.
4. 별도 #525 작업 폴더에서 검증한 신규 원문만 배타적으로 생성한다. 허가된 쓰기가 실패하면 실제 오류와 readback 상태를 보고한다. 예약 환경의 안전 검사 차단을 다른 API로 우회하지 않는다.
5. 실제 #525 저장 커밋과 원고별 receipt를 확인한 뒤 원문·출처 receipt만 main 기반 통합 브랜치에 복제한다. #525 전체 병합은 금지한다. `SOURCE_RECEIPTS_V1.json`의 Library 레코드는 원본 ZIP과 MANIFEST 해시, file, sha256, 실제 Git blob을 포함한다.
6. registry를 재생성하고 `--check --require-complete`를 실행한다. 정확히 49개 ID가 한 번씩 존재하며 파일·slug·해시가 모두 확정되어야 `CATALOG_MAPPING: 49/49`다. ZIP 미전달 상태에서는 이 단계를 성공으로 보고하지 않는다.
7. PUBLISHED_ITEMS는 늘리지 않는다. 49편을 확보해도 미승인 41편은 공개 페이지·검색·목록·sitemap·앱 상세 링크에서 제외한다.

## 사람의 품목별 발행 승인 이후

1. 사용자가 승인할 정확 catalogId·file·slug·SHA-256을 읽고 명시적 발행 승인을 기록한다. 변경된 원문에 과거 승인을 재사용하지 않는다.
2. 해당 원문의 독립 검수·고위험 정보 검수, 공식 출처의 실제 근거 범위, 내부 링크의 200·본문을 확인한다. `readerProjection` 진단을 검토하며 템플릿이나 링크 게이트를 우회하지 않는다.
3. 기존 main 큐의 해당 ID에만 `USER_APPROVED_FOR_PUBLICATION`, `approvedAt`, `approvalEvidence`, `sourceSha256`를 기록한다. 검수 증거는 기존 `reviewEvidence` 방식으로 남긴다. 이 문서는 새로운 원고를 승인하지 않는다.
4. `PUBLISHED_ITEMS[id]`에 검증한 slug의 URL을 추가한다. 기존 URL은 변경하지 않는다. 승인 큐·해시·URL이 모두 맞아야 기존 빌드가 정적 본문, 목록·검색·sitemap과 앱 링크를 생성한다.
5. 기존 320/390/1280px 화면·링크·복귀·재고 무변경·PWA 회귀와 정확 HEAD CI/Preview를 통과한다. 모든 미승인 글의 reader output은 Preview에서도 0이어야 한다. 검토용 원문은 인증된 Operator가 GitHub에서 읽는다.
6. 별도 병합 권한을 받은 뒤 통합한다. 이번 작업에서는 main 병합·강제 Production 배포를 하지 않는다. 기존 48시간 Netlify 정책은 그대로다.
7. 정기 배포 후 Production의 `deploy-meta.json`, 공개 `knowledge/bag/index.json`의 id·href·원고 SHA, 실제 상세 URL·본문을 확인한다. GitHub 저장·발행 승인·Preview 출력·정식 게시를 서로 바꾸어 보고하지 않는다.

## 운영자 원고함

#566의 실제 디렉터리 조회·원문 reader·기존 인증 진입점·SafeMarkdown·스타일을 선택해 재사용했다. #567의 큐만 읽는 중복 구현은 사용하지 않았다. 두 PR을 병합하거나 닫지 않았다.

- 로그인 전에는 원고함이 렌더링되지 않으며 GitHub 원고 조회도 시작하지 않는다. 기존 인증·DB 권한 규칙을 변경하지 않았다.
- 최신 집필 디렉터리의 실제 파일과 main의 승인 큐·원고 blob을 대조한다. 낡은 집필 큐가 실제 원고 수를 제한하지 않는다.
- 원고를 선택할 때 디렉터리에서 읽은 blob과 파일 API의 blob이 다르면 새로고침을 요구한다. 잘못된 ID·품명·분류·slug의 본문은 거부한다.
- 작성됨 / 검수·승인 대기 / 발행 승인 / 정식 게시 SHA 확인을 따로 표시한다. 미확보 ID는 비활성 행으로 표시한다. 조회 실패 시 오래된 선택·본문과 목록을 완료 상태로 남기지 않는다.
- 출처 receipt가 있는 동기화 파일은 Library 원본임을 구분하고 ID별로 한 번만 센다. 미전달 Library 파일을 존재한다고 계산하지 않는다.
- Production 배포 메타와 같은 빌드 공개 목록의 정확 원고 SHA 증거가 있어야 정식 게시로 센다. Preview는 검수 빌드로만 표시한다. 구형 Production 목록에 SHA가 없다면 승인 8편을 재승인시키지 않고 게시 증거를 미확인으로 표시한다.
- 새 DB/RPC/인증/직접 GitHub 쓰기/원클릭 공개 버튼은 없다. 검수 후 발행은 위 기존 매니페스트 게이트를 사용한다. GitHub 공개 원고를 비밀 보관소라고 주장하지 않는다.
- CSP는 `/operator*`의 기존 제한에 읽기용 `https://api.github.com`만 추가한다. 공개 지식·앱 CSP와 Production 배포 정책은 바꾸지 않는다.

## QA 기록

- PASS: 웹 React/Vitest 38파일·235테스트. 카탈로그·registry·승인 SHA·앱·보안 Node 검사, 공개 빌드 및 public boundary 검사.
- PASS: 공개 8편의 320/390/1280px 목록·추천·등록 물품·복귀와 개인 재고 무변경. 기존 검색 회귀.
- PASS: 시스템 Chromium 154로 기존 PWA 설치·오프라인·두 탭 업데이트·실패한 혼합 캐시·백업·IndexedDB·프로세스 재시작 회귀. 앱 자산 변경에 따라 기존 pwa-assets cohort만 재생성했다.
- PASS: 운영자 원고함 로컬 fixture 320/390/1280px, 원문 목록·누락 28행·SHA 변경 차단·403 오류·Preview 비정식 표시. 실제 익명 운영자 경로에서 원고함·GitHub 요청 0. 실제 계정 로그인·운영 DB 권한 시험은 하지 않았다.
- BLOCKED: ZIP 28편 및 MANIFEST 원문이 없어 파일명·SHA·49/49 원고 완성 검증 불가. 원고 동기화 쓰기 자체는 시도하지 않았으며 쓰기 실패로 보고하지 않는다.
- 원격 정확 HEAD CI·Preview·Production URL 증거는 이 브랜치의 Draft PR에서 별도로 확인한다. 실행 전에는 완료로 표시하지 않는다.
