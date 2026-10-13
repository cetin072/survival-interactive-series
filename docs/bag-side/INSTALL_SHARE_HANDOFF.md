# 웹 1.0 설치 안내·친구 공유 패치

기준: 2026-10-13 KST. `feat/bag-side-1-0-install-share`, main `5feb188c48cf1025c699682940ee178efb9744c9`에서 시작.
#536/#538은 이미 squash 병합되어 다시 병합하지 않는다. 사용자 승인 전 main 병합/Production/release marker 변경 없음.

## 재사용·구현

- 기존 `/bag/` 랜딩·홈 카드·더보기 순서를 유지한다. 랜딩에 Android/Chrome 및 iPhone/Safari 4단계 안내와 앱 진입 버튼, 친구 공유/링크 복사를 추가한다. 앱 더보기에 접는 설치 안내와 같은 공유 기능을 추가한다.
- `knowledge/share.js`의 네이티브 공유·AbortError 취소·Clipboard 실패 시 URL 선택 패턴을 BAG 영역에 독립 재사용한다. 기존 지식 생성기/공유 구현은 변경하지 않는다.
- 업무수첩 `public/manifest.webmanifest`, `public/sw.js`, `public/notifications.js`를 읽고 standalone 확인·사용자 클릭 권한 경계를 참고했다. 서버 인증/DB/Push·광역 캐시 삭제 정책은 가져오지 않는다.
- 기존 `pwa.mjs`에 작은 UI 처리를 추가해 앱/랜딩에서 재사용한다. 랜딩의 모듈 import는 worker 등록이나 설치 프롬프트를 실행하지 않는다. 기존 앱의 명시적 `registerBagPwa` 호출/worker scope와 manifest는 유지한다.
- 설치 버튼은 앱에서 실제 `beforeinstallprompt` 이벤트를 받은 때만 표시한다. 클릭에서만 일회성 prompt를 호출한다. accepted는 ‘설치 요청’, `appinstalled`를 받았을 때만 ‘브라우저에서 설치 확인’이다. 미지원/취소/실패 환경은 메뉴 안내로 이어진다.
- 공유 payload는 고정 title/text/정식 `/bag/` URL 세 필드뿐이다. inventory/backup/settings/현재 location을 payload로 읽지 않는다. Share 미지원은 복사 안내, Clipboard 미지원·실패는 readonly URL 선택·수동 복사. 자동 API/권한 요청 없음.
- 기존 Capacitor 셸은 Native Share 플러그인이 없으므로 WebView의 공유를 호출하지 않고 공개 링크 복사 안내를 사용한다. 플러그인/네이티브 코드 변경 없음.
- QA·Preview 구분은 HTTP noindex·배포 메타데이터로 검증하며 소비자 화면에는 검수/정식 배포 전 안내를 표시하지 않는다. 공유 URL은 항상 공개 canonical 주소로 고정하고 QA 주소·개인 기록을 전송하지 않는다.
- 기존 네이비·오렌지/CSS 가방 그림으로 `bag/share.png` (1200×630)를 생성했다. `build-bag-share-image.py`는 기존 Playwright와 로컬 CSS만 사용하며 네트워크 자산이 없다. OG는 이 파일의 정식 HTTPS 주소만 참조한다.

## 보호 계약

IndexedDB/schemaVersion 1, JSON formatVersion 1, 19/29/39종 프리셋·49 catalog 변경 없음.
manifest/SW/storage/personal/native 경계·알림 엔진 변경 없음. PWA 20개 자산 계약을 그대로 재생성한다.
랜딩은 index,follow·기존 canonical/sitemap 유지, 앱은 noindex 유지. Preview/QA HTTP noindex를 확인한다.
미승인 8편은 미게시이며 Production `/bag-review/` 미생성 게이트를 유지한다.
Production release-marker/2일 정책/23:30 KST 예약·Netlify 설정·운영 DB/자동화 설정 변경 없음.

## 검증

- 기존 BAG/랜딩 모델 84개, 전체 PWA 업데이트/오프라인/다중 탭 보존 검사를 재사용한다.
- `check-bag-install-share.py`: 기존 Playwright/서버/재고 fixture/remote exact-head guard 재사용. Android/iPhone UA 320/390/1280, Share 성공/거절/취소/미지원, Clipboard 성공/거절/미지원, 실제 클릭 activation·고정 payload, 설치 이벤트 수신/일회성 prompt/취소/실패/standalone/native, 긍정 current+previous V1 재고의 불변을 확인한다.
- 새 분기 테스트의 OS API는 가상 adapter다. **실제 Android/iPhone/Safari·카카오톡 공유 시트 선택·상대방 수신·Production 링크 미리보기 검증이 아니다.** 기존 PWA gate의 실제 Chromium installability도 실기기 설치 조작과 구분한다.
- 랜딩 회귀에서 OG PNG의 실제 HTTP200/image/png/1200×630 및 모든 기존 CTA·지식 링크·홈 메뉴·백업 보존을 검사한다. 랜딩 CI에 새 gate를 연결하며 기존 검증은 유지한다.
- 전체 build/Archive·Operator 회귀, CI/Preview exact SHA·cohort/hash·스크린샷·Android web sync 결과는 Draft PR 최종 댓글로 확정한다.

## QA·승인

기존 `qa-bag-side`는 #536의 원래 HEAD 계보이고 main은 squash 계보다. 작업 시작 시 QA→새 HEAD는 fast-forward 불가였다. force/reset/혼합 merge로 QA를 바꾸지 않고 PR별 Preview를 사용한다.

사용자가 2026-10-13 설치·공유 소비자 문구 보완 및 main 병합을 승인했다. 정기 출시 목표는 2026-10-14 23:30 KST 검사이며 일정 때문에 검증을 생략하지 않는다.
병합 승인 후 당시 main 누적 diff와 exact HEAD CI를 다시 확인한다. 출시 후 실제 휴대전화 홈 설치·카카오톡 공유/미리보기·OG 정식 URL 응답을 확인한다.

## 사용자 승인에 따른 출시용 문구 정리
- 랜딩·앱·업데이트 화면에서 `검수 화면`, `정식 배포 전`, `1.0 RC`, `출시 후보`, `정식 출시 전` 등 개발 중 안내를 제거하고 정식 웹 1.0 제품 표현으로 변경.
- 공유 API 성공은 친구가 메시지를 실제 수신했다는 뜻이 아니므로 '선택한 앱에서 링크 전송 여부를 확인해 주세요'로 안내. 취소·오류·링크 복사 fallback은 실제 상태를 전달.
- PWA·오프라인·IndexedDB/백업의 안전 계약과 설치/공유 API 진입 동작은 변경하지 않으며, 앱 종료 후 날짜별 웹 알림 미지원 및 Android 기기 알림 제한은 과장 없이 명시.
- HTML/JS와 알림 안내 변경에 맞춰 `alpha-shell.txt`와 20자산 PWA cohort를 최신 SHA-256 값으로 갱신하고, exact-head CI/Preview·원본 current/previous 재고 보존을 재검수한다.
