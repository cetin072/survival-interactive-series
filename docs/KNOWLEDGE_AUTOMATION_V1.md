# Knowledge Automation V1 — Repository 계약

상태: **Repository-side automation contract ready; external Knowledge Worker not yet connected.**

## 경계와 흐름

`GAME → 기존 Archive 공개 RAW 확정 → knowledge-scan → 외부 Knowledge Worker → Candidate/Evidence/BRIEF JSON → deterministic 검사 → 정적 HTML/sitemap → PR → CI`

Scanner는 게임 Runtime, ChatGPT 대화, GM 비공개 데이터, Canon을 읽지 않습니다. `archive/scripts/lib/approved-reader-sources.mjs`의 공개 시즌 계약을 그대로 호출합니다. 그 계약은 `PUBLIC_ARCHIVE`, `VERIFIED_CONTIGUOUS_TURN_PAIRS`, `atomic_pairing_complete`, `public_safe_only`, namespace·세션 일치, manifest/part SHA256, 파트 목록, USER↔GM 순서를 검사합니다. 미승인 시즌·세션·부분 캡처는 입력에서 제외됩니다. 승인됐으나 손상된 입력은 오류로 중단됩니다. 현재 `main`의 S02는 시즌 전체 `PUBLIC_ARCHIVE` 승인이 없어서 신규 입력은 없습니다.

## Scanner와 state

`node archive/scripts/knowledge-scan.mjs --check --json`은 읽기 전용입니다. 결과 `PENDING`은 미래 Worker에 주는 입력 목록입니다. 동일 ref+SHA의 state가 있으면 재실행 시 `NOOP_ALREADY_PROCESSED` 또는 `NOOP_BASELINE_PRE_V1`입니다. 같은 ref의 SHA가 바뀌면 `SOURCE_CHANGED_RESCAN_REQUIRED`이며 기존 BRIEF를 삭제하거나 덮어쓰지 않습니다. 오류는 잡아서 빈 목록으로 바꾸지 않습니다.

V1 최초 활성화 때 **기존에 공개 승인을 받은 입력만** `node archive/scripts/knowledge-scan.mjs --bootstrap --apply`로 baseline에 추가할 수 있습니다. `BASELINE_PRE_V1`은 검토 완료 주장이 아니라 신규 후보 flood 방지 표시입니다. 현재 state는 빈 배열입니다. 향후 bootstrap은 운영자가 실제 활성화 시점을 정한 뒤 한 번 수행해야 합니다. 무심코 매일 실행하면 새로운 입력까지 baseline으로 숨기므로 금지합니다.

`knowledge/automation/state.json`의 항목은 `source_manifest_ref`, `source_manifest_sha256`, `status`, `processed_at`, `candidate_ids`, `brief_ids`를 갖습니다. Worker는 pending 발견 시 state를 변경하지 않습니다. Candidate/BRIEF 또는 명시적 HOLD/HUMAN_REVIEW 결과를 실제로 기록한 후 같은 PR에서 ref+SHA와 결과 ID를 state에 반영합니다. 파일 쓰기는 Worker가 담당하며 Scanner의 일반 실행은 항상 읽기 전용입니다. changed SHA는 새 검토 대상으로 남기고 이전 판정은 보존 가능한 작업 기록에서 추적해야 합니다.

## BRIEF·Evidence와 게시 자격

`knowledge/content/briefs`는 공개 필드만 가진 구조화 콘텐츠입니다. `knowledge/content/evidence`는 claim마다 출처 ID, 적용 문맥과 한계를 기록하며 공개 웹으로 복사되지 않습니다. `risk_domains`는 Worker가 의미 검토 중 선언하며 허용값은 일반 준비 `GENERAL_PREPAREDNESS`, 식품 보관 `FOOD_STORAGE`, 연락 `COMMUNICATION`, 대피 `EVACUATION`, 의료 `MEDICAL`, 약물 `MEDICATION`, 전문 응급처치 `FIRST_AID_PROCEDURE`, 식수 정화 `WATER_PURIFICATION`, 발전기 `GENERATOR`, 연소/일산화탄소 `COMBUSTION_CO`, 전기 `ELECTRICAL`, 구조 `RESCUE`, 방공호/건축 안전 `SHELTER_STRUCTURAL`, 기타 중대한 피해 가능성 `OTHER_SEVERE_HARM`으로 제한합니다. 알 수 없는 값은 검증 오류입니다. 고위험 domain은 `AUTO_LOW_RISK` 금지입니다. 코드는 선언된 위험 분류와 근거 계약을 확인할 뿐 실제 사실의 참을 판정하지 않습니다. 위험 분류를 잘못 선언하면 코드만으로 교정할 수 없으므로 semantic QA와 PR 검토가 중요합니다.

`publicationEligibility`는 `BRIEF + LOW + AUTO_LOW_RISK + PASS`와 완전한 근거, 해결되지 않은 충돌 없음, 저작권 상태 `CLEAR`, 확인된 관계만 있는지 확인합니다. 결과는 `AUTO_PUBLISH_ELIGIBLE`, `HUMAN_REVIEW`, `HOLD` 중 하나입니다. 자동 글의 상태 전이는 `DRAFT/HOLD → READY → PUBLISHED`이며, `READY`와 `PUBLISHED` 모두 동일한 게시 자격 계약을 통과해야 합니다. **`PUBLISHED`는 publication gate를 우회하는 privileged state가 아닙니다.** 자동 글을 `PUBLISHED`로 직접 기록해도 검증 실패 시 정적 생성이 중단됩니다. 기존 `HUMAN_APPROVED + PUBLISHED` 글은 별도 편집 승인 경로를 유지합니다. `AUTO_PUBLISH_ELIGIBLE`도 V1의 `publication_mode=PR_ONLY`에서 **PR 후보**일 뿐 자동 병합이나 Production 게시 허가가 아닙니다. `GUIDE`와 고위험 글은 자동 자격이 없습니다. 검사 실패는 게시 중단입니다.

## 정적 사이트

`archive/scripts/build-knowledge.mjs`는 `PUBLISHED` BRIEF만 `/knowledge/` 목록과 기존 slug 경로에 생성합니다. 정렬은 `published_at DESC`, 같으면 `id ASC`입니다. canonical, 고유 title/description, H1/H2, Breadcrumb 및 Article JSON-LD, 날짜, 출처, 관련 글, sitemap을 포함합니다. 본문과 링크는 JavaScript 없이 읽고 이동할 수 있습니다. `--check`는 저장소를 변경하지 않고 생성물 불일치를 오류로 처리합니다. 다운로드는 실제 파일이 없으면 계약 검증이 실패해 HTML 생성을 중단합니다. K-002의 Excel 파일과 두 URL은 유지합니다.

## 미래 ChatGPT Scheduled Knowledge Worker 절차

1. Scanner로 pending 또는 changed source를 확인합니다.
2. 결과에 있는 검증된 공개 RAW만 읽습니다. 다른 worldline/GM/게임 상태로 보충하지 않습니다.
3. 의미 기반 지식 후보를 추출하고 기존 Topic/BRIEF와 중복을 조사합니다.
4. 필요한 웹 조사를 하고 claim별 출처·문맥·한계·충돌을 Evidence에 남깁니다.
5. Notion 편집실에 작업 기록을 남기는 단계는 향후 외부 연결에서만 수행합니다.
6. BRIEF JSON 또는 기존 BRIEF의 update proposal을 만들고 semantic QA를 수행합니다. 불확실·고위험·저작권 불명확·Story 원문 불명확은 HOLD/HUMAN_REVIEW로 기록합니다.
7. `knowledge:build`, `knowledge:test`, `knowledge:check`, 사이트 build를 실행합니다.
8. `PR_ONLY`이면 GitHub PR을 만들고 CI를 확인합니다. 실패하면 게시하지 않습니다.
9. 결과가 기록된 source에만 processed state를 붙입니다. 단순 pending 발견은 처리 완료가 아닙니다.

하루 1회 sweep을 연결할 때는 새 PUBLIC_ARCHIVE 입력, 이전 실패 job, 미처리 Candidate, stale source, broken URL 후보, changed source를 살핍니다. 매일 모든 URL을 다시 조사하지 않습니다. `source_checked_at`에 따른 재검토 주기는 외부 Worker 단계에서 정합니다. 현재 GitHub Actions는 네트워크 조사나 AI 실행을 하지 않습니다.

## 현재 범위

이 PR에는 예약 Worker, 게임 직후 후보 추출, 실제 웹 조사, Notion API, GUIDE 자동생성, 자동 merge, Production 배포가 없습니다. Archive Reader/RAW/Canon/게임 Runtime/Supabase 코드는 수정하지 않습니다.


## 검색 환경 STEP 2A / STEP 2B 인계 (2026-10-07 KST)

STEP 1 구현·병합은 PASS (PR #456 / 7641c1953998e6c10ce4010a886f8ea6ddecfc36). 현재 Production은 이전 상세 화면이며 STEP 1 실물 검수는 정상 배포 후 수행합니다. Production이 오래됐다는 이유로 main의 KnowledgeGuide를 다시 구현하지 않습니다.

STEP 2A는 기존 생성기의 최초 HTML head에 기존 label 기반 검색 제목, 기존 meta_description, Open Graph 6개 필드를 출력하고 같은 승인 필터로 sitemap과 robots.txt를 생성합니다. 기존 title 질문·본문·출처·다운로드·JSON-LD 날짜와 정책/pin은 유지합니다. 연결된 승인 대표 이미지가 없으므로 og:image는 보류합니다. label만으로 재난·통신 문맥이 불명확한 K-007 ‘정보 상태 인계’와 K-009 ‘역할·권한 분담’은 향후 편집 후보이며 이번 단계에서 원문을 수정하지 않습니다.

- Production: https://survival-diary-archive.netlify.app
- 제출 대상: https://survival-diary-archive.netlify.app/sitemap.xml
- 대표 글: https://survival-diary-archive.netlify.app/knowledge/emergency-supplies-inventory/
- 대표 글: https://survival-diary-archive.netlify.app/knowledge/family-emergency-contact-plan/
- 대표 글: https://survival-diary-archive.netlify.app/knowledge/apartment-power-outage-scope-check/
- 기존 인증 흔적: main의 HTML/공개 파일에서 Google·네이버 소유확인 태그·파일을 발견하지 못함. 계정 등록/소유권은 미확인(미등록이라고 단정하지 않음). 실제 인증값이나 placeholder는 추가하지 않음.
- 상태를 각각 기록: 코드 구현 / main 병합 / 공개 배포 / 소유권 인증 / sitemap 제출 / 실제 색인. 구현·검사 성공은 색인·순위·리치 결과 보장이 아님.

배포 환경: Production에는 전역 noindex를 추가하지 않습니다. Deploy Preview는 Netlify의 기존 X-Robots-Tag: noindex를 재사용합니다. main--survival-diary-archive는 deploy-meta에서 현재 Production과 동일한 context/commit/build_id인 Production alias로 확인됐습니다. 별도 branch-deploy로 오인해 noindex를 추가하지 않습니다. 설정된 테스트 branch codex/archive-image-attempt-ref는 Netlify 목록에 배포 기록이 없어 실제 응답은 NOT_VERIFIED이며, 확인되지 않은 누락을 추정해 공통 헤더를 추가하지 않습니다. 기존 /operator* noindex·인증·CSP는 유지합니다. 현재 /?view=operator는 운영자 진입이 아니라 공개 홈으로 정규화되고, 실제 운영자 진입은 /operator/ 및 하위 경로입니다. Wiki/Reader/RAW 쿼리의 공개 정책을 바꾸지 않습니다.

정상 Production 배포 후: robots 200/text/plain와 Production origin Sitemap 줄, sitemap 200/XML·URL 집합, 목록/대표 상세 200, 없는 slug 404, 유일한 title/description/canonical·OG·JSON-LD, 공개 noindex 부재, Operator 로그인/noindex, 기존 preview 호환 이동과 다운로드·media CSP를 실제 응답으로 확인합니다. 실제 공개 영상 재생은 합성 미디어 렌더링 검사와 별도입니다. 향후 별도 테스트 branch가 실제 사용되면 정확한 context와 alias 응답의 noindex를 확인하고 누락된 경우에만 별도 보완합니다. Production 강제 배포와 release marker 변경은 하지 않습니다.

STEP 2B에서 계정 담당자가 확인할 사항: 기존 Google Search Console/네이버 서치어드바이저 속성·소유권·기존 인증 방식, Production 배포 반영, sitemap 처리 상태·제출 이력, 대표 URL canonical/수집/색인 상태. 계정 로그인·속성 생성·소유권 변경·제출·색인 요청·DNS 작업은 이번 STEP 2A에서 수행하지 않습니다.
