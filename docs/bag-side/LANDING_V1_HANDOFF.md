# BAG-SIDE-01 · Stage 4 랜딩 V1

Stage 4만의 완료 보고와 1.0 통합 인계. main 병합·Production 공개·1.0 출시 승인이 아니다.

## 기준과 변경 범위

- #516 Draft의 HEAD `7837b3deca5e2db29775fcc327ff6864a7145b6f`에서 독립 `feat/bag-side-01-landing-v1` 분기.
- `/bag/` 정적 HTML + 전용 CSS, JS·외부 자산·새 의존성 없음. Alpha의 네이비/오렌지, SVG 아이콘과 CSS 가방을 재사용.
- 홈 `WikiHomePreview`의 바로 쓰는 자료 다음에 소개 카드 한 개. 검색·생존지식·이야기·세계관 메뉴는 기존 경로 유지.
- 별도 랜딩 검사·전용 CI만 추가. bag-lab 구현/저장 스키마/프리셋/알림/물품 지식 매핑/Automation C/운영 DB/업무수첩은 수정하지 않음.
- `qa-preview`, `qa-bag-side`, Netlify 설정, robots.txt, sitemap.xml, release marker는 변경하지 않음.

## 경로와 표현 계약

- 실제 기록 CTA: `/bag-lab/alpha.html`. 기록은 브라우저 IndexedDB; JSON 백업 경로 안내. 기기/브라우저/origin별 저장, 데이터 삭제·기기 교체 시 백업 필요.
- 샘플 시연: `/bag-lab/`. 저장 없는 가상 시연임을 구분.
- 프리셋 링크는 Alpha만 연다. 사용자가 앱의 추천 구성에서 선택하며 URL 파라미터·자동 적용·재고 변경 없음.
- 경량 19종/참고 10kg, 표준 29종/참고 15kg, 확장 39종/참고 18kg. `presets.mjs`와 계약 테스트로 일치 검증. 무게는 실측·권장 운반량이 아니며 성인 1인 시작 예시.
- 공개 지식 `/knowledge/emergency-supplies-inventory/`와 `/knowledge/`는 2026-10-12 live fetch에서 HTTP 200과 실제 제목/본문 확인. 앱 화면 모형의 수량은 대시이며 화면 구성 예시로 표시.
- 이 브랜치의 #516 Alpha에는 기기 알림 없음. 설치·알림은 별도 시험 중이며 Android 정식 출시·클라우드 백업·안전 보장을 주장하지 않음.

## 검수 재현

```sh
npm ci --prefix archive/web
npm run build:verified --prefix archive/web
node --test archive/scripts/lib/bag-landing.test.mjs archive/scripts/lib/bag-side-*.test.mjs
python archive/scripts/check-bag-landing.py
```

- 기존 Playwright를 사용. 320/390/768/1280px, 200 응답, 모든 랜딩 내부 링크, 핵심 CTA, h1/heading 순서, SVG, 키보드 FAQ/포커스, 가로 넘침, 프리셋 진입, 기록 보존, 홈 검색/4개 메뉴/기존 지식과 이야기 검증.
- 별도 CI `BAG Stage 4 landing acceptance`는 실제 #516 before build와 변경 후 build를 검수. 이전 랜딩은 존재하지 않으므로 404 화면을 기준으로 남긴다. 홈페이지 before/after, 랜딩 전체·첫 화면을 `bag-stage4-review-<HEAD>` artifact로 14일 보관.
- CI는 정확한 PR HEAD를 checkout하고 `/deploy-meta.json`의 commit_ref/context 일치와 Preview의 HTTP noindex를 확인한 뒤 같은 브라우저 검사를 실행한다. 합성 새 브라우저 컨텍스트만 사용하며 운영 사용자 기록을 읽거나 수정하지 않는다.
- 기존 Demo·Alpha·Preset 브라우저 회귀와 모델 검사를 함께 실행. 로컬 결과와 CI/Preview 결과는 최종 PR 본문에 확정 기록한다.

## SEO와 출시 경계

- title/description/한국어 lang/OG 텍스트, canonical 후보 `https://survival-diary-archive.netlify.app/bag/`. 확인된 공유 이미지가 없어 og:image 생략.
- 랜딩 meta `noindex,nofollow,noarchive`를 1.0 출시 승인 전 유지. 기존 Netlify Deploy Preview의 X-Robots-Tag noindex도 실제 검사. 공개 Production 배포·색인 활성화 없음.
- canonical은 최종 URL 승인 전 후보이며 Production 라우팅을 만들거나 확정하지 않는다.

## Stage 3·Stage 1/2 및 1.0 통합

1. #516 prerequisite와 다른 Stage 변경을 통합한 뒤 최종 앱 URL을 별도 검증. 랜딩 HTML의 Alpha CTA 전체와 계약/브라우저 테스트를 함께 변경한다.
2. Stage 3은 승인·게시 검증된 물품 지식만 연결. 기존 공개 지식 링크를 유지하고 미게시 글 URL을 랜딩에 추가하지 않는다.
3. PWA·알림 통합 HEAD에서 설치/점검 알림 실제 범위에 맞춰 FAQ를 갱신. Android 기기 전달·재부팅 미검증이면 시험 상태를 유지한다.
4. `/bag/` 랜딩은 `/bag-lab/` PWA scope 밖의 소개 페이지로 유지. 알림·재고 모듈을 랜딩에 가져오지 않는다. 전체 PWA cohort 재생성, Android web sync, 다중 탭·편집·충돌·오프라인 update, 지식 열기/돌아오기와 origin별 데이터 보존은 통합본에서 다시 검증한다.
5. 사용자 1.0 출시 승인 후 별도 통합에서 canonical/OG URL·Production `/bag/`·앱 경로·모든 CTA·SEO 검사. sitemap 등록과 색인 활성화(meta noindex 해제)는 독립 승인/검증 항목이다. 기존 release-marker와 Production 정책을 따른다.
