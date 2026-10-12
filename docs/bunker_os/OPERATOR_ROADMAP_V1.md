# Bunker OS · 운영자 로드맵 V1 (2026-10-12)

## 목적
운영자 첫 화면 /operator/ 에 5년 북극성, Month 01 네 주, 이번 주의 증거 기반 진행 상태를 간단히 표시한다. 기존 A/A-Wiki/B/C 자동화 전광판은 바로 아래에 **그대로** 유지한다. Bunker OS 감독 상세는 /operator/bunker-os/ 로 연결한다.

### 데이터 출처 및 경계
- 5년/첫 30일 로드맵의 원전: docs/bunker_os/NORTH_STAR.md, STRATEGY.md, 이슈 #500 / #501.
- 달력상 위치(5년 중 몇 년 차/30일 중 Day N)는 접속 시 **Asia/Seoul** 기준 자동 계산. 목표의 실제 완료 비율이 아니다.
- 첫 7일의 기록 상태는 로그인된 Operator의 기존 `public.archive_operator_bunker_os_logs(p_status:=NULL,p_limit:=100)` 권한검사 RPC로 읽는다. 새 DB/RLS/스케줄/자격증명은 추가하지 않는다.
- Day 1~3 조사 완료는 **해당 제목/사이클/1주차 및 COMPLETED가 정확히 맞을 때만** '조사 기록 있음'. Day 4의 가설 V1은 잠정 초안. Day 5 1차 조사는 진행 기록이며 성공/완료가 아니다.
- RPC 실패·인증 실패·결과 미확인은 **조회 필요**로 표시하고 달력 날짜만 유지한다. 같은 `COMPLETED` 문자열의 생존가방 Side Track, 다른 주제/다른 사이클은 절대 조사 달성에 합산하지 않는다.
- Worklog 자체 COMPLETED, PR merge, CI success, Netlify Preview, Production 발행, 검색 노출, 사용자 준비 행동, 수익/벙커 실행은 각기 별개로 추적해야 한다.
- Bunker OS 기존 RPC가 **가장 최근 cycle_key 하나만** 반환하므로 새로운 사이클에서는 Month 01 과거 기록을 더 이상 조회할 수 없다. 이때 과거 단계를 완료라고 추측하지 않는다. V2에서 과거 milestone snapshot이나 cycle-scoped read RPC를 별도 보안 검토하여 추가해야 한다.

### 미래 마일스톤 자동 갱신 계약 (안전한 초안)
- 우선 Month 01 1주차 Day 6/7 및 Week 2/3/4의 stage gate가 UI에 정의돼 있다.
- 신뢰할 수 있는 작업이 사용자 검토를 거쳐 실제 완료됐을 때만 **기존 Bunker OS 일지**에 아래 메타를 포함한다:
```json
{
 "roadmap_gate": {
   "version": 1,
   "id": "M01_WEEK2_ACTION",
   "verdict": "VERIFIED",
   "evidence_url": "https://github.com/cetin072/survival-interactive-series/pull/EXAMPLE"
 }
}
```
- 반드시 작업 `status=COMPLETED` + `reviewed_at`(기존 사람 확인 receipt) + 같은 cycle key + 정확 milestone ID + 허용된 https 출처 조건을 모두 만족해야 **근거 검수 완료**로 표시한다. 없는 기록은 완료가 아니며, 가짜/외부 URL로 자동 승격하지 않는다.
- 이 단계의 웹 UI는 GitHub/Netlify 실제 원격 상태를 **직접 검증하지 않는다**. 위 조건은 이미 검증해 남긴 작업의 보고를 표시하는 V1 표시 게이트일 뿐, 증거 URL이 존재하고 내용이 맞는지는 기존 리뷰 책임이다.
- 이후 V2는 기존 PR/CI, release marker/Production deploy readback, 지식 발행 receipt 및 익명화된 유용 행동 집계를 프로그램으로 대조하고, 각 마일스톤 유형별 판정에 필요한 **정확한 증거 묶음**을 설계해야 한다. GitHub 병합 1건으로 '상용화'나 '벙커 진행률'을 올리지 않는다.
- 자동 갱신은 **화면 로드/기존 새로고침에 한정**. 새 주기 예약/상시 AI 모니터를 만들지 않는다. 추가 증거 자동 검사 도입은 사용자와 위험/비용/운영 주기 합의 후.

### 모바일·권한
- Operator Auth 통과 전에는 Bunker logs를 읽거나 표시하지 않는다.
- service_role 브라우저 노출 금지, 사용자 개인정보/토지/실제 비공개 벙커 위치 공개 금지.
- 현재는 기술 확인 V1만 구현하고 Day 5/6/7 전략 기록을 저절로 완료로 변경하지 않는다.
- Draft PR → test/verified build/Preview 검사 후 사용자 병합 승인. Production 기존 2일 release marker 규칙 유지.
