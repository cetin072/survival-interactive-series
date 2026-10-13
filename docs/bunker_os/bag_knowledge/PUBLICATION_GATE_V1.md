# 생존가방 물품지식 — 게시 연결 게이트 V1

- 작성: 2026-10-13
- 기준: 병합 완료 [PR #535](https://github.com/cetin072/survival-interactive-series/pull/535), main SHA `454cedc1085aa100122f3904d3c7c54ddab74e2f`
- 다음 작업: **독자용 정적 페이지 변환기와 Preview QA 설계·구현**. 사용자 개별 발행 승인 전 Production 공개 불가.
- 원고 집필 작업공간: 기존 Draft [PR #525](https://github.com/cetin072/survival-interactive-series/pull/525). 기존 대기 목록과 집필 정책 유지.

## 결정 — 문서 병합과 웹사이트 공개 분리

8편(guide-01~07, guide-43)의 원고와 집필 템플릿은 `docs/bunker_os/bag_knowledge/`의 Markdown 자료로 `main`에 보관했다. **이는 사용자 웹사이트 게시 승인이 아니다.**

실제 사이트 `/knowledge/`의 현재 페이지는 `archive/scripts/build-knowledge.mjs`, `archive/web/render-knowledge.mjs`, `archive/web/public/knowledge/`의 검증된 정적 게시 방식을 사용한다. 생존가방 물품지식은 이 기존 디자인/빌드 체계와 어울리도록 만든다. Automation C의 기존 페이지, 인덱스 및 sitemap을 무작정 덮어쓰지 않는다.

## V1 구현 목표

1. 원고와 화면 분리: 원고 Markdown/front matter는 편집 원본이며, 최종 방문자 HTML은 **승인된 내용만** 명시적으로 가공한 별도 정적 산출물이다.
2. 최초에는 **Preview에서만** guide-01 한 편을 변환해 디자인과 개인정보·검수 상태 비노출을 확인한다. 검증 후 8편으로 확대한다. 메인/Production 빌드에서는 사용자 게시 승인 없으면 어떤 생존가방 물품지식 상세 페이지도 생성하지 않는다.
3. 공개 시 URL은 안정적인 `catalogId`를 통해 확정하고, 예: `/knowledge/bag/waterproof-document-pouch/` (후보 경로; 확정 전 공개 링크로 쓰지 않음). 임의 문자열/품명으로 경로를 추측하지 않는다.
4. 독자에게 보일 항목: 제목, 바로 답하는 핵심 문장, 실제 활용/선택/보관/주의/30초 점검, 검증된 관련 생존지식, **이미 게시된** 관련 물품 링크, 공식 자료, 독자에게 유용한 자료 확인일.
5. 독자에게 보이면 안 되는 항목: 원고 front matter 원문, `DRAFT_...`, `reviewedAt`, `sourceReview`, `linkReview`, `guide-XX` 내부키 표시, `Automation C` 개발명칭, 미게시 후보 ID, 원고 작업 로그, 검수자 메모, '앱 복귀 개발 예정' 같은 문구. 내부키는 동작 데이터로만 사용하고 HTML 본문에 그대로 출력하지 않는다.
6. 링크: Automation C 공개 URL은 실제 존재 확인된 경우만, 관련 물품 상세 링크는 **그 물품의 공개 승인/실제 생성 여부가 모두 확인된 경우에만** 출력. 앱 복귀는 기존 `/bag-lab/alpha.html`의 실제 안전한 접근 경로를 검증한 뒤 연결한다. 저장·편집 중인 IndexedDB 기록을 손상시키거나 강제 저장하지 않는다.
7. 안전: 중대한 안전·법률 주의는 게시 과정에서 제거하지 않는다. 원고의 허구 사례나 사용자의 개인정보는 공개 문서에 추가하지 않는다.
8. SEO: Preview는 noindex/nofollow 및 비공개로 오인되지 않는 표시. 본 공개 전에는 sitemap/홈페이지 소개 카드/검색 인덱스에 추가 금지. 실제 발행 승인 후 공개 상태로 전환하는 것은 별도 게이트.
9. 기술: **Static by Default**, 기존 지식 페이지 렌더러·CSS·빌드 검증 재사용. 새 DB, 로그인, 유료 API, 독립 예약, 대규모 프레임워크 도입 금지.
10. 운영: 기존 `main` Production은 release-marker 기반 약 48시간 배치 정책이다. Preview 변경이나 단순 `main` 병합을 이유로 marker 발행·강제 배포하지 않는다.

## 발행 승인 계약 (사람 승인만)

`원고가 main에 존재`, `CONTENT_PASS`, `LIGHT_REVIEW_PASS`, `사용자가 내용을 읽음`은 **게시 승인 신호가 아니다**.

실제 출판 허용은 개별 원고에 대해 다음 전체가 충족될 때만:
- (a) 사용자의 해당 글 **발행 승인**
- (b) 변경 없는 정확한 원고 SHA 및 동일 catalogId/slug
- (c) 공식 근거와 내부 링크의 게시 직전 유효성·내용 확인
- (d) 내부 상태/편집 기록·미게시 링크 비노출 회귀
- (e) 모바일 320/390px 및 데스크톱, 뒤로 가기·기존 가방 기록 보존
- (f) 동일 게시 배치의 CI/Preview PASS

권한 없는 상태에서 `PUBLISHED`/게시 manifest를 자동으로 지정하지 말 것. 지식 자동화 C의 사람 승인 및 공개 처리를 그대로 대체하지 않는다.

## 구현 순서 / 완료 기준

- **Stage P1 — Preview-only:** 기존 정적 지식 렌더링/디자인 탐색 → guide-01 단일 페이지 → 원고 데이터 비노출 검사 → 고정 Preview에서 모바일/링크 QA. Preview는 공개 URL일 수 있으므로 noindex를 인증으로 취급하지 않는다.
- **Stage P2 — 8편 확장:** 같은 변환/검증 로직을 8편 모두 재사용. 미게시 후보는 숨김, 공개된 생존지식은 실제 URL로 연결. 현재 앱/프리셋/재고 로직 불변.
- **Stage P3 — 개인별 발행:** 승인 manifest 또는 동등한 결정적 게이트에 정확한 품목·원본 SHA·승인 증거를 묶는다. 승인 없으면 Production output=0. 사용자 별도 게시 승인 전 P3 실행 금지.
- **Stage P4 — 다음 41편:** 집필 DRAFT → 검수 → 사용자 승인 → 게시 페이지 자동 추가. 대기 최대 6편 및 `DRAFT_QUEUE_V1.json`을 작업 큐로 유지한다.

**완료 보고 최소 요건:** 정확한 branch/PR/HEAD, 생성된 Preview HTML 실제 경로, 비노출·URL·가방 기록 보존 결과, 기존 13개 공개 현실 생존지식 회귀, 자동 Production 게시 0건 증거, 남은 승인 게이트.

## PR 운영

새 개편 PR을 무더기로 만들지 않는다. 웹 개발은 기존 앱 #516/#526/#528/#530의 의존관계를 확인하고 통합 시점에 가장 작은 후속 작업 단위로 시행한다. #525는 글/검수/집필 큐의 단일 작업공간을 유지하며, 무작정 `main`으로 병합하거나 종료하지 않는다.
