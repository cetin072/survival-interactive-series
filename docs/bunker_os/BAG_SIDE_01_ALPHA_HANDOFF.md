# BAG-SIDE-01 — 실제 물품·로컬 저장·백업 Alpha 인수인계

> 실사용 결과 기록 (2026-10-16): 실물 점검 후 짧은 대화 보고는 [EXPERIMENT_LOG의 BAG-SIDE-01 회차](EXPERIMENT_LOG.md#생존가방-1인-실사용--대화에서-기록하는-최소-흐름)에 정리한다. 앱의 현재 재고·직전 저장·JSON 백업과 실험 결과는 별개다. 아래는 Alpha 당시 구현 이력이며 현재 통합 경로는 [웹 1.0 인계](../bag-side/WEB_1_0_INTEGRATION_HANDOFF.md)를 함께 확인한다.

기준: 2026-10-11 KST. 출발점: main `ea109411a2dd528f03db350fd8e7262874d43c74` / 병합 PR #513.
상태: 구현·로컬 모델 테스트 완료, 브라우저·배포 검증은 이 변경의 exact-head CI 결과로 판정한다. 이 문서만으로 PASS를 주장하지 않는다.

## 병행 개발 / 승인 경계

사용자 요청은 실제 등록·로컬 저장·백업의 실행본 개발이다. 기존 Issue #501 Month 01, E-001/E-002/E-003, Bunker OS 및 A/A-Wiki/B/C 운영·일정은 변경하지 않는다. BAG-SIDE-01은 별도 Side Track이며 충돌 시 이 과제를 축소한다.

Draft PR에서 검수한다. main 병합, Production/qa-preview 갱신, release marker, DB·RLS·RAW·Canon 변경, 새 예약, 유료 API, 앱스토어·광고는 이 작업 범위가 아니다. PR 자동 Deploy Preview만 기존 체계로 검증한다. `noindex`는 접근제어가 아니므로 이 화면을 비공개 인증 서비스라고 표현하지 않는다.

기존 인수 기준은 `BAG_SIDE_01_MANAGEMENT_BENCHMARK_V1.md`, `BAG_SIDE_01_COMPETITOR_AND_PREP_STUDY_V1.md`의 Alpha 우선 기능 및 PR #513 설명을 따른다. 영상 전체 자막 확보 여부는 별도 파이프라인의 미해결 사항이며 앱 개발의 차단 조건이 아니다.

## 실행 경로 / 최소 구조

- 기존 샘플 시연: `/bag-lab/` — 원본 HTML/CSS/JS, 10개 모델 테스트와 클릭 검증 유지.
- 실제 기록 Alpha: `/bag-lab/alpha.html` — 같은 3탭(내 가방/물품 관리/생존 지식), 빈 가방으로 시작한다. 샘플을 실제 보유품으로 자동 전환하지 않는다.
- `alpha.html` / `alpha.css`: 결정적인 정적 화면·네이비/오렌지·모바일 하단 탭. 기존 스타일의 필요한 패턴만 독립적으로 적용, 새 라이브러리 없음.
- `alpha.mjs`: 폼·탭·안내·백업 다운로드/선택. 사용자 입력은 텍스트 이스케이프. 저장 성공 표시 전에 트랜잭션 완료를 기다린다.
- `personal.mjs`: 검증·재고 변경·백업 포맷의 순수 함수.
- `storage.mjs`: IndexedDB의 현재/직전 기록과 충돌 방지.
- `logic.mjs`: #513의 수량·부족·날짜 정렬 로직을 그대로 재사용. 기존 파일 변경 없음.

흐름: `입력 → 검증 → 단일 IndexedDB transaction(버전 확인 + 이전값 보존 + 새 값) → 성공 후 화면`. 외부 서버·Automation 런타임 의존·로그인·분석 SDK 없음.

## 구현 범위

품목 추가/수정/삭제, 분류·단위·목표량·실제량, 같은 물품의 기한별 묶음, 각 묶음의 표시기한 종류/날짜·점검일을 기록한다. 아직 없는 물품은 수량 0으로 등록한다. 같은 이름은 기존 물품에 묶음 추가하도록 안내한다.

`꺼냈어요`는 선택한 묶음만 차감한다. `주문했어요`는 주문 중 수량만 늘린다. `실제로 넣었어요`는 새 묶음을 추가하고 주문 중 수량을 그만큼 줄인다. 기존 묶음의 기한은 유지한다. 주문 취소/정정은 수정 폼에서 한다. 점검일 변경도 수정 폼에서 한다. OS 알림 예약이나 자동 순환 소비는 없다.

JSON 내보내기, 복원 미리보기, 취소, 확인 후 전체 교체, 직전 저장 1개 복원을 제공한다. 복원은 합치기가 아니다. 같은 백업을 연속 적용하면 중복 생성/버전 증가 없이 유지한다. 삭제도 확인 후에만 수행하며 직전 저장으로 되돌릴 수 있다. 다음 변경을 하면 직전 사본도 갱신되므로 영구 변경 이력은 아니다.

## 데이터·실패 경계

DB: 동일 origin의 `bag-side-01-alpha`, version 1, object store `records`, keys `current`/`previous`.
현재 기록: `{ revision, bag }`. bag: `{ schemaVersion:1, sampleOnly:false, bagName, rotationLeadDays, items }`.
각 물품: `{ id, name, category, target, unit, orderedQuantity, batches }`.
각 묶음: `{ id, quantity, dateType, markedUntil, nextInspection }`.

- 모든 저장은 검증 후 진행. 수량은 정수, 품목 총량 0~9999, 목표량 1~9999. ID는 전역 중복 방지. 실제 달력 날짜 2000~2099. 날짜가 없으면 null.
- Alpha 한도: 200종, 물품당 100묶음, 가방 JSON 256KiB. 백업 파일 1MiB 이내. 과대 입력·모르는 필드·미지원 버전·중복·잘못된 날짜는 거절한다.
- 백업 포맷: `{ app:'BAG-SIDE-01', formatVersion:1, exportedAt:<ISO UTC>, bag }`.
- 수개월 데이터 수명은 브라우저 저장만으로 보장하지 않는다. 기기/브라우저/사이트 origin별 저장소가 다르다. 데이터 삭제·시크릿 모드·용량 정책·기기 교체에 대비해 JSON 파일을 별도 보관한다. Preview에서 Production으로 자동 이동하지 않는다.
- 평문 백업이며 암호화/인증을 제공하지 않는다. 가방 보관 위치·가족 신상·처방 세부사항 등 민감한 정보를 기록/공유하도록 유도하지 않는다. 동일 origin의 스크립트도 브라우저 데이터에 접근 가능한 점을 보안 검토 시 고려한다.
- IndexedDB 실패/손상/미지원 버전이면 샘플·빈 가방으로 덮어쓰지 않고 오류 및 원본 진단 내보내기를 제공한다. 손상 원본은 자동 교체하지 않는다.
- 다른 탭의 변경은 revision 비교 후 STALE 오류로 거절한다. 작성하던 입력은 보존한다. 취소 후 최신 기록을 읽고 수정한다.
- 이전값 복사와 현재값 저장은 한 readwrite 트랜잭션이므로 중간 실패 시 둘 다 롤백한다. unload 시 저장에 의존하지 않는다.
- 기록상 목표 충족은 안전/비상준비 완전성을 보장하지 않는다. 여유일 90일은 수정 가능한 관리 설정이다. 의약품에 순환 섭취를 권하지 않는다.

## 검증 / 재현

```
node --test archive/scripts/lib/bag-side-lab.test.mjs archive/scripts/lib/bag-side-alpha.test.mjs
python archive/scripts/check-bag-side-demo.py
python archive/scripts/check-bag-side-alpha.py
```

기존 `.github/workflows/bag-side-lab-check.yml`의 PR 게이트를 확장한다. 새 정기 예약은 없다. 기존 10개 모델·시연 브라우저·exact-SHA Preview 검증은 유지한다. Alpha 모델 22개와 실제 Chromium 320/390/1280px, 브라우저 프로세스 종료/재실행, 저장 차단 및 트랜잭션 실패 검증을 추가한다. 추가 브라우저 시나리오 때문에 단일 job 상한을 5→12분으로 조정한다.

기계 검증 목표: 5종 직접 등록, 새로고침/재실행 보존, 6→4→6, 0→2→0 부족량, 주문≠입고, 두 번 제출 시 중복 차감 방지, 묶음 날짜 보존, 실제 파일 다운로드·복원/취소/재복원, 손상·과대·중복 백업 거절, XSS 모양 이름의 텍스트 렌더링, 이전 상태 복구, 두 탭 충돌, 동시 쓰기 하나만 성공, 저장 중 용량 오류 시 현재/직전 둘 다 보존, 미래 스키마 원본 보존.

개발 컨테이너의 모델 테스트 22/22 PASS. 로컬 시스템 Chromium은 페이지 접속이 관리 정책으로 차단되어 브라우저 E2E를 여기서 PASS로 보고하지 않는다. 동일 테스트를 기존 GitHub Actions/Deploy Preview에서 실제 수행하고 run ID·head SHA를 PR에 남긴다. 합성 데이터의 스크린샷·로그만 7일 artifact로 보관한다.

## 이번 단계에서 하지 않은 것 / 다음 단계

설치형 APK, PWA의 완전한 오프라인 재실행, OS 알림, 휴면/재부팅 후 알림 신뢰성, 동기화·회원가입·결제·후원·광고를 구현하지 않았다. 열린 페이지에서 오프라인 저장이 되는 것과 오프라인 상태에서 앱을 처음 실행하는 것은 다르다.

다음은 이 Alpha의 실제 휴대전화 물품 5종 등록→꺼냄→실제 보충→JSON 백업 확인이다. 저장 정확성과 사용성 검수 후 Android 설치/알림은 별도 승인·실기기 게이트에서 진행한다. 기존 생존일기 본 로드맵은 그동안 그대로 유지한다.

참고: MDN Using IndexedDB (https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), Storage quotas and eviction criteria (https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria). 외부 라이브러리 코드를 가져오지 않았으며 #513 자체 코드와 브라우저 표준 기능을 재사용했다.
