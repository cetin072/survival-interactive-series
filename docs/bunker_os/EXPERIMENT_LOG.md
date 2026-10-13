# Bunker OS V1 — EXPERIMENT LOG

기준일: 2026-10-10 KST

실험은 전략을 증명하려는 것이 아니라 **틀릴 수 있는 가설을 작은 비용으로 검증**하기 위해 한다.

## 상태
- `RESEARCH`: 아직 실행 방법 조사 중
- `PLANNED`: 실행안 확정 전/대기
- `RUNNING`: 실제 데이터 수집 중
- `PASS`: 확대할 증거 있음
- `FAIL`: 중단/수정할 증거 있음
- `INCONCLUSIVE`: 표본/조건 부족
- `STOPPED`: 전략상 중단

## E-001 — 유효 행동 측정 기반
- Hypothesis: 페이지뷰보다 공유·복사·다운로드·관련 지식 이동 같은 행동을 측정하면 무엇을 개선할지 더 정확히 결정할 수 있다.
- Status: RESEARCH
- Current plan: Issue #501 Sprint 0
- Signals: 최소 이벤트가 개인정보 과수집 없이 안정적으로 집계되는가, 운영자가 최근 행동을 확인할 수 있는가.
- Cost boundary: 유료 분석 서비스는 사용자 승인 전 도입하지 않음.
- Result: 아직 없음.

## E-002 — 대표 글을 “읽기 → 실제 준비 행동”으로 전환
- Hypothesis: 대표 생존지식에 하나의 명확한 도구/자료 CTA를 연결하면 유용 행동이 증가한다.
- Status: PLANNED
- Candidate: 가족 비상연락 / 비상용품 / 정전 대비 중 데이터와 기존 자산을 보고 1개 선택.
- Signals: CTA 클릭, 자료 사용/다운로드, 공유, 관련 지식 이동.
- Result: 아직 없음.

## E-003 — 검색 외 유통 채널
- Hypothesis: 검색만 기다리는 것보다 하나의 외부 유통 채널을 검증하면 사이트 행동을 더 빠르게 학습할 수 있다.
- Status: RESEARCH
- Candidates: YouTube / 커뮤니티 / 공유 확산.
- Rule: 조회수 자체가 아니라 사이트 유입과 유효 행동까지 연결되는지 본다.
- Result: 아직 없음.

## E-004 — Bunker Journey 콘텐츠 가치
- Hypothesis: 실제 공사 이전의 조사·조건 정의·전문가 검토·부지/설계 의사결정 과정도 장기적으로 따라올 가치가 있는 콘텐츠가 될 수 있다.
- Status: RESEARCH
- Why now: 실제 시공이 3년차 이후여도 준비 기간을 서사와 자산으로 만들 수 있는지 검증할 가치가 있음.
- Signals: 반복 시청/재방문, 사이트 이동, 질문·구독·제보 같은 관계 행동.
- Safety: 실제 위치·보안·취약점 등 공개 위험 정보는 별도 공개 경계 필요.
- Result: 아직 없음.

## 기록 규칙
- 실험 시작 전 가설/측정/중단 조건을 적는다.
- 결과가 없는데 PASS로 표시하지 않는다.
- 실패한 실험을 숨기지 않는다.
- 숫자가 좋더라도 NORTH_STAR와 충돌하면 확대하지 않는다.
- 실험 결과가 전략을 바꿀 정도면 DECISION_LOG와 STRATEGY를 함께 갱신한다.

## Month 01 Week 1 closeout 설계 연결 — 2026-10-14

- 상태: **Day 5 조사 문서 + Day 6 실험 설계 작성, Day 7 감독 검토 대기**. 문서 작성·PR·CI는 실험 결과나 사람 승인 receipt가 아니다.
- 근거: [Distribution Map V1](DISTRIBUTION_MAP_V1.md), [Experiment Brief V1](EXPERIMENT_BRIEF_V1.md), D-012/D-013 검토안, S-003/S-007.
- 2026-10-13 조사·10-14 최종 DB SELECT 재확인: Month 01 본 조사 Day 1~3 기록 있음, Day 4 잠정, Day 5 RUNNING, Day 6~7 본 실험/gate 완료 기록 미조회. 기존 RAW·일지·검수 이력 수정 없음. BAG-SIDE-01 등의 COMPLETED를 본 실험에 합산하지 않음.

| 기존 실험 | 이번 설계 연결 | 유지 상태·미확인 결과 |
|---|---|---|
| E-001 | 동의한 시험의 trial_start / tool_download(요청) / tool_open_report / prep_row_self_report 수기 관찰. 중복·분모·철회·QA 제외 기준은 brief 6~7절. 새 계측 서비스/테이블/엔드포인트 없음 | **RESEARCH** 유지. 수집 안정성/실제 기준선 미확보 |
| E-002 | **추천 주 실험 1개: K-002 → 실물 1종 확인 → 기존 XLSX 한 행 작성**. 첫 시작자 8명, 10분 과업, 7일/4시간/추가 0원 상한. 자기보고 완료 C/N, 사전 제안 PASS C≥6/8 / FAIL C≤2/8 / 나머지 판단 보류 | **PLANNED** 유지. 수치는 사전 목표이며 실제 관측값 없음. 증가 효과·시장 검증·앱 성공 주장 없음 |
| E-003 | 검색 우선·공유 보조는 잠정 유통 판단. Week 3에 외부 한 경로를 별도 freeze. Week 2 보조 실험 0개 | **RESEARCH** 유지. 게시/모집 메시지 발송/외부 유통 실행 없음 |
| E-004 | 기존 Bunker Journey 후보 유지, 이번 시험의 병렬 과제로 추가하지 않음 | **RESEARCH** 유지. 실제 벙커/보안 정보 공개 없음 |

다음: Day 7에서 대상·과업·측정/삭제 규칙·사전 판정·시간 한도를 검토하고 Week 2 freeze 여부 결정. 이후 승인된 사전 호환성/수기 측정 QA를 거쳐 실행한다. 실제 데이터가 생기기 전에는 기존 Result ‘아직 없음’을 바꾸지 않는다.

## Day 7 전략 리뷰·Week 2 사전 QA — 2026-10-14

- 연결: [Week 1 Review V1](WEEK1_REVIEW_V1.md), Experiment Brief 10절, 기존 D-012/D-013 검토안. 기존 전략·결정을 교체하거나 새 실험 ID를 만들지 않음.
- 기술 QA: 공개 원본과 분리한 합성 사본의 PC Excel 열기/입력/자동 계산/저장/재열기 PASS, PC/모바일 에뮬레이션 다운로드 PASS, 수기 집계 합성 15사례 PASS. 실제 모바일 앱/사람의 UI 독립 사용성은 미검증.
- E-001 **RESEARCH**, E-002 **PLANNED**, E-003/E-004 **RESEARCH** 유지. **실제 참가자 결과 미수집**, QA 성공을 실험 PASS로 승격하지 않음.
- 추천은 K-002 단일 과업, 보조 0개, 첫 PC 환경 한정 검토. 8명·10분·6/8·2/8·7일·4시간·0원 및 동의/철회/삭제 기준 유지.
- **Week 2 Freeze 미완료 / 감독 승인 대기**. 모집/실험/DB 일지·검수 receipt/자동화/Production 변경 없음.
