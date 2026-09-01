# Canon v2 Reboot Plan

Status: Planning baseline  
Parent: GitHub Issue #45 / #46 / #49

## 1. 결정

기존 S01~S07-era 자료는 **Legacy Prototype Timeline**으로 동결한다.

새 정식 연속성은 **Canon v2 / Reboot S01**에서 시작한다.

이 결정은 기존 플레이를 삭제하거나 실패로 취급한다는 뜻이 아니다. Legacy는 실제 플레이테스트와 설계 학습의 원본 기록이다.

## 2. Legacy에서 보존하는 것

- 시즌별 Playthrough Canon
- Retrospective
- 플레이어 피드백
- 검증된 좋은 규칙
- 실패한 설계와 원인
- 거점/협업/가족/재난 실험
- 생존 지식 Source 기록
- 개발/엔진 학습

## 3. 자동 승계하지 않는 것

Reboot S01은 다음 Legacy 누적 상태를 자동 보유하지 않는다.

- S01~S05에서 성장한 외곽 거점 능력
- 마을 비상협력망의 현재 운영상태
- 최씨 가구와의 누적 협력자산/관계
- Legacy 회사/학교/병원 위기 경험
- Legacy 시즌에서 획득한 자원과 장비
- Legacy Save/GM_STATE의 현재 위치·시간·행동
- S07 준비용 handoff/world assumptions

이 요소들이 IP 설정으로 가치가 있다면 Reboot baseline에서 **처음부터 존재하는 설정인지, 플레이 중 다시 획득할 성장인지** 명시적으로 재결정한다.

## 4. 재사용 가능한 것

다음은 현재 세계상태가 아니라 설계 자산이므로 검토 후 Canon v2에 재사용할 수 있다.

- 가족 4인 구조
- 한국 현대 배경
- 가족 분산/합류 가능성
- 도심/외곽 등 서로 다른 거점 가치 개념
- 이해관계 기반 협력 개념
- Player Known Information Rule
- Risk Exposure Rule
- Decision Cost over Event Count
- Multi-Action Opportunity Cost
- 반복 운영 AUTO 압축
- Hidden World Seed
- MUD_TEXT_V1
- `AI proposes, engine commits.`
- 시즌 종료 생존 복기

단, 기존 규칙 중 `정상사회 지속/복귀`를 강하게 기본값으로 두는 부분은 Canon v2의 **장기 아포칼립스 방향과 충돌하지 않도록 재검토**한다.

## 5. 저장소 구조 방향

기존 파일을 즉시 대규모 이동하면 링크와 개발흐름을 깨뜨릴 수 있으므로 단계적으로 전환한다.

### Phase 1 — 선언적 분리
- IP Bible v2 추가
- Post-Season Debrief v1 추가
- Reboot Plan 추가
- README/START_HERE에서 Legacy와 Canon v2를 명확히 구분

### Phase 2 — Canon v2 런타임 분리
권장 후보:

```text
canon_v2/
  CHARACTERS.json
  PERSISTENT_CANON.md
  START_STATE.json

seasons_v2/
  S01/
```

또는 기존 구조를 유지하되 `timeline_id`를 도입할 수 있다.

정확한 구현 방식은 현재 Validator/웹 로더와 충돌 여부를 확인한 뒤 정한다.

### Phase 3 — Legacy Freeze Marker
기존 `seasons/S01`~`S07`, Legacy Persistent Canon/Save가 현재 정식 게임 부팅에 사용되지 않는다는 표식을 둔다.

삭제는 하지 않는다.

## 6. 부팅 경계

새 채팅에서 다음 표현은 Canon v2를 의미한다.

- `정식 시즌 1 시작`
- `리부트 시즌 1 시작`
- `Canon v2 시즌 1 시작`

이 경우 GM은 Legacy `PERSISTENT_CANON`, Legacy `SAVE_STATE`, Legacy S07 handoff를 현재 상태로 읽어서는 안 된다.

반대로:

- `예전 시즌 이어가기`
- `Legacy S05 확인`

처럼 명시하면 Legacy 자료를 참조할 수 있다.

## 7. Reboot S01 시작 전 최소 공개 Baseline

리부트는 완전 무설정 상태에서 시작하지 않는다. 플레이어가 현실적으로 알고 있는 일상 정보는 시작 전에 확정한다.

필수:
- 가족 4인의 기본 관계와 나이대
- 각자의 평소 생활/직장/학교 역할
- 평소 거주 구조
- 주요 차량의 기본 소유/사용 구조
- 시작 시 평범한 생활 수준
- 플레이어가 이미 알고 있는 기본 준비 수준

그러나 Legacy 시즌에서 성장한 `강화된 생존거점`을 자동으로 넣지 않는다.

## 8. 캐릭터 강화 Baseline

Reboot S01 시작 전에 가족 4인 각각에 다음 필드를 갖춘다.

```text
want
fear
stubborn_point
strengths
weaknesses
conflict_axis_with_player
independent_decision_examples
long_arc_question
```

이 값들은 대사를 꾸미기 위한 문구가 아니라 실제 행동 판단에 사용한다.

## 9. Hidden World Seed Gate

Reboot S01의 실제 재난은 플레이 직전 비공개로 생성한다.

최소 포함:
- 시작 날짜/시간대
- 가족 위치
- 주요 차량 위치
- 평시 세계 상태
- 재난의 실제 정체
- 장기 규모
- 핵심 외생 압력
- 2차/연쇄 위험
- 정보 공개 방식
- 주요 Phase 전환 조건

금지:
- 플레이어에게 사전 재난 정체 공개
- 확정 정답 루트
- 확정 클라이맥스
- 확정 엔딩
- 플레이어 선택과 무관한 강제 손실 목록

## 10. Reboot S01의 품질 Gate

첫 장면을 내기 전에 GM은 내부적으로 확인한다.

- 이 사건은 기존 Legacy 시즌보다 충분히 큰 세계 압력을 만드는가?
- 가족 4인이 각각 자기 판단으로 움직일 가능성이 있는가?
- 첫 몇 장면 안에 단순 `기다린다/확인한다/이동한다` 반복을 벗어나는가?
- 플레이어가 동시에 지킬 수 없는 가치가 생길 가능성이 있는가?
- 장기적으로 세계가 원상복귀만 하는 구조가 아닌가?
- 시즌 종료 후 실제 생존교육으로 연결할 현실 주제가 있는가?

## 11. 시즌 번호 정책

사용자에게 보이는 정식 작품 기준:
- Reboot S01 = **정식 시즌 1**

Legacy는:
- `Legacy S01`~`Legacy S07`

로 구분한다.

파일 경로는 기술 전환이 끝날 때까지 기존 번호와 혼동될 수 있으므로 UI/문서에서 `timeline_id` 또는 `Legacy/Reboot` 접두를 적극 사용한다.

## 12. 현재 전환 순서

1. IP Bible v2 확정
2. Post-Season Survival Debrief v1 확정
3. Legacy Freeze/Boot Boundary 구현
4. Reboot 가족 4인 캐릭터 baseline 확정
5. Reboot 시작 상태 확정
6. `정식 시즌 1 시작`용 최소 boot 문서 생성
7. 새 채팅에서 Reboot S01 Hidden World Seed 생성 후 플레이
8. 플레이 결과를 Canon v2에만 기록

## 13. 주의

AI GM Web Runtime 개발(#42~)은 계속 진행할 수 있지만, **IP Canon 전환과 기술개발을 같은 PR에서 섞지 않는다.**

웹게임은 정식 Canon v2를 읽을 수 있도록 나중에 전환하되, 지금 리부트 결정을 웹 구현 완료까지 기다릴 필요는 없다.

즉 ChatGPT 기반 정식 S01 플레이를 먼저 시작하고, 웹은 이후 같은 Canon v2를 소비하도록 맞춘다.
