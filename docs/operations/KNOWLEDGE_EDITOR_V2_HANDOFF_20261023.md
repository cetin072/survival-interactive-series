# 생존지식 편집기 V2 — 작업 중단 및 재개 기록

## 중단 이유와 현재 상태

- 사용자가 2026-10-23에 “마무리 하고 내일 이어서 하자”라고 요청했다. 추가 구현·병합·DB 적용·배포를 중단한다.
- 작업 브랜치: `codex/knowledge-editor-v2`, Draft PR: https://github.com/cetin072/survival-interactive-series/pull/626
- 작업 checkout: `C:\Users\Administrator\.codex\worktrees\knowledge-immediate-human-approval\survival-interactive-series`
- 이 V2 작업의 main 병합, migration 적용, Production 배포는 **하지 않았다**. 전체 완료 판정은 아직 불가하다.
- 사용자 상세 명세: `C:\Users\Administrator\Downloads\codex_knowledge_editor_v2.md`. 요청 1~7과 데이터 보존·실사용 검증 요구가 완료 기준이다.
- 루트 checkout에는 별도 작업 변경이 있다. reset/clean하거나 이 작업에 섞지 않는다.

## 저장한 구현

- 기존 편집기·미리보기·C 소비 workflow·정적 생성기·즉시 공개 확인 경로를 재사용했다.
- 현재 수정본과 연결된 근거/검토를 검사하는 evaluator, 정확한 인용 기반 문제 표시, 저장 후 정확한 수정본 발행 요청을 추가했다.
- 보관 복원, 빈 글감 초안 작성, 변경 충돌 표시, 복구·원문 비교, 목록 필터 유지, 기본 한글 UI를 추가했다.
- `knowledge-editor-request.mjs`에 수정본 검사 → 제한된 변경 PR → exact-head CI → main 재확인 → squash → 기존 release helper → 실제 공개 확인을 구현 중이다.
- 새 migration `20261022163829_knowledge_editor_revision_workflow.sql`은 수정본 이력·요청·감사 이력을 추가하는 방식이다. 원본/실패/승인 기록 삭제는 없다. **미적용**이다.
- workflow concurrency는 기존 정규 Production과 같은 `archive-production-release`로 직렬화했다. 정규 예약 시간은 유지했다.
- 합성 비공개 화면 테스트 `archive/scripts/check-knowledge-editor-browser.py`를 추가했으나 아직 실행 결과를 확인하지 못했다.

## 확인한 테스트와 한계

- 중단 직전 현재 evaluator 단위 테스트 **9/9 PASS**, `git diff --check` 오류 없음(기존 CRLF 정규화 경고만 있음).
- 이전 체크포인트에서 웹 279개, 기존 release/consumer 18개, 타입·빌드·공개 경계 52 probe 통과를 확인했다. 이후 수정이 있으므로 최종 검증으로 재사용하지 않는다.
- 마지막 전체 테스트 실행의 최종 출력은 확보하지 못했다. 최신 전체 웹/타입/runner 테스트를 다시 실행해야 한다.
- PR 최초 head `1816a52d` Preview는 통과했으나 build에는 테스트 기대값 오수정 실패가 있었다. 해당 기대값은 로컬에서 복구했다. 최신 push의 CI/Preview는 재조회해야 한다.
- DB 계약 테스트는 추가했지만 최종 성공 확인 전이다. migration 적용을 먼저 하지 않는다.
- 실제 운영자 로그인은 사용자가 완료했다. 기존 Production 화면을 읽었으며 V2 인증 화면에서 저장/발행을 실제 검증한 것은 아니다.
- V2 실제 Production 발행 테스트는 하지 않았다. 합성 테스트/실제 인증 클릭/Production 결과를 반드시 구분한다.

## 운영 데이터와 다른 작업

- 시작 이후 별도 PR #620 및 자동 복구 PR #622~625가 main에 반영됐다. 마지막 확인한 main은 `4535fdc33738429fa1c53853d15d18b428b228d9`; 재개 시 최신 상태를 다시 읽는다.
- K-040/041/045/046의 DB PUBLISHED는 Git 반영일 수 있다. 실제 Netlify 공개 확인과 동일시하지 않는다.
- 마지막 확인한 Production은 `081ac04d862a8216b05cd04f238b0c3660ae55e4`였다. V2 배포 SHA가 아니다.
- K-015 기존 공개 URL: https://survival-diary-archive.netlify.app/knowledge/emergency-restoration-priorities/
- K-015 기존 승인 revision 1과 현재 main의 작성 내용이 같음을 읽기 전용으로 확인했다. 기존 실패 이력은 유지했다.
- 이 V2 작업에서 실제 원고·승인·수정본을 DB에서 변경하지 않았다. 저장본을 발행 승인으로 간주하지 않는다.
- K-018/025/032 revision 1 및 K-015 원본 비교용 비공개 baseline은 사용자 계정의 로컬 Temp에만 보관했다. 저장소/CI/공유 폴더에 업로드하지 않는다.
- `supabase/.temp/`는 CLI 생성물이다. 커밋하지 않는다.

## 재개 순서와 아직 남은 위험

1. 최신 main, PR #626/열린 PR, DB migration·요청 상태, Netlify Production을 다시 읽는다. 기존 PASS를 전체 완료로 가정하지 않는다.
2. 최신 CI/Preview, 전체 웹·타입·DB 계약·합성 브라우저 테스트(320/390/1280)를 확인하고 실패를 고친다.
3. SQL 권한/RLS, 수정본 CAS, lease·취소·재시도·대기열·감사 트리거와 공개 증명 경계를 검수한다.
4. 복원 시 과거 공개 ID 충돌에 새 ID를 할당해도 slug 충돌이 남을 수 있다. 기존 공개 주소를 바꾸지 않는 신규 정체성 할당이 필요하다.
5. 기존 검토함 승인/보류와 새 요청 이력이 중복 표시되거나 과거 승인 항목이 남는 문제를 확인한다. 이력 삭제로 해결하지 않는다.
6. semantic job이 없는 기존 공개 글도 같은 편집기로 수정 가능한지 아직 해결하지 못했다.
7. 정확한 문제 이동 링크, 오래된 원고 형식(K-038 body_md, K-043/044 문자열 tools), 빈 글감·중복 복원과 공개본 유지 재편집을 전 경로 검증한다.
8. legacy 공개 확인 fetch가 초기 편집기 로딩을 지연시키거나 Preview CORS 실패를 잘못 해석하지 않는지 확인한다. 새 수정본 편집 중에도 이전 공개 주소를 보존한다.
9. 권리 검사는 실제 공식 약관 인용을 확인해야 한다. 체크박스/임의 출처/허구 재분류로 검증을 우회하지 않는다. 개인정보·위험 수치 검사를 본문 외 공개 필드까지 검수한다.
10. 기존 즉시 release helper는 다른 대기 공개 콘텐츠가 섞이면 차단한다. 현재 main의 별도 자동 승인 글이 대기 중일 수 있으므로 **이 경계를 무작정 완화하지 않는다**. 전체 정적 배포에서 동반 공개될 변경을 검증할 안전한 해법이 필요하다.
11. 신규 runner의 stale main/head, 다중 글 요청, 중복 클릭, merge 후 실패·재개, 파일 범위, 큐 후속 실행을 추가 검증한다. 실패한 요청을 자동 반복 배포하지 않는다.
12. 통과 후에만 승인된 범위 main 병합·migration·실사이트 반영을 진행한다. 실제 공개 테스트는 명시적 승인을 받은 정확한 수정본만 사용한다. K-018/025/032 저장본이나 보관함을 임의 게시하지 않는다.
13. 요청 1~7별 PASS/PARTIAL/BLOCKED, 합성/인증/Production 증빙, 데이터 해시 보존, 공개 URL과 배포 SHA를 별도로 최종 보고한다. 외부 검색 등록 여부와 검색 준비 완료를 구분한다.

## 도구 참고

- Supabase project: `jgsxpdflgkqroecfjzxq`.
- 전체 ICU Node: `C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` (시스템 Node의 한글 날짜 차이 주의).
- Python은 `-X utf8` 사용.
- 기존 로그인 브라우저는 `/operator/knowledge/`. 자격 증명 추출·공개 테스트 계정 생성 없이 실제 세션으로 검증한다.
- 다음 작업은 기존 Draft PR #626에서 이어간다. 새 중복 브랜치/PR이나 예약 자동화는 만들지 않는다.

## 2026-10-23 Linux 환경에서 재개

- 기존 원격 브랜치를 `/workspace/knowledge-editor-v2` worktree에서 재개했다. Windows checkout과 로그인 세션은 이 환경에서 접근하지 못했다. 기존 루트의 bag 작업과 보고서는 보존했다.
- 최신 main `bea03b187724678e3581f93b920858a133ce75c6`을 작업 브랜치에 통합했다. main에는 병합하지 않았다.
- 이전 브라우저 CI 실패를 실제 재현해 라벨 접근성과 중복 클릭 중 버튼 이동 문제를 수정했다. 원고 복원 ID/slug 충돌, 파일 경로 손실, 인용 위치·중복·삭제, 보류·거절 복원 경계와 요청 취소/이력 보존을 보강했다.
- 최신 검증·대표 원고 상태·병합 차단 사유는 `KNOWLEDGE_EDITOR_V2_IMPLEMENTATION.md`의 재개 절을 참조한다. 운영 DB는 읽기 전용으로만 조회했다. V2 migration은 아직 미적용이며 미승인 원고 발행은 0건이다.
- 다음 작업에서도 #626과 동일 브랜치를 사용한다. 원고 없는 보관 글감은 실제 본문/근거를 작성해야 하며 저장본을 승인으로 취급하지 않는다. semantic job 없는 기존 공개 글의 검증된 편집 연결과 실제 인증 발행 검증이 완료되기 전에는 전체 완료로 보고하지 않는다.
