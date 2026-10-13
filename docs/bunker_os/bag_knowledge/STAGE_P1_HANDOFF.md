# 물품지식 Stage P1 — guide-01 정적 Preview

2026-10-13 KST · Draft [PR #537](https://github.com/cetin072/survival-interactive-series/pull/537) · branch `codex/bag-knowledge-p1`

## 구현 경계

- main 기준 `454cedc1085aa100122f3904d3c7c54ddab74e2f`의 guide-01 한 편만 사용한다. 원고 Git blob `da7e95077e71663f5e47df52efa207afaf008f1c`, LF 원본 SHA256 `6f33dd7d5b8d0bc613318ae8ef98eae60f3aaf68c2de15944b8340c6853f72d4`와 ID/slug를 고정한다. 내용 변경 시 Preview도 실패한다.
- #525는 집필, #536은 앱 통합 범위로 유지한다. #536의 `bag-item-article.mjs` 변환을 좁혀 재사용하고, 앱 catalog 의존·복귀 링크·8편 queue를 제거했다. 기존 `/knowledge/knowledge.css`와 article/header/section 스타일을 그대로 사용한다. 새 패키지·DB·앱 코드는 없다.
- 최종 생성 파일: `archive/web/dist/knowledge/bag/waterproof-document-pouch/index.html`. public/에는 원고나 물품 페이지를 저장하지 않는다. 기본/Production/알 수 없는 context는 0건, Production에서 `BAG_KNOWLEDGE_PREVIEW=1`도 0건이다. 마지막 빌드 단계가 오래된 `dist/knowledge/bag/`도 제거하고, public/ 우회 파일이 있으면 실패한다. P1에는 Production 발행 경로 자체가 없다.
- 생성 허용: `CONTEXT=deploy-preview`, 정확히 `CONTEXT=branch-deploy` + `BRANCH=qa-bag-side`, 또는 context 없는 로컬 `BAG_KNOWLEDGE_PREVIEW=1`.
- 미리보기 안내·robots meta·`X-Robots-Tag: noindex, nofollow, noarchive`를 제공한다. 이 URL은 인터넷에서 열릴 수 있다. 인증/비공개 페이지로 표시하지 않는다. sitemap/검색/목차/홈페이지에는 추가하지 않았다.
- 제목·즉답·생활 활용·선택·보관·안전 주의·30초 점검·공개 관련 지식·공식 자료·원고 자료 확인일만 출력한다. front matter, 내부 ID, DRAFT, 검수/편집 기록, 미게시 후보와 복귀 버튼은 HTML 전체에서 제외한다.
- 앱·카탈로그·Automation A/B/C·운영 DB·release marker·Production 정책은 수정하지 않았다. 공통 Archive CI에 P1 계약 테스트 한 단계만 추가했다.

## 검증

| 검사 | 결과 |
|---|---|
| P1 계약 테스트 | PASS 3/3: 원고 변경 차단, 비노출/안전문구, 위험 URL, 미생성 관련 링크 차단, 단일 Preview, Production opt-in 거부와 stale 페이지 제거 |
| 기존 `npm run knowledge:test` | PASS 65/65: 기존 13편·SEO·index·sitemap·공개 경계 포함 |
| `npm run build:verified` | PASS: 기존 Reader/지식 검증·TypeScript·Vite·산출물 공개 경계; 기본 빌드 물품 output=0 |
| Production 명시 실행 | PASS: `CONTEXT=production BAG_KNOWLEDGE_PREVIEW=1`에서도 pages=0, 생성 subtree 없음 |
| 실제 Edge 320/390/1280px | PASS: 가로 넘침 없음, 관련 지식 클릭·뒤로 가기, 독립 브라우저 context의 가상 localStorage/IndexedDB 보존 |
| Netlify PR Preview | 실제 HTTP 200·noindex header·3개 폭·13편 기존 지식 HTTP/제목 확인. 최종 HEAD/배포 ID/CI 결과는 PR 검증 댓글에 기록 |
| 원고 비노출 | PASS: HTML 전체 계약 검사 + 실제 독자 본문 검사. 앱 복귀·미게시 물품 링크 없음 |
| 관련 생존지식 | `/knowledge/emergency-supplies-inventory/`의 생성된 파일, 실제 Preview HTTP 200·제목·클릭/복귀 확인 |
| 공식 근거 | 2026-10-13 두 원문 재확인: 국민안전24 생존배낭의 중요 서류·가족 비상연락카드, 미국 적십자사 개인 문서 사본·가족/비상 연락정보. 제품 인증/방수 성능으로 확대하지 않음 |

화면 증거는 로컬 `archive/reports/bag-knowledge-p1/{320,390,1280}.png`와 `browser.json`에 생성한다. 사용자 실제 재고/기록에는 접근하지 않았다. 앱 복귀가 없으므로 실제 앱 왕복 통합 QA는 P1 범위에 포함하지 않으며 이후 구현 시 별도 검증이 필요하다.

Windows 작업 복사본의 CRLF 때문에 기존 원본 해시 검증이 실패했다. 사용자 수정이 없고 LF 정규화 결과가 Git 원본과 정확히 일치하는 대상만 대조 후 검증했다. 원본/Canon/검증 기준을 변경하거나 PR에 포함하지 않았다.

## 재현

```sh
node --test archive/scripts/lib/bag-knowledge-p1.test.mjs
cd archive/web
npm run knowledge:test
npm run build:verified
# 로컬 확인은 context 없이 BAG_KNOWLEDGE_PREVIEW=1로 같은 build 실행
# Production 확인은 CONTEXT=production BAG_KNOWLEDGE_PREVIEW=1로 같은 build 실행
```

브라우저 검증: Playwright가 설치된 환경에서 `node archive/scripts/check-bag-knowledge-p1.mjs`. 외부 URL은 `BAG_P1_BASE_URL`과 정확한 `BAG_P1_EXPECTED_SHA`가 필수이며 `/deploy-meta.json`의 Netlify/deploy-preview/commit_ref를 확인한다. 기존 runtime package 경로는 `PLAYWRIGHT_MODULE_DIR`, 설치된 Edge 사용은 `PLAYWRIGHT_CHANNEL=msedge`로 지정할 수 있다. 테스트 도구 때문에 앱 패키지 의존성을 추가하지 않았다.

## 고정 QA와 남은 게이트

- PR별 [Preview](https://deploy-preview-537--survival-diary-archive.netlify.app/knowledge/bag/waterproof-document-pouch/)에서 검증한다.
- 고정 `qa-bag-side`는 #536 HEAD `dc6954615e54fa532db5cad434805110015a7100`, 공용 `qa-preview`는 `fa8d742bcfbb1db2af759a760462d7c2364eae56`였다. 둘 다 P1으로 fast-forward할 수 없다. 기존 검수 대상을 덮어쓰거나 통합 PR을 섞지 않았다. **P1 고정 QA 승격은 미실행/REVIEW**다. 필요하면 공유 대상 변경에 대한 명시 승인과 lease가 선행되어야 한다(`FIXED_QA_PREVIEW.md`).
- guide-01의 사용자 **발행 승인**, 정확한 원고/ID/slug에 묶인 승인 증거, 게시 직전 공식 근거·내부 URL 재확인, 같은 배치 CI/모바일 Preview 승인, 통제된 P3 발행 구현 및 기존 release-marker 절차가 남아 있다.
- main 병합·Ready 전환·Production 배포는 실행하지 않았다.
