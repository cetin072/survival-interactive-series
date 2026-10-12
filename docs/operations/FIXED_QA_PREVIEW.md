# 생존일기 고정 QA Preview — 운영 규칙

검수 주소: **https://qa-preview--survival-diary-archive.netlify.app**

- 기존 Netlify 프로젝트 `survival-diary-archive`의 `qa-preview` branch deploy를 사용한다.
- PR별 `deploy-preview-NNN--survival-diary-archive.netlify.app`는 개발 검증용으로 유지한다.
- **이 문서는 공개 사이트 배포나 결제를 승인하지 않는다.** Production은 기존 2일 release-marker 게이트가 그대로 우선한다.
- 브랜치만 만든 상태와 실제 QA가 준비된 상태를 구분한다. 브랜치 배포가 Netlify에서 비활성화되어 있으면 `QA_BLOCKED_BRANCH_DEPLOY_NOT_ENABLED`이다.

## 최초 설정

1. Netlify의 기존 `survival-diary-archive` 프로젝트에서 **Project configuration → Build & deploy → Continuous deployment → Branches and deploy contexts**의 Branch Deploys를 **`qa-preview` 하나로 제한**해 활성화한다. 새 Netlify 프로젝트를 만들지 않는다.
2. 브랜치 배포가 해당 SHA에서 성공했는지, 공개 URL에서 HTML/JS/내부 링크가 정상인지 확인한다.
3. QA 전용 [context.qa-preview] build는 `qa-noindex.headers`를 배포 산출물의 `_headers`로 복사한다. **`X-Robots-Tag: noindex` 응답 확인은 필수**이다. 이 빌드 명령은 Production에 적용되지 않는다.
4. QA URL은 인터넷에서 열릴 수 있다. Operator 페이지는 로그인과 Supabase 서버 측 권한 검증을 통과해야 하며, 비밀키·비공개 자료가 정적 HTML/JS에 포함되면 안 된다.

## PR을 고정 QA에 올릴 때

1. 현재 검수 중인 PR과 `qa-preview` 브랜치의 사용자가 다른지 확인한다. 한 번에 **한 PR만** 올린다.
2. 해당 PR의 **정확한 HEAD SHA**, 필수 CI 결과, PR별 Netlify Deploy Preview 성공을 확인한다. 오류나 미확인 항목이 있으면 **동기화하지 않는다**.
3. 브랜치 변경 직전에 PR HEAD와 QA 브랜치의 SHA를 다시 확인한다. **fast-forward**가 가능할 때만 변경한다. 다른 PR로 전환 시 non-fast-forward가 필요하면 **공유 검수 대상과 명시 승인**을 받고, GitHub `expected_sha`의 lease로 충돌을 차단한다. 무조건 force push/조용한 PR 혼합 금지.
4. Netlify가 branch deploy로 배포한 **실제 commit SHA가 QA 브랜치와 PR HEAD에 일치**하는지 확인한다. 재배포 실패·구 배포 노출이면 준비 완료라 하지 않는다.
5. 화면 테스트는 대상 기능의 로그인·클릭·목록·상세·새로고침·모바일을 포함하며 URL 200만으로 합격시키지 않는다. 각 PR에 결과를 기록한다.

## 보안 및 DB 경계

- QA branch deploy는 **별도 DB가 아니다.** Supabase 환경 연결을 배포별로 따로 구성했다는 증거가 없다면 QA Operator의 저장·확인 버튼도 실사용 DB를 바꿀 수 있다.
- QA에서 데이터 변경 시험이 필요하면 테스트 전용 레코드/권한을 확인한다. 운영 자료·현금·사용자 계정·민감정보를 시험용으로 만들거나 삭제하지 않는다.
- `qa-preview` 브랜치는 공개 GitHub 브랜치이며 개인 벙커 실제 위치, 태장 민감 인사/급여, 비밀 토큰, 운영 계정 정보를 저장하지 않는다.

## 인계

PR 번호 / PR HEAD / QA branch SHA / Netlify branch deploy ID·SHA / HTTP 및 `X-Robots-Tag` 확인 / 실제 브라우저 검사 / DB 경계 / 남은 승인 여부를 간결하게 보고한다. 브랜치 생성만으로 운영 가능한 고정 Preview라고 주장하지 않는다.
