# CURRENT CHECKPOINT

새 채팅에서 빠르게 이어가기 위한 사람-readable 요약.

## 현재 상태
- 게임 상태: S01 첫 플레이 + Scenario v1.0 자산화 완료
- 완료 시즌: S01 — 불길
- 지위: 재사용 가능한 Scenario v1.0 동결
- 파티: 한준호(본인), 서윤(아내), 민석(아들), 정호(아버지)
- S01 종료 시 가족 4명 전원 생존·안전

## S01 최종 결과
- 도심 아파트 직접 화재 피해 없음
- 아버지 외곽주택 본채 생존
- 외곽주택 창고 일부 피해
- 주변 산림 광범위 소실
- 일부 외곽 설비 상태 불명
- 산불 이후 호우·산사태 위험으로 아버지 집 즉시 복귀 불가
- 아버지는 임시로 도심 아파트에 합류
- 직장·학교는 일시 중단 후 정상화

## S01 자산
- `seasons/S01/SCENARIO_V1.md`
- `seasons/S01/BRANCH_MAP.md`
- `seasons/S01/EVENTS.json`
- `seasons/S01/GM_STATE.json`
- `seasons/S01/MEDIA_CANDIDATES.md`
- `seasons/S01/PLAYTHROUGH_CANON.md`
- `seasons/S01/RETROSPECTIVE.md`

## 공통 규칙으로 승격된 내용
`docs/PLAYTEST_DERIVED_RULES_V1.md`
- Player Known Information Rule
- Multi-Base Rule
- Normal Society Continuity Rule
- Risk Exposure Rule
- Player Intentional Stress-Test Tag
- Post-Disaster Secondary Hazard Rule
- Season Dual Review Rule
- Decision Cost over Event Count

## 다음 단계
S01을 더 기획하지 않는다.

다음 정식 플레이는 `S02`다.
S02는 완성 대본이나 재난 종류를 미리 공개/고정하지 않고, 플레이 직전 Hidden World Seed를 비공개 생성한 뒤 Day 0부터 시작한다.

다음 시즌의 체감 목표:
- S01의 장점 유지
- 사건 수보다 선택 비용 강화
- 자원 부족
- 정보 불확실성
- 가족 이해 충돌
- 되돌릴 수 없는 선택
- 초반 선택의 후반 회수
- 이동 외 문제해결 다양화

## S01 재플레이를 원하는 경우
새 플레이어 또는 추가 테스트에서는 `seasons/S01/SCENARIO_V1.md`와 `BRANCH_MAP.md`, `GM_STATE.json`, `EVENTS.json`을 기준으로 새로운 런 시드를 만든다.
첫 플레이 Canon을 정답 루트로 사용하지 않는다.

SAVE_STATE.json은 S01 첫 플레이의 기계 기준 결과를 보존하며, S02 시작 시 새 시즌 상태로 갱신한다.
