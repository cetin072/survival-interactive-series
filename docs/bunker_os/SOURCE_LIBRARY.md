# Bunker OS V1 — SOURCE LIBRARY

기준일: 2026-10-10 KST

좋은 외부 자료를 채팅에서 소비하고 버리지 않기 위한 최소 라이브러리다.
V1은 Markdown으로 시작한다. 규모가 커져 실제 조회/중복 관리 문제가 생길 때만 구조를 확장한다.

## 상태
- `NEW`: 아직 검토 전
- `REVIEWED`: 핵심 의미와 경계 확인
- `APPLIED`: 결정/실험/콘텐츠에 실제 반영
- `HOLD`: 보관하지만 현재 사용하지 않음
- `SUPERSEDED`: 더 나은 자료로 대체됨

## 기록 필드

| 필드 | 의미 |
|---|---|
| ID | 영구 식별자 |
| Source | 원본 링크/문서 |
| Area | 전략 / 생존지식 / 벙커 / 기술 / 사업 / 사례 |
| Why it matters | 우리에게 중요한 이유 |
| Reliability | 원자료 여부·신뢰 한계 |
| Rights | 재사용 가능 범위. 불명은 허용으로 추정하지 않음 |
| Impact | NONE / LOW / MEDIUM / HIGH |
| Status | 위 상태 |
| Linked | 연결된 Decision/Experiment/Issue |

## 초기 라이브러리

### S-001 — 사용자 추천 전략 영상
- Source: https://youtu.be/3ao8RY0otEk?si=5FrMgBm4ZajZjdid
- Area: 전략 / 사업
- Why it matters: “해야 할 일의 목록”과 “왜 이길 수 있는가에 대한 전략”을 구분해야 한다는 문제의식을 제공. 기존 선형 연차 매출 계획을 재검토하는 계기가 됨.
- Reliability: 사용자 추천 외부 영상. 핵심 주장은 원자료/관련 전략 문헌과 별도 검증할 가치가 있음.
- Rights: 링크·자체 메모 보관. 영상/자막의 재게시 권한은 별도 확인 전 없음으로 취급.
- Impact: HIGH
- Status: APPLIED
- Linked: D-003, D-007, Issue #500

### S-002 — 충주시 겨울철 자연재난 대비 게시물
- Source: https://www.chungju.go.kr/www/selectBbsNttView.do?key=494&bbsNo=6&nttNo=326178
- Area: 생존지식 / 공식 사례
- Why it matters: 대설·한파 대비를 실제 생활의 사전점검 질문으로 바꾸는 글감. 외부 자료를 버리지 않고 보관·분류·기존 글 개정에 활용하는 Source Library 필요성을 검증.
- Reliability: 충주시 공식 게시물. 행정 대비계획/사례이며 그 자체가 모든 행동요령의 충분한 근거나 효과 검증은 아님.
- Rights: Issue #491 기록 기준 원문 표시 공공누리 제4유형. 출처표시·상업적 이용금지·변경금지 경계를 전제로 링크/메타데이터/자체 메모 중심 보관.
- Impact: LOW
- Status: APPLIED
- Linked: PR #493, Issue #491
- Note: 사용자가 제공한 샘플 성격의 자료. 정보 자체의 전략적 중요도보다 Source 보관·권리분류·기존 글 연결 흐름을 시험한 사례라는 의미가 큼.


### S-003 — 사다리게임 YouTube 채널
- Source: https://www.youtube.com/@Ladder_Game
- Area: 전략 / 사업 / 실행 / 사례
- Why it matters: 사용자가 전략·사업 사고를 넓히는 데 유용하다고 판단한 채널. 확인된 공개 영상에는 사업전략, 규모/범위의 경제, 일본 빈집 비즈니스, 실행 시스템 등 Bunker OS의 전략 가설과 실험 설계에 참고될 주제가 반복적으로 등장한다.
- Reliability: 2차 해설·큐레이션 채널. 채널의 해석을 그대로 정답으로 채택하지 않고, 중요한 주장은 원전·책·연구·공식 사례를 추가 확인한다.
- Rights: 링크·자체 요약·적용 메모 중심. 영상/자막/이미지의 전체 복제·재게시 권한은 별도 확인 전 없음으로 취급.
- Impact: MEDIUM
- Status: REVIEWED
- Linked: S-001, Issue #500
- Use rule: 채널 전체를 무차별 수집하지 않고, 우리 전략/실험에 영향을 줄 가능성이 큰 영상만 선별해 개별 Source로 승격한다.
- Identity readback (2026-10-13): 공식 채널 페이지의 이름/정규 channel URL과 S-001 영상(3ao8RY0otEk)의 공식 YouTube oEmbed author_url이 @Ladder_Game으로 일치. 제목은 ‘진짜 ‘사업 전략’은 이래야 합니다’. 동일성은 메타데이터 확인이며 영상 음성·전체 자막·주장 재검증은 아님. [확인 범위와 미완료 사항](DISTRIBUTION_MAP_V1.md#5-사다리게임-식별-결과).


### S-004 — Ąžuolas: 72시간 대피가방 대화형 체크리스트 (리투아니아)
- Source: https://azuolas.mainline.inc/krepsys/
- Area: 생존지식 / 실제 행동 전환 / 외국 사례 / UX 벤치마킹
- Why it matters: 공식 준비물 자료를 '가족 인원→필수·선택 물품→준비 진행률→기한·정기점검→가족 비상계획' 행동 흐름으로 연결. Bunker OS의 핵심 가설(읽기→준비 행동)과 기존 K-002 비상물품 관리, K-003 가족 비상연락 글을 **코드를 새로 만드는 것 없이도** 개선할 수 있는 참고 사례.
- Reliability: 2026-10-11에 페이지 실제 텍스트/메타데이터 확인. **리투아니아 정부가 직접 운영하는 웹사이트가 아님**. 원문은 정부 [LT72 대피가방 공식 안내](https://lt72.lt/isvykimo-krepsys-5/)를 출처로 밝힘. LT72/리투아니아 정부기관 설명은 72시간 대피용·개인별 가방·연 2회 점검을 안내. 체크박스 진행률(0/39 필수 표시)·가족 수 조절·가족계획 이동은 확인. 실제 사용자 데이터 저장·기한 알림·오프라인 기능은 미검증.
- Rights: 사이트의 전체 텍스트·이미지·UI 자산·소스코드 재배포/상업적 사용/수정 라이선스는 확인되지 않음. **링크·자체 분석·추상화한 사용성 원칙만 보관**, 무단 번역/복제·클론·스크린샷 게시는 하지 않음. 외국 공식 자료의 권리도 별도 확인.
- Safety: 외국 공공 기준의 72시간/물품 수량/가방 중량을 한국의 의무·충분조건으로 전용하지 않음. 핵·화학 방호, 요오드제, 지혈대·의약품, 안전거리 등 고위험 설명은 국내 공식 자료와 전문가 근거 없는 게시 금지.
- Impact: HIGH (사용자 행동 UX), 수익성/시장성 증거는 NONE
- Status: REVIEWED
- Linked: Issue #501 (Month 01의 행동 전환·유통 가설), K-002/K-003 후보 검토, BAG-SIDE-01(별도 앱 채팅 참고만), BENCHMARK_AZUOLAS_LT72_V1.md
- Next: 기존 K-002→관리 체크→K-003 가족계획으로 이어지는 **1개 작은 비공개 사용자 흐름**을 Week 2 후보로 검토. 본래 E-002와 앱 Side Track 자동 교체/병합 금지.

### S-005 — 한국어 72시간 생존가방 영상 (LT72 관련 2차 해설)
- Source: https://www.youtube.com/watch?v=ehQEvkWKAIE
- Title: 전쟁 터지면 가장 먼저 챙겨야 할 72시간 생존가방
- Area: 생존지식 / 가방 실제 점검 / 영상 2차 해설 / BAG-SIDE-01 UX 보강
- Why it matters: 단순 물품 목록과 달리 '가방을 실제로 메고 걸어보고 무게를 조정', '집 비축 vs 대피 이동 가방', '조리가 어려운 상황의 식품 선택', '기기·계절 의류·의약품 점검' 등 사용상의 설명을 제공. 49종 추천 목록을 49개의 얇은 글로 대량 변환하는 대신 기존 비상용품 관리 글/앱의 점검 설명을 근거와 연결해 보강할 후보.
- Reliability: 2026-10-11 한국어 제공자 자막 **315구간, 0.12~546.6초 부분**을 확보해 핵심 설명 검토. 자막의 독립적인 영상 전체 커버리지/정확도는 검증되지 않음(원본 음성 직접 대조 전 원문 확정 아님). 69초 부근에서 리투아니아 총방위협회 자료의 영상화를 직접 언급. **S-004 Ąžuolas 및 LT72와 원천이 겹치므로 독립 확인 증거로 중복 계산 금지**.
- Key moments (직접 작성한 주제 메모): 00:39 실물 이동 테스트 / 00:50 연 2회 점검 / 01:37 집 비축과 대피가방 구분 / 02:11 비상식품 / 02:41 신분·문서 / 05:18 지혈용품은 사전 교육 필요 / 08:28 무거울 때 필요한 물품 우선. 세부 주장과 권장량은 자막 오류·번역·지역 차이 검증 전 사용 금지.
- Rights: 영상/자막의 재게시·재편집·상업 이용 허가 미확인. **원본 링크·타임스탬프·독자적 주제 요약·판단 기록만 보관**. 전문 자막/영상 파일/썸네일을 복제하지 않음.
- Safety: 물의 고정 수량, 체중의 20% 무게, 7일치 약, 출혈 지혈대, 방호 마스크 등에 관한 해설을 무조건적인 국내 생존지식/앱 기본값으로 전용하지 않음. 국내 공식 지침과 장비별 안전 자료 확인 및 사람 검토 필요.
- Impact: MEDIUM (사용성 설명·글감 보강), 새로운 독립 물품 기준/시장성 증거 NONE
- Status: REVIEWED (자료 메타데이터와 자막 주요 구간 해설에 한정; 공개글 작성/개정 승인 아님)
- Linked: S-004, PR #514 (보관), BAG-SIDE-01 PR #516 (앱 별도 개발), K-002 및 K-003 검토 후보
- Next: 기존 K-002와 영상의 차별 주장만 대조 → 국내 검증 후 기존 글을 갱신할지 사람 승인. 웹앱에선 준비 이유/점검 설명 및 '자세히 알아보기' 연결 후보로만 유지. Automation C/운영 일정, 원본 글, 대외 배포 변경 금지.

### S-006 — Stripe 디자인의 ‘Zombie UI’ 경고를 소개한 영상 (AgentOS)
- Source: https://www.youtube.com/watch?v=51l0BDEm9Z0
- Original presentation referenced: https://www.youtube.com/watch?v=GLvFTMtw4Jk
- Area: UX / 제품 설계 / AI 개발 품질 / BAG-SIDE-01
- Why it matters: 사용자의 실제 목적 없이 AI로 보기만 그럴듯한 화면을 반복 생성하는 위험과 ‘완성됐다’와 ‘좋다’의 차이를 설명. 생존가방 실사용에서 드러난 **보충할 때 묶음이 끝없이 늘고 개별 삭제가 어려운 문제**처럼, 겉보기보다 작업 흐름과 실제 데이터가 맞는지 검증해야 함. 시각 장식보다 기능의 의미·다음 행동·피드백 명확성을 우선.
- Reliability: 영상 메타데이터·설명·공개 전사 및 타임라인을 2026-10-11 확인. AgentOS의 한국어 **2차 해설**이며 원발표 내용을 직접 재검증한 것은 아님. 숫자 '56회 수정' 등 사례의 세부 사실은 원본 발표와 별도 대조 필요.
- Actionable criteria: (1) 우리 앱만의 관점 = 생존가방을 **오랫동안 정확히 관리**하게 함 (2) 품질 기준 = 동일 기한 보충 시 불필요한 묶음 증가 방지·기한 다른 묶음 보존·선택 삭제의 확인/되돌리기 (3) 화면 완료≠사용성 검증 완료 (4) 실제 기기 사용 결과에 따라 고침.
- Rights: 영상·자막·강연 이미지·브랜드 디자인의 복제, 번역, 상업적 재이용 허락 미확인. 링크와 독립 작성 적용 메모만 보관. 원본 디자인을 복사하지 않음.
- Impact: MEDIUM (앱·사이트 공통 UI 검수 품질), 신규 생존지식 사실 근거 NONE
- Status: APPLIED (BAG-SIDE UX 결함 검수 기준; 원발표 주장 전체 승인 아님)
- Linked: BAG-SIDE-01 PR #516, 고정 QA `qa-bag-side`, S-004 UX 사례
- Next: 실제 사용자 테스트에서 5개 필드 이하 간편 등록·날짜별 수량·안전한 삭제/복구가 직관적인지 평가. 기존 배포·사용자 기록은 보호하고 디자인만을 이유로 거대한 리팩터링 금지.

## 입력 규칙

- 사용자가 링크만 보내도 기본적으로 Source 후보로 본다.
- 운영총괄이 찾아낸 자료도 동일한 기준으로 기록한다.
- 모든 링크를 무조건 영구 보존하지 않는다. 프로젝트의 전략·생존지식·벙커·수익 실험에 실제 가치가 있는 자료를 남긴다.
- 같은 주장이나 같은 보도자료를 반복한 여러 링크는 독립 증거 여러 개로 세지 않는다.
- 안전·의학·건축·법·재난 대응처럼 고위험 판단은 원전·공식자료·전문가 검증을 별도로 확인한다.

### S-007 — 검색·영상 유통 공식 정책 재확인
- Source: [Google 재크롤](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), [Search Console 실적](https://support.google.com/webmasters/answer/7576553?hl=ko), [Google 사람 중심 콘텐츠](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [네이버 사이트 진단](https://searchadvisor.naver.com/guide/report-diagnosis), [네이버 노출·클릭](https://searchadvisor.naver.com/guide/report-expose-ctr), [YouTube 링크 공유](https://support.google.com/youtube/answer/13748639?hl=en)
- Area: 유통 / 정책 / 측정 경계
- Why it matters: Day 5 1차 정책 조사를 재사용하고 색인·노출·클릭·공유 요청·실제 준비 행동을 구분하는 근거. Shorts의 일반 URL 비클릭과 롱폼 링크 조건을 실험 순위에 반영.
- Reliability: 2026-10-13 공식 문서/검색 결과 재확인. **우리 계정의 검색·YouTube 실적 데이터는 없음**. 정책은 실행 시 다시 확인하며 검색 포함·유입·성공을 보장하지 않음.
- Rights: 원문 링크와 자체 요약만 보관. 문서·이미지·영상 전문 복제 없음.
- Impact: MEDIUM (유통 경로·측정 정의), 시장성/수익성 증거 NONE
- Status: REVIEWED (자료 내용/정책 경계에 한정, 사람 승인 receipt 아님)
- Linked: [Distribution Map V1](DISTRIBUTION_MAP_V1.md), [Experiment Brief V1](EXPERIMENT_BRIEF_V1.md), D-012/D-013, Issue #501
