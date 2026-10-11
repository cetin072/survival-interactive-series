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

## BAG-SIDE-01 전용 고정 QA (2026-10-11 추가)

- 기존 공용 `qa-preview`는 **운영자/Bunker OS 검수 전용으로 보존**한다. 생존가방으로 강제 리셋하거나 PR #516을 혼합하지 않는다.
- 생존가방 실사용 검수용 **별도 브랜치 `qa-bag-side`**를 허용한다. 예상 주소 구조: `https://qa-bag-side--survival-diary-archive.netlify.app/bag-lab/alpha.html`. 실제 배포 확인 전에는 유효한 QA 주소라고 안내하지 않는다.
- Netlify 기존 프로젝트의 **Branch Deploys → Let me add individual branches**에서 기존 `qa-preview`를 **삭제하지 않고** `qa-bag-side` 한 개를 추가한다. All branches 사용 금지. 새 Netlify 프로젝트·유료 API·새 예약 금지.
- `[context.qa-bag-side]`는 `build:verified`와 `qa-noindex.headers` 복사를 재사용한다. 실제 HTTP 200, 번들/탭/실물등록·로컬 저장·백업·복원과 `X-Robots-Tag: noindex`, exact QA deploy SHA 확인이 모두 필요하다.
- 새 PR의 HEAD와 이전 QA HEAD, 필수 CI를 먼저 읽는다. **필수 CI + PR Preview PASS 후 QA 브랜치가 fast-forward 가능한 경우에만** QA 승격한다. 충돌하면 승인 없는 강제 업데이트/운영 PR 합치기 금지. QA 배포는 **사람이 체험해야 할 묶음 단위**로만 수행해 불필요한 Netlify 크레딧 사용을 피한다.
- `qa-bag-side`는 **같은 주소(origin)**를 유지하므로 그 안의 IndexedDB 개인 기록도 다음 배포에서 계속 보일 수 있다. 이는 데이터 지속성 보증이 아니며, 앱 스키마 변경·브라우저 초기화 등으로 기록을 잃을 수 있다. 중요한 실재고·가족 정보는 QA에 등록하지 말고 가상 데이터로 시험하고, 필요한 경우 매번 평문 JSON 파일을 직접 확인한다.
- QA는 별도 운영 DB가 아니며 다른 Archive/Operator 화면도 포함할 수 있다. `/operator` 등 운영 변경 버튼을 QA 실험에 사용하지 않는다. 사이트 데이터/계정 정보를 브라우저에서 우회하거나 복사하지 않는다.
- 앱 실사용 단계가 통과하면 **동일 앱 코드를** 기존 main/release-marker 정책을 통해 Production으로 안전하게 승격한다. QA 기록은 Production과 자동 동기화되지 않는다.
- 새 코드 작업에서 PR의 `deploy-preview-NNN`은 CI·정확 버전 비교 용도로 계속 유지한다. 사용자 모바일 검수 링크만 고정 `qa-bag-side`를 사용한다.

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
