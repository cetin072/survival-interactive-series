# 생존일기 SEO V1

판정: PARTIAL. 홈 검색 접근성 구현·로컬 검증 완료. 검색엔진 계정 소유확인·색인 성과는 미확인이다. 관련 #491 / #500. 점검일 2026-10-14 KST.

기준 main: `e8ddc20955e7fede3ce52f9c557b816554c554e7`. Production: `e38a11c9f9e3f58877752f324a379c8f2b199daf`, Netlify deploy `6acbde846e768b0008b04d21` READY (2026-10-12 04:08 KST 공개). main과 Production은 다르다. 기존 2일 release-marker 정책을 유지한다.

## 변경 전 실제 HTTP 기준선

| 경로 | 상태 | 최초 HTML / 메타 | Sitemap / 색인 경계 |
| --- | --- | --- | --- |
| `/` | 200 | title/description 있음. H1·본문·지식 링크·canonical·OG 없음 | 포함, noindex 없음 |
| `/knowledge/` | 200 | H1·정적 목록·고유 title/description/canonical/OG 있음 | 포함 |
| `/knowledge/apartment-power-outage-scope-check/` | 200 | 정적 본문·제목·canonical 있음 | 포함 |
| `/knowledge/emergency-supplies-inventory/` | 200 | 정적 본문·제목·canonical 있음 | 포함 |
| `/knowledge/family-emergency-contact-plan/` | 200 | 정적 본문·제목·canonical 있음 | 포함 |
| `/bag/` | 404 | Netlify 404 | Production sitemap에 없음. 별도 개발 범위 |
| `/sitemap.xml` | 200 | Production 홈·서가·공개 지식 11개 = 13 URL | main 홈·서가·가방·공개 지식 15개 = 18 URL |
| `/robots.txt` | 200 | `Allow: /`, Production sitemap 주소 정상 | JS/CSS 차단 없음 |
| `/operator/` | 200 | 기존 빈 SPA HTML | `X-Robots-Tag: noindex, nofollow, noarchive`, sitemap 제외 |

Production 대표 3편은 기존 승인된 본문을 제공한다. 전체 Production 콘텐츠와 approval receipt의 완전 일치, 실제 iOS/Android 기기 및 검색엔진 계정 보고서는 미확인이다. 오류 응답을 이전 요청의 200으로 오인하지 않도록 `/bag/`는 HTTP 오류 응답도 별도 확인했다.

## 개선 방식

- 기존 build-only `render-knowledge.mjs`와 `WikiHomePreview`를 재사용해 `dist/index.html`에 실제 홈을 렌더링한다. 승인 재검증된 `virtual:knowledge-public` 투영을 사용한다. 새 서버·의존성은 없다.
- 홈은 `hydrateRoot`로 기존 본문에 동작을 연결한다. 동일한 컴포넌트/선정 순서/링크를 사용하며 숨긴 키워드나 중복 본문이 없다.
- 홈의 title·description·canonical·OG를 검수·보강한다. 승인된 대표 이미지가 없어 OG 이미지는 추가하지 않는다. 홈 구조화 데이터도 추가하지 않는다.
- Netlify는 `?view=...`와 `/operator/*`를 별도 `client.html`로 rewrite한다. 이 HTML에는 홈 본문·canonical·OG가 없으며 noindex를 포함한다. 기존 쿼리 URL과 router를 보존한다. 동기 head bootstrap은 다른 호스트에서도 홈이 잠깐 표시되는 것을 방지한다.
- 기존 공개 글·Evidence·승인 이력·slug·개별 canonical·sitemap·robots·Automation A/A-Wiki/B/C·release marker·생존가방 코드는 변경하지 않는다.

## 대표 3편 편집 검수

검색 의도와 문서 구성 확인이며, 현실 행동요령의 최신 유효성을 새로 인증한 것이 아니다. 원본 및 원래 근거 확인일을 보존했다.

| 글 | 현재 적합성 | 출처 / 확인일 | 미적용 편집 제안 |
| --- | --- | --- | --- |
| K-014 정전 범위 | 질문/제목/첫 해결 섹션 일치. 순서·한계를 소제목으로 찾을 수 있음. K-002 연결 | 국민안전24·해외 공공기관 보조자료 / 2026-10-04 | 경험 도입 앞에 짧은 답변을 둘지 사람 편집 검토. 고위험 전기 행동은 승인 경로로만 개정 |
| K-002 비상용품 관리 | 품목·수량·위치·유효기간·점검일 표, 관리표 다운로드, K-003 연결 | 국민안전24·CDC / 2026-09-27 | 자체 관리 제안과 공식 기준은 이미 구분됨. CTA 위치는 별도 실험 후보 |
| K-003 가족 비상연락 | 연락처·만남·역할 질문에 답하고 다섯 항목 표 제공. K-002·이야기 연결 | 국민안전24 비상대비·산불 / 2026-09-27 | 한 장 작성 자료는 현재 없음. 없는 다운로드를 약속하지 않음 |

경험·작품 예시와 공식 행동 근거는 구분되어 있다. 이번 SEO 점검일로 근거 확인일을 부풀리지 않았다.

## Sitemap·게시 검수

기존 `build-knowledge.mjs`는 `publicBriefs` 승인 게이트와 동일한 목록으로 HTML·서가·sitemap을 생성한다. `PUBLISHED`만으로 승인 조건을 우회하지 못한다. 기존 테스트는 미공개 제외·새 공개 글 연결·중복 URL·원본 slug/canonical·operator/preview 제외를 검증한다. 의미 없는 `lastmod`는 추가하지 않았다.

## 검증

- React 210/210, 최종 Knowledge 67/67 PASS (새 홈 SEO 2개 포함).
- 추가 홈 SEO 2/2 PASS: 승인 투영의 실제 링크, 결정적 렌더, 쿼리/운영자 bootstrap.
- `build:verified` PASS: Reader, Knowledge 생성 일치, TypeScript, Vite, 공개 경계 scanner.
- `check-home-seo-browser.mjs`: 모바일 390px / 데스크톱 1440px / JS 비활성 / hydration·중복 H1·overflow·대표 링크·Reader/Wiki·operator 진입을 검사한다. 실행 결과는 PR에 기록.
- 실제 계정 로그인 완료/권한별 데이터 접근은 미실행. 로컬은 인증 환경변수 부재의 설정 필요 화면까지 검증. 기존 인증·RLS 변경 없음.
- Draft PR #551의 첫 구현 HEAD `5c1542bd887eee169a1cb69ef138facb3d3b3724`, Preview deploy `6ace4adbe2a084eb76efb234` READY. 실제 홈·대표 지식 3편·서가·sitemap·robots·operator HTTP 200. 홈 H1/정적 본문/canonical, query URL의 홈 canonical/본문 부재, 모든 Preview 응답의 noindex 확인. 기존 CI build/browser/knowledge/metadata/discovery/validate/model-test PASS. 최종 HEAD 검수 결과는 PR 댓글에 추가한다.
- Preview의 Netlify 도구막대 iframe은 기존 CSP에 차단되므로 경고를 별도 집계한다. 앱 런타임 오류/하이드레이션 오류/정상 앱 자산 HTTP 오류는 실패로 처리한다. CSP 완화 없음. 보조 survival-zero-ai-test Preview는 CANCELED이며 성공으로 집계하지 않는다.

## USER_ACTION_REQUIRED — Google

- 소유권: 계정 내부 미확인. HTML에 인증 태그가 없다는 사실만으로 미등록이라고 단정하지 않는다.
- 이유: 실제 색인·노출·클릭 확인에는 소유권 필요.
- 접속: https://search.google.com/search-console/
- 메뉴: 속성 추가 → URL 접두어 → `https://survival-diary-archive.netlify.app/` → HTML 파일 또는 HTML 태그 소유권 확인. 실제 발급값만 사용.
- Codex: 발급된 공개 파일/태그의 Draft PR 및 HTTP 검증 가능. 비밀번호·쿠키·인증 세션 요구/저장 없음.
- 완료 검증: 계정에서 소유확인 성공. 정기 배포 후 Sitemaps에 `sitemap.xml` 제출, URL 검사에서 홈·서가·대표 3편의 실시간 테스트/색인 확인.

## USER_ACTION_REQUIRED — 네이버

- 소유권: 미확인. 사이트 진단·수집·색인 결과를 확인하기 위해 필요.
- 접속: https://searchadvisor.naver.com/
- 메뉴: 웹마스터 도구 → 사이트 등록 → `https://survival-diary-archive.netlify.app` → HTML 파일 업로드 또는 HTML 태그 소유확인.
- Codex: 실제 발급 파일/태그 적용과 공개 응답 검증 가능. 계정 작업을 완료했다고 주장하지 않는다.
- 완료 검증: 소유확인 성공 → 요청 → 사이트맵 제출 → `https://survival-diary-archive.netlify.app/sitemap.xml`, 대표 URL 수집 요청 및 검증/진단 결과 확인.

## 추후 성과 검증

정기 배포 뒤 SHA·홈 최초 HTML·query rewrite·operator noindex를 재확인한다. 등록일/배포일 기준 2~4주 간격으로 Google 페이지별 노출·클릭·검색어·색인 제외 사유와 네이버 수집/색인 결과를 비교한다. 제출 자체를 색인 성공이나 순위 상승으로 보고하지 않는다. 새 추적 코드·유료 분석 서비스·예약은 없다.

근거: [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Google 소유확인](https://support.google.com/webmasters/answer/9008080), [네이버 JavaScript SEO](https://searchadvisor.naver.com/guide/seo-advanced-javascript).
