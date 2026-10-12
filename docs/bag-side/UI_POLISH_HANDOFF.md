# 생존가방 UI 개선 — 1.0 통합 인계

기준: PR #526, `cb054c46ad3695621c412baf91618f1bb9a41360`. 별도 `feat/bag-ui-polish` 브랜치. #526과 Stage 3·4 브랜치는 수정하지 않는다. Netlify의 기존 PR Preview 검증을 위해 새 Draft PR의 base는 main이며, 검수할 UI 증분은 위 #526 HEAD부터 비교한다. main 병합/Production/고정 QA 갱신은 이 작업에 포함하지 않는다.

## 구현

- 더보기의 첫 섹션은 기존 네이비·오렌지 브랜드 카드, 다음은 준비 방법·생존지식이다. 브랜드 카피는 유지한다. 준비법 CTA는 오렌지 주요 버튼, 전체 지식 CTA는 보조 버튼이다.
- 기존 `/knowledge/emergency-supplies-inventory/`와 `/knowledge/`를 재사용한다. 공개 `https://survival-diary-archive.netlify.app`의 두 경로가 HTTP 200이며 각각 `비상용품 관리 | 생존일기`, `생존 지식 | 생존일기` 문서임을 검사한다. 지식 콘텐츠·매핑은 변경하지 않는다.
- PWA에서 두 CTA는 새 탭으로 열리며 현재 가방을 쓰거나 이동시키지 않는다. 지식 경로는 BAG SW 소유 범위 밖이다. Android의 기존 native bridge가 같은 `/knowledge/` 링크를 `BagReminderSettings.openKnowledge`로 넘겨 외부 사이트를 여는 경계도 유지한다. native plugin/패키지/알림 예약 설정은 변경하지 않는다.
- 추천 구성 패널의 기본 표시 조건은 **저장된 items.length === 0**이다. 실제 수량 0인 물품·추천 구성 초안도 등록된 물품이므로 패널을 기본 숨긴다. 기존 물품 관리의 `구성 3종 한 번에 추가`는 언제든 패널을 보여주며, 돌아온 내 가방이나 저장/새로 읽기 후에는 물품 개수로 기본 상태를 계산한다. DB 필드·최초 실행 플래그·localStorage 설정은 추가하지 않는다.
- 마지막 물품 삭제/빈 백업 복원은 패널을 다시 표시한다. 다시 열기만으로 재고나 예약이 바뀌지 않는다.
- `내 가방 백업하기`, `백업 파일 불러오기`, `기록 백업·복원`으로 안내한다. `.json`, `application/json;charset=utf-8`, input accept, JSON v1, import 크기/형식/날짜 검증, IndexedDB/이전 저장 복구 로직은 유지한다. JSON parse 오류는 UI 표시에서만 `백업 파일`로 설명한다.

## 자동 검증

```sh
node archive/scripts/build-bag-pwa.mjs --check
node --test archive/scripts/lib/bag-side-*.test.mjs
python archive/scripts/check-bag-side-demo.py
python archive/scripts/check-bag-side-alpha.py
python archive/scripts/check-bag-side-presets.py
python archive/scripts/check-bag-side-pwa.py
```

기존 BAG CI를 그대로 사용한다. Alpha 검사는 320/390/1280px에서 빈 가방→수량 0 등록→재실행→추천 구성 재진입→빈 백업 복원→이전 기록 복구→마지막 물품 삭제 상태를 확인한다. More 섹션 순서/소비자 문구/두 지식 경로 응답·실제 새 탭/재고 보존, 다운로드 확장자·MIME·v1, 기존 잘못된 백업/저장 실패/두 탭 충돌 검사를 포함한다. Preset 검사는 초안·실물·일괄 등록·중복·실패 복구와 재진입을 유지한다. PWA 검사는 오프라인·프로세스 재시작·부분 업데이트 실패·완전 업데이트·편집 중 다중 탭 activation·권한 거부/허용 및 웹/Android 옵션 분리를 유지한다.

HTML/CSS/module 변경 후 `alpha-shell.txt`와 `pwa-assets.js`를 기존 생성기로 재생성했다. 기존 완료 cohort/IndexedDB/백업은 별개이며 사용자 데이터는 초기화하지 않는다. CI는 별도 Draft PR의 정확한 HEAD Preview에서 기존 Demo/Alpha/Preset/PWA와 Reader 회귀를 실행한다. 물품은 모두 가상 테스트용이다.

## 남은 gate와 통합 순서

1. 1.0 통합 브랜치에서 #526과 이 UI 증분을 합치고 Stage 3의 지식 연결·Stage 4의 랜딩 변경을 각 담당 결과로 통합한다. 섹션 순서/CTA 및 링크 path를 덮어쓰지 않는다.
2. 통합 후 새 imports와 HTML/CSS에 맞춰 `node archive/scripts/build-bag-pwa.mjs`를 재실행하고 전체 offline/cohort 및 다중 탭/편집·충돌 gate를 다시 검증한다. #526 `PWA_ANDROID_HANDOFF.md`의 통합 상세 시나리오도 따른다.
3. Android는 통합 소스에서 `npm run sync`로 웹 패키지를 다시 빌드한다. 현재 웹 새 탭 검사가 실제 Android 외부 앱 전환/복귀를 검증한 것은 아니다. 실기기에서 두 CTA 외부 브라우저 열기·돌아오기·기록 유지·파일 chooser를 확인한다.
4. 실제 Android Chrome 홈 설치 및 기기 알림 전달·재부팅·절전·강제 종료 검증은 #526과 동일하게 미검증/PARTIAL이다. UI 개선이나 debug APK 성공으로 OS 알림 PASS를 선언하지 않는다.
5. 최종 HEAD/CI/immutable Preview 및 검증 결과는 새 Draft PR 본문에서 확인한다. 승인 없는 main 병합/Production 배포/예약 설정 변경은 수행하지 않는다.
