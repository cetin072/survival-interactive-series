# Distribution Map V1 — Month 01 / Day 5

근거 확인: 2026-10-13 · 문서 검수: 2026-10-14 KST · 상태: **조사 문서 작성, Day 7 감독 검토 대기**
기준 main: `e8ddc20955e7fede3ce52f9c557b816554c554e7` · 상위: [#500](https://github.com/cetin072/survival-interactive-series/issues/500), [#501](https://github.com/cetin072/survival-interactive-series/issues/501)

## 1. 판단

- **우선 유통 후보는 Google·네이버의 문제 해결형 검색**, 보조 후보는 **기존 공유·링크 복사**로 유지한다. 기존 Day 5 1차 결론을 뒤집을 실측 근거는 없다.
- Week 2는 먼저 기존 사이트 내부 동선으로 K-002의 준비 행동을 시험한다. 내부 연결은 새 외부 유입 엔진이 아니라 기존 방문자가 행동에 도달하는 경로다.
- 검색 노출·클릭·공유 수신자의 행동 기준선은 **미확보**다. 어느 채널도 성장 엔진으로 확정하지 않는다. Week 3 외부 유통 1개는 E-002 결과와 실제 운영 가능한 계정을 보고 선택한다.

## 2. 기존 기록과 이번 확인 범위

2026-10-13 Supabase `survival_ops.bunker_os_operation_logs`를 `cycle_key=MONTH01_FIND_THE_ENGINE`으로 **SELECT만** 조회했다. 원문·상태·검수 receipt는 수정하지 않았다. 작업 기록은 로그인 후 [기존 Operator 작업 목록](https://survival-diary-archive.netlify.app/operator/bunker-os/logs/)에서 대조한다.

| 기존 단계 | 최신 기록 해석 | 이번 문서에 이어받은 판단 |
|---|---|---|
| Day 1 — 현재 자산 Audit V1 | COMPLETED 조사 기록, reviewed_at 없음 | 생산 시스템은 존재. 새 CMS·자동화보다 행동 연결 확인 |
| Day 2 — 시장·경쟁 지도 V1 | COMPLETED 조사 기록, reviewed_at 없음 | 공공 무료 정보와 정보량으로 경쟁하지 않음 |
| Day 3 — 수익 엔진 지도 V1 | COMPLETED 조사 기록, reviewed_at 없음 | 도구·행동 먼저, 미디어·커머스·B2B 수요/수익은 미검증 |
| Day 4 — 고객 문제와 Winning Theory V1 (잠정) | DB status는 COMPLETED이나 **잠정 연구 초안**, 사람 승인 아님 | 정보량보다 작은 준비 과업 완료를 검증 |
| Day 5 — 유통 전략 지도 조사 (1차) | **RUNNING**, reviewed_at 없음 | 검색 우선·공유 보조, 계정 실측/채널 식별 공백 보완 |
| Day 6~7 / 본 실험 gate | 해당 day/gate 완료 기록 미조회 | 이 문서는 Day 6 설계안이며 실험 성공·주간 승인 아님 |

Day 1의 공개 지식 11개는 당시 스냅샷이다. 현재 main의 BRIEF에는 PUBLISHED 15개가 있으나 이를 전부 Production 실사 완료로 세지 않았다. 이번에는 아래 세 후보 페이지와 XLSX·공유 JS·robots·sitemap의 Production HTTP 200만 직접 확인했다.

- [K-002 비상용품 관리](https://survival-diary-archive.netlify.app/knowledge/emergency-supplies-inventory/): 기존 XLSX 다운로드와 공유 UI 존재.
- [K-003 가족 비상연락](https://survival-diary-archive.netlify.app/knowledge/family-emergency-contact-plan/): 기존 본문·공유 UI 존재. BRIEF tools는 비어 있음.
- [K-014 아파트 정전 범위 확인](https://survival-diary-archive.netlify.app/knowledge/apartment-power-outage-scope-check/): 기존 본문·공유 UI 존재. BRIEF는 HIGH, tools는 비어 있음.
- 코드에는 공유 요청/복사 성공 피드백이 있으나, 검색한 공개 Knowledge 코드에서 사업 판단용 이벤트 수집·집계 레이어는 확인하지 못했다. **UI가 존재한다는 사실과 이용 건수는 별개**다.

## 3. 채널 비교

아래 이용자·노동·적합성은 **계획 가정/판단**이다. 시간 범위는 초기 작업 예산이며 측정값이 아니다. 현금은 기존 계정·기기·무료 자산만 쓸 때 추가 0원이며, 유료 광고·새 장비·유료 구독을 전제로 하지 않는다.

| 채널 | 예상 이용자·방문 목적 | 재사용 자산과 행동까지의 경로 | 추가 현금·운영노동 가정 | 정책·권리·신뢰 위험 | 측정 가능 항목과 현재 공백 | 미검증 가정 | 다음 실험 적합성 |
|---|---|---|---|---|---|---|---|
| Google 검색 | 가족 물품·연락·정전의 특정 문제 해결 | 정적 글·canonical·robots·sitemap → 해당 글 → 준비 과업 | 0원. 초기 점검 30~60분, 주 30분 내 검토 | 색인 보장 없음. 안전 정보의 근거·적용범위·개정 유지 필요 | 소유 계정 접근 후 페이지별 노출/클릭. **계정 실데이터 미조회**; 현재는 공개 URL 응답 확인만 가능 | 문제 검색 수요와 도달 규모, 준비 행동으로 이어지는 비율 | 장기 우선 후보. Week 2 표본 공급/성과 보장 불가 |
| 네이버 검색 | 한국 생활 맥락의 준비 방법 탐색 | 기존 메타/정적 글 → 원문 → 같은 준비 과업 | 0원. 소유확인·진단 30~60분, 주 30분 내 검토 | 색인·수집 진단과 실제 노출/클릭을 혼동하지 않음 | 소유 계정 접근 후 콘텐츠 노출/클릭·진단. **현재 미조회** | 노출 영역·검색 의도·우리 글의 적합성 | Google과 별도 해석. 검색 실측은 계정 확인 후 |
| 사이트 공유·링크 복사 | 가족·동료에게 필요한 글 전달 | 기존 share.js → 공식 canonical 복사/공유 → 수신자 원문 → 준비 과업 | 0원. 기존 기능 점검 15~30분, 후기 검토 주 30분 내 | 원치 않는 홍보 금지. 취소·복사 실패·수신자 행동 구분. 원문 외부 전재 금지 | 동의한 시험에서 복사 성공/공유 요청을 수기 관찰 가능. 현재 중앙 집계 없음; 수신자 방문·실행 알 수 없음 | 전달할 이유·수신자 유용성, 자연 확산 | **보조 경로**. Week 2 주 행동 성공으로 계산 금지 |
| YouTube 롱폼 | 시연·설명으로 준비 방법을 배우거나 여정을 구독 | 기존 글/자체 자료·권리 확인된 삽화 → 설명 링크 → 대표 글 → 준비 과업 | 0원 조건부. 신규 1편 4~8시간 가정; 제작 가능 인력/계정 미확인 | 클릭 가능 외부 링크는 채널 고급기능 확인 필요. 타 영상/자막/음원 복제 금지, 생존 보장·실제 벙커 정보 노출 금지 | 자기 채널 Studio 접근 시 조회/유지/링크 도달 일부 확인 가능. 사이트 준비 행동은 별도 측정 필요. 실제 계정 수치 없음 | 제작 지속성·시청자와 생활 준비 과업의 일치 | Week 3 이후 후보. Week 2 선행 제작 안 함 |
| YouTube Shorts | 짧은 발견·관심·시연 소비 | 자체 짧은 시연 → 프로필 또는 관련 롱폼 → 원문 → 준비 과업 | 0원 조건부. 1편 1~3시간 가정 + 링크 동선 검수 | **Shorts 설명/댓글 일반 URL은 클릭 불가**. 조회수로 사이트 이동을 대체하지 않음 | 플랫폼 조회/관련 영상 이동과 사이트 행동은 별개. 현재 계정·전환 데이터 없음 | 여러 단계의 이탈을 감수하고도 행동에 도달하는지 | 직접 사이트 행동을 검증할 첫 채널로는 낮은 우선순위 |
| 블로그·커뮤니티 | 구체적 질문 해결·경험 비교 | 자체 작성한 짧은 문제 설명 → 허용된 원문 링크 → 글/기존 자료 → 준비 과업 | 0원. 최초 글 1~2시간 + 규정 확인/답변 주 30~60분 가정 | 각 공간의 홍보·외부 링크 규정과 권리 개별 확인. 질문/닉네임/댓글 원문 무단 수집 금지 | 자기 게시물의 허용된 반응과 동의한 방문 경로 응답. referrer만으로 완전한 귀속 불가; 실제 게시/반응 없음 | 계정·게시 허용·타깃 적합성, 답변 노동의 지속성 | Week 3 단일 외부 유통 후보. 이번에 글 게시·메시지 전송 없음 |
| 생존일기·생존지식 내부 연결 | 기존 독자가 이야기의 문제를 생활 준비로 옮기거나 관련 글 탐색 | 홈/지식 목록/이미 검증된 관련 글·이야기 링크 → K-002 → 기존 XLSX → 준비 과업 | 0원. 기존 동선 확인 30분, 새 자동 링크 생성 없음 | 게임 허구를 현실 안전 근거로 사용하지 않음. 없는 작품 연관을 만들어 연결하지 않음 | 시험 세션에서 진입 경로와 과업 결과를 수기 기록 가능. 전체 클릭·방문자 기준선 없음 | 기존 독자도 실제 준비 과업을 원하는지 | **Week 2 실행 진입 경로**. 외부 신규 유입 증거로 집계하지 않음 |

## 4. 정책 근거와 해석 한계

2026-10-13 공식 자료를 재확인했다. 정책 설명은 우리 사이트의 실적이 아니다.

- [Google 재크롤 안내](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl): 크롤 요청은 검색 포함을 보장하지 않는다.
- [Google Search Console 실적 보고서](https://support.google.com/webmasters/answer/7576553?hl=ko): 노출·클릭 지표와 사이트 내부 과업을 별도로 읽는다.
- [Google 사람 중심 콘텐츠 원칙](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): 안전 관련 신뢰·근거를 우선한다. 검색량을 얻기 위한 글 양산 근거가 아니다.
- [네이버 사이트 진단](https://searchadvisor.naver.com/guide/report-diagnosis), [콘텐츠 노출·클릭](https://searchadvisor.naver.com/guide/report-expose-ctr): 수집·색인 상태와 검색 성과를 구분한다. 계정 수치 확보 전 빈칸을 0으로 채우지 않는다.
- [YouTube 공식 링크 가이드](https://support.google.com/youtube/answer/13748639?hl=en): 롱폼 외부 링크의 고급기능 조건과 Shorts URL 비클릭을 실행 전에 재확인한다.

검색 계정의 클릭 수를 E-002 수기 표본의 분모로 나누거나, 서로 다른 기간/모집단의 숫자를 결합하지 않는다. referrer 누락·복사 링크·봇 영향이 있으므로 계정 연결만으로 채널별 준비 행동률이 완성되지 않는다.

## 5. 사다리게임 식별 결과

- 기존 S-003의 [@Ladder_Game](https://www.youtube.com/@Ladder_Game) 페이지에서 `og:title=사다리게임`, 정규 채널 URL `https://www.youtube.com/channel/UC-ruq0a4Fep64Vi2cjoL_dg` 확인.
- S-001의 [3ao8RY0otEk](https://www.youtube.com/watch?v=3ao8RY0otEk)에 대해 [YouTube 공식 oEmbed 응답](https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D3ao8RY0otEk&format=json)을 조회. 제목 **「진짜 ‘사업 전략’은 이래야 합니다」**, author_name **사다리게임**, author_url **@Ladder_Game**이 일치했다.
- 따라서 **이 추천 영상과 채널의 동일성은 메타데이터 수준에서 확인**했다. 공식 채널은 제작자 자신의 채널이라는 뜻이며 정부/학술 공인 출처라는 뜻이 아니다.
- 이번에 영상 음성·전체 자막·원전·사업 성과를 재검증하지 않았다. 기존 S-001의 전략 문제의식만 이어받으며, 다른 사업/실행 영상의 선별 학습은 미완료로 남긴다. 채널 영상 목록 추가 추출도 목록을 확보하지 못했다. 이 자료는 유통 성공이나 우리 전환율의 증거가 아니다.
- 전체 자막·영상·썸네일을 복제하지 않았고 유료 도구를 호출하지 않았다. 이 미완료 사항 때문에 유통 지도/실험 설계를 보류하지 않는다.

## 6. Day 7로 넘길 결정

1. 검색 우선·공유 보조를 **실측 전 잠정 순위**로 유지할지 검토.
2. [Experiment Brief V1](EXPERIMENT_BRIEF_V1.md)의 K-002 **실물 확인 후 관리표 한 행 작성**을 E-002 주 실험 1개로 승인/수정/보류.
3. Week 2는 보조 실험 **0개**. E-003 외부 유통은 Week 3에 한 경로만 별도 freeze한다.
4. GSC/네이버 소유권·조회 접근, 시험 가능한 성인 방문자, 로컬 XLSX 호환성은 미확인이다. 계정 권한 변경·자료 수집·시험 실행은 이번 작업에 포함하지 않는다.

2026-10-14 최종 SELECT 재조회에서도 Day 5 RUNNING / reviewed_at 없음, Day 6·M01_WEEK1_FREEZE 등의 본 실험 gate 기록 미조회로 확인했다. DB Day 5는 RUNNING 그대로다. 이 문서의 존재, PR/CI 성공 또는 달력 경과로 완료·사람 승인 receipt를 만들지 않는다.
