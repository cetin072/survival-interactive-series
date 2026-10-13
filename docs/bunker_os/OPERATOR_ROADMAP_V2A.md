# 운영자 로드맵 V2-A — 빌드·정식 사이트 증거 구분

기준 2026-10-13. 기존 운영자 로드맵 V1과 A/A-Wiki/B/C 자동화 전광판은 유지한다.

## 목표
사용자가 반복해서 "지금 어디까지 왔나" 질문하지 않아도 **무엇을 실제로 만들고(HTML 산출물 존재), 현재 어느 배포에서 볼 수 있는지** 스스로 확인한다. 실제 사용자 행동/수익/벙커 실물화는 산출물과 별개다.

## 사용한 기존 자산

1. Netlify 빌드: \`archive/web/dist\`의 **실제 출력물**만 검사.
2. 기존 \`dist/deploy-meta.json\`: \`context + commit_ref\`.
3. 기존 \`public/release/production.json\`: 2일 release marker 정책의 배포 정보.
4. 로그인된 Operator 화면: 같은 출처의 \`/operator-roadmap-evidence.json\`을 \`cache:'no-store'\`로 가져오며, 기존 Supabase \`archive_operator_bunker_os_logs\`에 의존하던 전략 단계는 별도로 그대로 유지.

## 새 산출물 계약

빌드 후 \`archive/scripts/build-operator-roadmap-evidence.mjs\`가 \`dist/operator-roadmap-evidence.json\` 생성. 새 CMS/DB/API/예약/키 없음. 공개 가능한 파일 경로 존재·페이지 수만 노출하고 개인 데이터·Bunker OS 비공개 로그는 포함하지 않는다.

- \`knowledge/index.html\`: 지식 홈
- \`knowledge/<slug>/index.html\`: 독립 본문 공개 산출물 수(미게시 Draft/Preview-only 제외, \`bag/\`, \`downloads/\` 제외)
- \`bag/index.html\`: 생존가방 소개 랜딩
- \`bag-lab/alpha.html\`: 웹앱 화면
- \`bag-lab/manifest.webmanifest\`: PWA manifest 존재(장기 운영 OS 알림 신뢰성을 의미하지 않음)
- \`knowledge/bag/<slug>/index.html\`: 실제 공개용으로 **빌드된** 개별 물품 지식 수. 승인되지 않은 원고·Preview만의 초안은 포함하지 않는다.

## 평가: 증거 등급

- **빌드 자체 검증**: dist 파일이 생겼는가. 코드 파일과 GitHub PR 존재는 합산하지 않는다.
- **Preview 상태**: Netlify Preview/QA 도메인에서 manifest와 deploy-meta의 커밋·context가 서로 정확히 일치하면 "검수 빌드 확인".
- **Production 상태**: 공식 도메인의 Production 컨텍스트, commit identity 일치 및 기존 release marker 형식/정책이 확인되면 "정식 사이트 빌드 확인". 파일이 실제 배포됐다는 뜻일 뿐 search indexing·완성 기능·사용자 행동은 증명하지 않는다. 릴리스 마커의 source SHA와 현재 빌드 커밋 사이의 Git ancestry는 별도로 검증할 향후 계약.
- **불일치·JSON 오류·권한 문제**: 무조건 "조회 필요". 행위나 콘텐츠를 삭제하지 않는다.
- **실제 유효 행동 E-001**: 아직 집계 미연결. 파일 개수/페이지뷰/클릭을 실제 준비 행동으로 변환하지 않는다.

### 자동 갱신 주기 및 비용
운영자 화면의 기존 로그인/새로고침에서만 다시 읽는다. 새로운 크론 없음, DB write/DDL 없음, 서비스 롤 키 없음, 무료 기존 Netlify 빌드 재사용.

### 게이트 이후
V2-B 별도 승인: 기존 게시 receipt/승인 큐, GitHub main·CI 및 실제 Production release ancestry, 익명화한 행동 측정 E-001을 각각 검증한 뒤 진짜 전략 Milestone을 자동 승격한다. 단순 PR merge 한 건으로 "사용자가 준비를 마쳤다" 같은 표시는 금지.

### 검증
Node fixture 4개 + Vitest 타입·렌더 테스트, TypeScript + archive build + 기존 Reader/Operator 테스트, Netlify exact-head Deploy Preview. Main merge 및 Production publish는 감독 승인 별도.
