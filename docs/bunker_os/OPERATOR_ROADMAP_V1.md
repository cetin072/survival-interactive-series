# Bunker OS · 운영자 로드맵 V1 (2026-10-12)

## 목적
운영자 첫 화면 /operator/ 에 5년 북극성, Month 01 네 주, 이번 주의 증거 기반 진행 상태를 간단히 표시한다. 기존 A/A-Wiki/B/C 자동화 전광판은 바로 아래에 **그대로** 유지한다. Bunker OS 감독 상세는 /operator/bunker-os/ 로 연결한다.

### 데이터 출처 및 경계
- 5년/첫 30일 로드맵의 원전: docs/bunker_os/NORTH_STAR.md, STRATEGY.md, 이슈 #500 / #501.
- 달력상 위치(5년 중 몇 년 차/30일 중 Day N)는 접속 시 **Asia/Seoul** 기준 자동 계산. 목표의 실제 완료 비율이 아니다.
- 첫 7일의 기록 상태는 로그인된 Operator가 `archive_operator_bunker_os_read_v2(p_view:=logs,p_cycle:=MONTH01_FIND_THE_ENGINE,p_limit:=100)`로 읽는다. 기존 권한검사·일지 테이블을 재사용하는 추가 읽기 계약이며, migration 적용 전에는 조회 실패/계약 확인 안내를 표시한다. RLS·스케줄·자격증명을 바꾸지 않는다.
- Day 1~3 조사 완료는 **해당 제목/사이클/1주차 및 COMPLETED가 정확히 맞을 때만** '조사 기록 있음'. Day 4의 가설 V1은 잠정 초안. Day 5 1차 조사는 진행 기록이며 성공/완료가 아니다.
- RPC 실패·인증 실패·결과 미확인은 **조회 필요**로 표시하고 달력 날짜만 유지한다. 같은 `COMPLETED` 문자열의 생존가방 Side Track, 다른 주제/다른 사이클은 절대 조사 달성에 합산하지 않는다.
- Worklog 자체 COMPLETED, PR merge, CI success, Netlify Preview, Production 발행, 검색 노출, 사용자 준비 행동, 수익/벙커 실행은 각기 별개로 추적해야 한다.
- 기존 V1 RPC는 최신 cycle 하나만 반환한다. 추가 V2 읽기 계약은 명시적 cycle 조회와 페이지 조회를 제공한다. 화면은 첫 달 요약과 선택한 활동 주기를 구분하고, 첫 달 100건 초과 시 불완전한 요약으로 완료/미완료를 판단하지 않고 전체 기록의 페이지 조회로 안내한다.

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
- Draft PR → test/verified build/Preview 검사 후 사용자 병합 승인. Production 기존 72시간 release marker 규칙 유지.


## 구조·연결 보강 (2026-10-27)

- `/operator/?stage=year-1|week-1|day-1#operator-roadmap`: 연차/주차/일차의 목표·상태·근거·다음 행동. 미래 연차는 장기 방향과 세부계획 미정만 표시한다.
- 실재 일지 UUID와 허용된 검수 근거 URL로 연결한다. 일지에 ID가 없으면 상세 링크를 꾸며 만들지 않는다. 기획문서는 명시적 소수 목록만 제공하며, 원문 내용이나 접근 가능 여부를 자동 검증한 것으로 표시하지 않는다.
- 기존 라우터의 URL 정규화가 stage/cycle/page/category를 지우지 않도록 허용 목록만 보존한다. 인증 관련 값이나 임의 return URL은 보존하지 않는다.
- 일지/자료함은 선택 주기를 URL에 보존한다. 로그 100건, 자료 200건, 주기 목록 100개씩 조회한다. 총수는 제한 전 필터 결과이고 정렬 동률에는 ID/자료키를 사용한다. 변경되는 운영 기록의 페이지 사이에는 새 기록 유입으로 항목 위치가 달라질 수 있다. 새로고침으로 재조회한다.
- 자료함은 해당 주기의 일지 `source_candidates`만 모은다. 문서 본문 자동수집이 아니다. 분류는 서버에서 페이지를 자르기 전에 적용한다. 유효하지 않은 URL은 비활성 텍스트로 표시하며 삭제/이동/권한 확인 안내를 제공한다.
- 조회 실패는 빈 목록이 아니다. 누락된 V2 RPC, 권한 오류, 네트워크 오류는 오류/재시도 상태로 표시한다. 늦게 도착한 요청은 요청 세대와 unmount 처리로 무시한다.
- DB 적용: `20261027142431_bunker_roadmap_reads_v2.sql` **운영 미적용**. 읽기 함수 하나만 추가하며 기존 일지/콘텐츠 데이터, 쓰기 RPC, 예약은 변경하지 않는다. 별도 승인 후 적용과 실제 운영자 읽기 검수가 필요하다.
- 격리 검수: `bash archive/scripts/check-bunker-roadmap-db.sh` (외부 네트워크 없는 PostgreSQL 17, 합성 identity provider + 실제 권한 helper/기존 migration). 실제 로그인 운영 데이터 검수와 별개다.
- 브라우저 합성 검수: `python archive/scripts/check-bunker-roadmap-browser.py`; 기존 `check-operator-runtime-browser.py`로 자동화 화면 회귀 확인. 실서비스에 쓰기 요청을 보내지 않는다.
- 공개 이슈/이전 PR의 오래된 2일 정책 문구는 수정하지 않는다. 현행 72시간 정책과 어긋나는 #500/#501/#527/#544 기록은 별도 정정 대상으로 인계한다. 배포 설정/예약 자체는 변경하지 않는다.
