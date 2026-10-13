# 생존가방 지식 1차 6편 — 작성자 검수 기록

- 확인일: 2026-10-12
- 기존 PR: [#525](https://github.com/cetin072/survival-interactive-series/pull/525)
- 기존 작업 브랜치: `feat/bag-side-item-knowledge-template-v1`
- 검수 기준 커밋: `1544a81301593f5be1883e24d0ea003c9216d87a`의 AGENTS.md, 승인 템플릿 V1, 손전등 샘플, catalog.mjs, PR 변경사항·설명·댓글 확인(댓글 없음)
- 전체 판정: **PASS — 작성자 검수 / REVIEW — 독립 검수·개별 사용자 승인·게시 전**
- 6편 모두 `DRAFT_NEEDS_INDEPENDENT_REVIEW`, `reviewedAt: null` 유지. 이 기록은 독립 검수 또는 발행 승인 증명이 아니다.

## 원고별 결과와 실제 변경 파일

아래 6편과 이 검수 기록 1개가 이번 작업의 변경 범위다. 각 원고 링크는 저장소 안의 원고이며 게시된 물품 글 URL이 아니다.

| 품목 | 변경 파일 | 작성자 검수 결과 | 독립 검수 |
| --- | --- | --- | --- |
| guide-01 방수 서류 파우치 | [GUIDE_01_WATERPROOF_DOCUMENT_POUCH_DRAFT_V01.md](GUIDE_01_WATERPROOF_DOCUMENT_POUCH_DRAFT_V01.md) | PASS: 기존 비·젖은 물품 도입 보존, 빈 종이 시험·제조사 조건·시야 노출·국내 근거 보강 | REVIEW |
| guide-02 신분증 사본 | [GUIDE_02_IDENTITY_CARD_COPY_DRAFT_V01.md](GUIDE_02_IDENTITY_CARD_COPY_DRAFT_V01.md) | PASS: 지갑 분실 도입 보존, 제목 조사 수정, 제출 요건·사본 한계·분실신고·정보 가리기 보강 | REVIEW |
| guide-03 가족 비상연락처 메모 | [GUIDE_03_FAMILY_EMERGENCY_CONTACT_NOTE_DRAFT_V01.md](GUIDE_03_FAMILY_EMERGENCY_CONTACT_NOTE_DRAFT_V01.md) | PASS: 방전 도입·가족 합의 설명 보존, 메모 형식·긴급번호·개인정보·위험한 만남 장소 주의 보강 | REVIEW |
| guide-04 소액권 현금 | [GUIDE_04_SMALL_DENOMINATION_CASH_DRAFT_V01.md](GUIDE_04_SMALL_DENOMINATION_CASH_DRAFT_V01.md) | PASS: 결제 장애·잔돈 상황 신규 집필, 개인별 예산·수납·보충·현금 거래 한계 명시 | REVIEW |
| guide-05 중요 서류 사본 | [GUIDE_05_IMPORTANT_DOCUMENT_COPIES_DRAFT_V01.md](GUIDE_05_IMPORTANT_DOCUMENT_COPIES_DRAFT_V01.md) | PASS: 임시 숙소의 보험 상담 상황 신규 집필, 목적별 선별·갱신·제출 요건·종이/전자 정보 노출 설명 | REVIEW |
| guide-06 여분 열쇠 | [GUIDE_06_SPARE_KEYS_DRAFT_V01.md](GUIDE_06_SPARE_KEYS_DRAFT_V01.md) | PASS: 생활 속 잠김 상황 신규 집필, 현재 장치와 일치·안전한 시험·가방 접근 한계·분실·재진입 주의 | REVIEW |

분류 대조: 6종의 `group`은 모두 `documents`(서류·연락). 저장 `category`는 01·02·03·05가 `documents`, 04·06이 `other`다. 그룹과 저장 분류를 혼동하지 않고 원고 메타데이터에 둘 다 기록했다. 카탈로그 예시 수량은 충분한 준비 기준으로 사용하지 않았다.

## 외부 근거 원문 확인

Firecrawl의 `maxAge: 0` 요청으로 아래 6개 페이지의 **200 응답과 관련 본문을 함께 확인**했다. 상태 코드만으로 유효성을 판정하지 않았다. 자료가 한국의 법적 효력·제품 인증·재난별 충분조건을 보증한다고 확대하지 않았다.

| 공식 페이지 | 확인한 주장·본문 위치 | 적용 원고와 한계 |
| --- | --- | --- |
| [국민안전24 — 비상대비](https://safekorea.go.kr/safekorea-kor/acts/nacts/action-guide.do?actsHeaderTitle=%EB%B9%84%EC%83%81%EB%8C%80%EB%B9%84&category=stateOfEmergency&menuSn=4) | 「생존배낭 꾸리기」: 중요 서류와 가족 비상연락카드. 「비상물자 사전 준비」: 연락처·만남 장소·환자의 최근 처방전. 「대피 후 행동 요령」: 정부·관리자 안내 | 01·03·05·06. 전쟁·비상사태 문맥. 사본 자체의 효력·파우치 성능·열쇠 사용법·모든 재난의 재진입 판단 자료로 사용하지 않음 |
| [행정안전부 — 주민등록증 분실/습득/훼손](https://www.mois.go.kr/frt/sub/a06/b06/IDCard_6/screen.do) | 「분실 신고」 및 「분실 신고의 효력」: 신고·재발급 안내, 신고 처리 후 주민등록증과 모바일 주민등록증 효력 정지 | 02. 사본이 법적 신분증이라고 주장하지 않음. 재발급 수수료·기간·모든 신분증 절차를 일반화하지 않음 |
| [행정안전부 — 긴급신고 통합서비스](https://www.mois.go.kr/frt/sub/a06/b10/emergencycall/screen.do) | 「추진 내용」: 긴급신고 112·119, 비긴급 민원상담 110 | 03. 번호 구분만 활용. 연락카드가 통신 연결을 보장한다고 쓰지 않음 |
| [개인정보 포털 — 유출신고](https://www.privacy.go.kr/front/wcp/spl/splRptInfo.do) | 관리·통제권을 벗어나 제3자가 내용을 알 수 있는 상태에 이르는 분실·도난·유출 개념. 개인 침해신고와 사업자 유출신고 구분 | 01·02·03·05. 사업자 신고 의무를 개인의 가방 분실에 그대로 적용하지 않음. 최소화·불투명 봉투·가족 통지는 편집상 권고 |
| [미국 적십자사 — Survival Kit Supplies](https://www.redcross.org/get-help/how-to-prepare-for-emergencies/survival-kit-supplies.html) | 기본 목록의 개인 문서 사본(보험·주거·의료·여권), 가족·비상 연락정보, 예비 현금. 가족별 추가 항목의 집·차량 여분 열쇠 | 01·02·04·05·06. 미국 안전기관의 일반 준비 권고이며 한국의 사본 효력·필수 수량·장치 규격의 근거가 아님 |
| [Ready.gov — Financial Preparedness](https://www.ready.gov/financial-preparedness) | 「Financial Preparedness Tips」: ATM·카드 불능 가능성과 소액 지폐. 중요 기록 접근·문서 보관·금융정보 공유 주의 | 04·05. 금액 기준을 한국에 이식하지 않음. 구체적인 한국 원화 액수는 제시하지 않음 |

재확인용 수집 ID:

- 국민안전24: `01a130a6-13e3-75da-82e3-0609a65302ca`
- 행정안전부 주민등록증: `01a130a6-5b57-707b-a1b0-b8b976220183`
- 행정안전부 긴급신고: `01a130a5-1b19-70eb-ab89-cecabaa64644`
- 개인정보 포털: `01a130a5-b9b0-7428-8a7e-23c4de97ef89`
- 미국 적십자사: `01a130a4-a112-75b4-93d1-4121019837eb`
- Ready.gov: `01a130a5-5324-70a9-8a94-3c1e96f4e0a7`

## 내부 연결 확인

| Automation C 글 | 실제 공개 URL | 저장소 경로 | 확인 결과 |
| --- | --- | --- | --- |
| 비상용품 관리 | [공개 글](https://survival-diary-archive.netlify.app/knowledge/emergency-supplies-inventory/) | `archive/web/public/knowledge/emergency-supplies-inventory/index.html` | PASS: 200·본문·제목·기존 공개 표기 확인. 원고에는 같은 탭의 상대 경로 링크 사용 |
| 가족 비상연락 | [공개 글](https://survival-diary-archive.netlify.app/knowledge/family-emergency-contact-plan/) | `archive/web/public/knowledge/family-emergency-contact-plan/index.html` | PASS: 200·본문·제목·기존 공개 표기 확인. 연락·만남·역할 관련 추천에 사용 |

수집 ID: 비상용품 관리 `01a130a4-cc9d-71cd-8196-24d44f3d639c`, 가족 비상연락 `01a130a4-f465-723e-992f-b658e4c44ce3`.

각 원고에 Automation C 1~2개와 추천 이유, 미게시 물품 후보 2개, 외부 근거, 복귀 연결용 `catalogId`를 기록했다. 미게시 물품으로 향하는 URL·버튼은 만들지 않았다.

## 작성자 품질 검수

- PASS: 6편의 ID·품명·그룹·저장 분류와 참조 후보 ID를 실제 catalog.mjs와 대조.
- PASS: 제목의 필요성 질문, 구체적인 생활 도입, 사용·선택·보관/관리·주의·30초 점검·이어서 읽기·근거/이력의 공통 순서 확인.
- PASS: 기존 01~03은 수정 전 원문 확인, 생활 사례와 실용적인 설명 보존. 04~06은 독립 집필.
- PASS: 본문과 제품 선택·관리 문단을 읽고 어색한 조사·중복·긴 문단을 정리. 도입 상황과 중심 기능을 6편별로 구분.
- PASS: 6편 간 및 저장소의 기존 Automation C 공개 페이지와 동일한 긴 본문 문장(공백 제외 45자 이상)을 비교해 일치 없음. 반복되는 서식·검증일·미게시 상태 안내는 비교에서 제외. 기계 비교는 완전한 표절 판정이 아니며 독립 편집 검수는 남아 있음.
- PASS: 개인정보 노출·마스킹·사본 제출 요건·분실 대응을 검토. 한국의 공식 신분증과 사본 혼동, 정액·정량 충분성, 보험금·진료 보장 표현 없음.
- PASS: 변경 파일은 원고 6개와 이 기록만. `git diff --check` 통과. 앱·catalog.mjs·IndexedDB·백업·자동화·예약·배포 설정 변경 없음.
- REVIEW: 독립 검수·개별 사용자 승인·발행 직전 링크 QA는 미완료. 앱 복귀 주소·게시된 물품 글 URL은 이번 작업에서 구현·검증하지 않음.
- FIX: 작성자 검수에서 발견한 제목 조사 오류·문단 길이·마스킹 설명 반복·끝 공백은 수정 완료. 현재 알려진 미수정 작성 오류 없음.

## 미확인 링크와 주의사항

- 기존 초안의 Ready.gov 한국어 경로 `/ko/financialpreparedness`, `/ko/plan` 및 COVID-19 시기 적십자사 자료는 이번 작업에서 유효성·본문을 검증하지 않아 최종 6편의 클릭 출처로 유지하지 않았다. 실패한 링크라고 단정하지 않는다.
- 정부24 주민등록증 재발급 페이지는 200과 민원 본문을 수집했지만 접속 대기·차단 안내도 함께 나타났다. 온라인 신청이 현재 정상 동작한다고 주장하지 않으며, 최종 원고는 본문을 확인한 행정안전부 안내로 연결한다.
- 도어록·차량 모델별 설명서는 확인 대상 모델이 없어 검증하지 않았다. 특정 비상 개방·전지 교체·등록 해제 절차를 쓰지 않고 제조사 안내를 확인하도록 했다.
- 공개된 Automation C 글 2개의 유효성은 확인 시점의 결과다. 발행 직전 재확인이 필요하다. 미게시 물품 ID와 앱 복귀 키는 작동 링크가 아니다.
- 신규 PR·원격 브랜치·예약은 만들지 않으며 PR #525의 Draft를 유지한다. main 병합·Ready 전환·Production 배포는 작업 범위에 없다.
