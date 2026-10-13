# 나의 생존가방 웹 1.0 출시 후보 통합

기준일 2026-10-13 KST. 사용자 최종 검수·발행·출시 승인 대기용 Draft.
main 병합/Production/release-marker/예약/Netlify 정책 변경을 실행하지 않는다.

## 실제 입력과 커밋 관계

| 입력 | 읽은 정확한 HEAD | 통합 방법 |
|---|---|---|
| #516 Alpha·49종·19/29/39종 구성 | 7837b3deca5e2db29775fcc327ff6864a7145b6f | #528의 조상, 중복 cherry-pick 없음 |
| #526 PWA·Capacitor·호스트 테스트 | cb054c46ad3695621c412baf91618f1bb9a41360 | #528의 조상, 그대로 재사용 |
| #528 UI·더보기 | 67c9746a1511d4ce079155e413d2c9ba3c282ee5 | 통합 브랜치 시작점 |
| 최신 main | 67acda56 (시작 시 조회) | merge, 충돌 없음. 기존 운영/지식/Operator 변경 보존 |
| #530 랜딩 | 932fcb0d7506a1c8bfcfe87718a0a26917158ac9 | #516→#530 차이의 랜딩 전용 7파일만 적용 |
| #525 원고 | 9d5f734fb1f6e031aeeeeb0960045a53ccc1d227 | docs/bunker_os/bag_knowledge 스냅샷만. 집필 브랜치/예약/C는 변경하지 않음 |

시작 시 위 PR 전부 OPEN/Draft/미병합. #528이 #526을 포함하는 것은 merge-base로 확인했다.
#530의 main 대비 전체 diff를 적용하거나 다른 선행 PR을 중복 재적용하지 않았다.
현재 통합 브랜치 `feat/bag-side-1-0-integration`, CI/HEAD/Preview/QA 실배포 정보는 이 브랜치의 Draft PR 최종 검증 댓글이 권위 소스다.
push 직전 main에 `454cedc1085aa100122f3904d3c7c54ddab74e2f`로 동일한 원고 8편·템플릿이 보관된 것을 확인했다. 내용이 #525 스냅샷과 동일함을 diff로 대조하고 최신 main도 병합한다. 이는 원고 발행 승인이나 공개 페이지 생성이 아니다.

## 최종 코드와 데이터 경계

- #528의 3탭·더보기·등록된 가방의 프리셋 기본 숨김·재진입을 유지한다.
- 제품 이름은 나의 생존가방, 실제 화면은 1.0 출시 후보. 기존 Alpha/LAB 기술 경로·IndexedDB 이름은 변경하지 않아 데이터 위치를 보존한다.
- 랜딩 `/bag/` → 앱 `/bag-lab/alpha.html`. 프리셋 카드는 `?preset=light|standard|expanded`로 미리보기만 열고 저장하지 않는다. 이미 등록된 가방에서도 재진입 가능하다.
- 재고·목표·묶음·날짜·주문·삭제 확인·합산·이전 저장·JSON 다운로드/복원은 기존 저장 경로 그대로. schemaVersion 1 / formatVersion 1 유지.
- `knowledge-links.mjs`의 명시적 공개 물품 매핑은 현재 0개. 49개 catalog는 이미 공개된 관리 지식, 가족 비상연락 메모는 가족 연락 계획으로 연결한다. 유사한 개인 물품 이름을 임의 연결하지 않는다.
- 이후 정상 발행 승인으로 실제 공개 HTML이 존재할 때 catalogId→URL 매핑만 추가한다. 생성기는 USER_PENDING 원고의 공개 매핑을 거부한다. 자동화 C 승인·게시를 대체하지 않는다.
- 지식 링크는 새 탭으로 열어 편집·재고를 유지한다. 승인용 원고의 앱 복귀는 catalogId 쿼리로 관리 화면만 열며 입력/저장을 하지 않는다.

## 지식 8편: 콘텐츠 PASS ≠ 사용자 발행 승인

| 물품 | 콘텐츠 검수 | 사용자 발행 승인 | 게시 | 검토용 경로 |
|---|---|---|---|---|
| 방수 서류 파우치 | 독립 PASS | 대기 | 미게시 | /bag-review/waterproof-document-pouch/ |
| 신분증 사본 | 독립 PASS | 대기 | 미게시 | /bag-review/identity-card-copy/ |
| 가족 비상연락처 메모 | 독립 PASS | 대기 | 미게시 | /bag-review/family-emergency-contact-note/ |
| 소액권 현금 | 독립 PASS | 대기 | 미게시 | /bag-review/small-denomination-cash/ |
| 중요 서류 사본 | 독립 PASS | 대기 | 미게시 | /bag-review/important-document-copies/ |
| 여분 열쇠 | 독립 PASS | 대기 | 미게시 | /bag-review/spare-keys/ |
| 우의 | 간편 PASS | 대기 | 미게시 | /bag-review/raincoat/ |
| 손전등 | 간편 PASS | 대기 | 미게시 | /bag-review/flashlight/ |

정확한 slug와 파일은 DRAFT_QUEUE_V1.json 및 원고 front matter에서 검증한다. 통합 시 작성자/독립 검수 상태를 재작성하지 않았다.
나머지 41편은 후속 집필이며 웹 공개의 차단 조건이 아니다.

`build-bag-knowledge-preview.mjs`는 승인된 ITEM_ARTICLE_TEMPLATE_V1의 본문 5절·관련 공개 지식·근거만 독자용 HTML로 투영한다.
front matter, DRAFT, reviewedAt, 후보 ID, 편집 검수·변경 이력·미구현 앱 메모는 본문에 노출하지 않는다. 원본 원고는 docs에 보존한다.
미리보기 목록 `/bag-review/` 한 곳에서 8편과 승인 상태를 검토한다. 앱/공개 지식 목록/sitemap에서는 미승인 원고로 연결하지 않는다.

출력은 `dist/bag-review/`에만 생성하며 다음에만 허용한다:
- Netlify `deploy-preview`;
- `branch-deploy`이면서 정확한 `BRANCH=qa-bag-side`;
- 명시적인 로컬 `BAG_KNOWLEDGE_PREVIEW=1` (CONTEXT가 없을 때만).

Production에서 위 로컬 플래그를 넣어도 생성하지 않는다. 기존 public/에 원고 복사 없음. Production 빌드의 preview 제외와 엄격한 source/catalog/template 일치 검사를 유지한다.
모든 검토 페이지는 noindex. noindex는 인증이 아니며 QA 링크를 가진 사람은 읽을 수 있다. 공개 서비스 발행 승인을 뜻하지 않는다.

## PWA·Android

기존 build-bag-pwa.mjs로 HTML/CSS/모듈/manifest/icon 전체 cohort를 재생성했다. 새 knowledge-links 모듈 포함 20자산.
정확한 최종 cohort/version/hash는 체크인된 pwa-assets.js 및 CI --check 결과가 기준이다. 낡은 정상 캐시·다른 캐시·IndexedDB를 삭제하지 않는다.
캐시 해시가 OS 줄바꿈에 따라 달라지지 않도록 BAG 텍스트 자산에만 LF 속성을 적용한다. RAW/원고·binary의 줄바꿈 속성은 변경하지 않는다.
`/bag/`, `/knowledge/`, `/bag-review/`는 `/bag-lab/` worker 소유 밖이다.
테스트용 V1/V2 전환은 로컬 fixture에서만 수행하며 Preview/QA에 가짜 cohort를 배포하지 않는다.

통합 PWA 검사: 설치 가능 조건·아이콘·실제 controller scope·오프라인 등록/수정·프로세스 종료 후 cold start,
미저장 editor를 둔 불완전 업데이트 거절, 다른 탭에서 정상 activation해도 입력 보존, 오래된 revision 저장 차단,
입력자가 명시적으로 최신 기록을 읽고 재저장한 뒤 오프라인 재로드/JSON 정확 일치, 별도 origin 격리.
다른 탭 activation 후 자동 지연 재로드를 보장하지 않으며 저장 후 명시적 재로드 경로를 검사한다.
고정 QA의 엄격한 CSP는 Playwright waitForFunction의 타이머 안 string eval을 차단한다. 검증기는 동일한 조건·30초 제한을 automation protocol에서 읽는 방식으로 대기하며 false 조건의 timeout도 검사한다. CSP/bypass 설정·제품 코드·검증 조건을 완화하지 않는다. 로컬 업데이트 및 고정 QA PWA cold start로 이 경로를 확인했다.

Android는 기존 Capacitor 앱·package/hostname/channel/native recovery 코드 그대로다.
Windows sync에서 URL.pathname의 /C:/ 경로 오류가 실제 발생하여 표준 fileURLToPath로만 보정했다.
기존 npm run sync로 통합 자산 동기화 완료. Native 호스트 20개·debug APK는 정확한 통합 HEAD의 기존 CI 결과로 확정한다.
로컬 JDK17만 있어 JDK21 native toolchain 빌드는 로컬에서 완료하지 못했다. 빌드/호스트와 실기기 전달은 분리한다.
Android 장기 알림·재부팅·Doze/OEM/force-stop·알림 클릭·실제 홈 설치·외부 브라우저 복귀는 실기기 미검증/PARTIAL.
웹 PWA는 앱 내 안내·지원 브라우저의 즉시 테스트 알림이며 종료 후 장기 날짜 예약을 하지 않는다.

## 검증 명령과 증거

```text
node --test archive/scripts/lib/bag-side-*.test.mjs archive/scripts/lib/bag-landing.test.mjs
node archive/scripts/build-bag-pwa.mjs --check
python archive/scripts/check-bag-side-demo.py
python archive/scripts/check-bag-side-alpha.py
python archive/scripts/check-bag-side-presets.py
python archive/scripts/check-bag-side-pwa.py
python archive/scripts/check-bag-landing.py
python archive/scripts/check-bag-knowledge.py
npm run build:verified (archive/web)
npm test (archive/web)
npm run sync (bag-mobile)
./gradlew testDebugUnitTest assembleDebug (bag-mobile/android, JDK21/SDK36)
```

로컬 84개 BAG/랜딩/지식 모델 및 201개 Archive/Operator 테스트, 전체 build:verified,
기존 Alpha/Preset/가상 시연 및 PWA/랜딩/지식 모바일·PC 검사 결과는 PR에 기록한다.
공식 외부 출처 8개 URL은 2026-10-13 읽기 전용 HTTP200·실제 문서 제목을 확인했고 내부 공개 지식 경로도 다시 검사했다.
이는 기존 콘텐츠 독립 검수를 대체하거나 사용자 발행 승인으로 해석하지 않는다.
테스트 재고는 모두 가상이며 운영 DB·자동화 설정·사용자 폰 기록에 접근하지 않는다.

## 출시 승인 후 절차 (이번 실행은 하지 않음)

1. 최종 통합 HEAD의 CI/Preview/고정 QA와 사용자 모바일 수용 검수를 확인한다.
2. 8편은 별도의 발행 승인 항목이다. 미승인 상태라도 기존 공개 지식 fallback으로 웹 출시할 수 있다. 승인된 글만 기존 게시 게이트로 공개한다.
3. 사용자에게 랜딩의 최종 canonical/색인·sitemap 등록을 확인받고, 승인된 설정의 최종 diff/검증을 다시 제시한다. 현재 랜딩·앱·QA는 noindex 유지.
4. 당시 최신 main 및 함께 출시될 누적 변경을 다시 감사한다. main으로 통합 병합할 별도 사용자 승인을 확인한다.
5. 기존 archive-production-release의 일일 23:30 KST 검사·2일 간격·변경 없으면 NOOP 정책을 사용한다. 현재 marker는 2026-10-12/source ea109411..., 다음 목표는 2026-10-14 KST. 목표일은 배포 확약이 아니다.
6. force/새 예약/별도 Netlify 프로젝트/정책 변경 없이 release-marker의 실제 source/main SHA와 Production readback을 대조한다.
7. 출시 후 /bag/와 앱·지식·manifest/SW HTTP, marker/메타데이터·데이터/백업·기존 생존일기를 확인한다. QA→Production 기록은 자동 이동하지 않으며 필요 시 JSON 백업·복원한다.

이 인계 자체는 main 병합·Production·원고 발행 승인이 아니다. 기존 원본·운영·배포 정책은 보존한다.
