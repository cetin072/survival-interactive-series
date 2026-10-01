# Knowledge Worker Protocol V1

Status: **SUPERSEDED — historical V1 worker contract.** 아래의 shadow 설정은 당시 상태이며 현재 기본값이 아니다. 현재 실행 설정은 [`knowledge/automation/config.json`](../knowledge/automation/config.json), 정상 C3 경로는 [C3 architecture](KNOWLEDGE_AUTOMATION_C3_ARCHITECTURE_V1.md)와 [semantic protocol](KNOWLEDGE_SEMANTIC_WORKER_PROTOCOL_V1.md)을 따른다.

상태: **두 차례 실제 FRESH 사이클 검증 완료 후 자동운전용 외부 Worker 계약**

이 문서는 `GAME → Archive(A) → Knowledge(C)` 연결에서 외부 ChatGPT Knowledge Worker가 따라야 할 운영 프로토콜이다.

현재 저장소의 게시 안전장치는 그대로 유지한다.

- `publication_mode = AUTO_LOW_RISK_SHADOW`
- `auto_publish_enabled = false`
- 자동 merge 금지
- Production 자동 게시 금지

따라서 이 Worker의 자동운전 범위는 **새로운 검증된 공개 Archive 입력을 찾아 Knowledge PR을 만드는 것까지**다.

## 1. 실행 조건

Worker는 주기적으로 저장소 `main`을 확인한다.

`archive/scripts/knowledge-scan.mjs --check --json`과 동일한 계약으로 새 입력을 판단한다.

처리 대상은 다음을 모두 만족해야 한다.

- `PUBLIC_ARCHIVE`
- `VERIFIED_CONTIGUOUS_TURN_PAIRS`
- `atomic_pairing_complete = true`
- public-safe source
- manifest/part hash 검증 성공
- state에 아직 처리되지 않은 `PENDING` 또는 변경 재검토 source

여러 개가 있어도 한 실행에서 **가장 오래된 source 1개만** 처리한다.

다른 PENDING source는 state에 추가하지 않고 그대로 남겨둔다.

## 2. 질문 후보 탐색

선택된 source 전체를 읽고 현실 생존지식으로 발전할 수 있는 질문을 찾는다.

게임·Archive는 **질문의 발생 배경과 narrative provenance**로만 사용한다.

게임 속 판단이나 설정을 현실 사실의 근거로 사용하지 않는다.

기존 Candidate, BRIEF, Topic과 의미 중복을 먼저 검사한다.

한 source에서 새 BRIEF는 최대 1개만 만든다.

## 3. 위험도 우선 판정

자동 글 후보는 다음 저위험 domain만 허용한다.

- `GENERAL_PREPAREDNESS`
- `FOOD_STORAGE`
- `COMMUNICATION`
- `EVACUATION`

다음 영역은 자동 글로 만들기 위해 위험도를 낮춰 분류하면 안 된다.

- 의료
- 약물
- 전문 응급처치
- 식수 정화
- 발전기
- 연소/일산화탄소
- 전기
- 구조·구조물 안전
- 중대한 피해 가능성이 있는 기타 영역

source 안에 고위험 질문과 저위험 질문이 함께 있으면, 충분히 독립적이고 의미 있는 **저위험 질문**이 있을 때만 그것을 선택할 수 있다.

저위험 질문이 없다면 억지로 BRIEF를 만들지 않는다. 필요에 따라 Candidate를 `HOLD` 또는 `HUMAN_REVIEW`로 기록하고 끝낸다.

## 4. 외부 조사와 Evidence

현실 claim은 공신력 있는 외부 자료로 조사한다.

AUTO_LOW_RISK 후보는 원칙적으로 최소 2개의 authoritative source를 확보한다.

각 claim마다 다음을 Evidence에 기록한다.

- claim
- source_ids
- context
- limitation

Evidence pack에는 반드시 다음도 기록한다.

- conflicts
- unknowns
- risk_notes
- story_source_status
- copyright_status

중요한 충돌, unknown, 저작권 불명확이 있으면 자동 게시 후보로 진행하지 않는다.

## 5. 산출물

NEW_BRIEF인 경우 최소 변경 범위는 다음이다.

- `knowledge/content/candidates/KC-....json`
- `knowledge/content/evidence/K-....json`
- `knowledge/content/briefs/K-....json`
- 필요한 Topic registry
- `knowledge/automation/state.json`

필요하지 않은 코드, workflow, Archive RAW/Reader, Graph, Visual, Illustration 파일을 수정하지 않는다.

Source state는 Candidate/BRIEF 또는 명시적 HOLD/HUMAN_REVIEW disposition이 실제 commit에 포함된 뒤에만 갱신한다.

## 6. 검증

PR 생성 전에 또는 PR HEAD에서 다음을 검증한다.

```bash
cd archive/web
npm run knowledge:test
npm run knowledge:check
node ../scripts/knowledge-scan.mjs --check --json
node ../scripts/knowledge-release-check.mjs --brief K-... --base origin/main --head HEAD
```

AUTO_LOW_RISK_SHADOW의 정상 성공값:

```text
decision = WOULD_AUTO_PUBLISH
requires_human = false
content_only.allowed = true
reasons = []
```

반드시 다음도 확인한다.

- exact target binding
- Candidate dedupe
- authoritative claim support
- source manifest SHA integrity
- repository publication config
- changed-file allowlist

검증 실패를 통과시키기 위해 gate, 위험도, config를 약화하지 않는다.

## 7. PR 운영

Worker는 source 1개당 Knowledge-only branch/PR 하나를 만든다.

PR에는 최소한 다음을 기록한다.

- source/session
- pinned source SHA
- Candidate
- BRIEF
- 위험도/domain
- 제외한 고위험 범위가 있으면 그 사실
- validation 결과
- release gate 결과

CI 이후 PR HEAD가 바뀌지 않았는지 확인한다.

현재 V1 자동운전에서는 `WOULD_AUTO_PUBLISH`가 나와도 Worker가 merge하지 않는다.

## 8. 알림

다음 경우 사용자에게 알린다.

- Knowledge PR 생성
- `HUMAN_REVIEW_REQUIRED`
- schema/source/CI 같은 blocking failure

다음은 기본적으로 조용히 끝낸다.

- 새 PENDING 없음
- 즉시 사용자 판단이 필요하지 않은 ordinary HOLD

## 9. 현재 완료된 실제 검증

첫 FRESH 사이클:

`S03/SESSION_001 → KC-storage-separation-accountability → K-005 → WOULD_AUTO_PUBLISH → PR #195 → merge`

두 번째 FRESH 사이클:

`S03/SESSION_002 → KC-waypoint-assessment → K-006 → WOULD_AUTO_PUBLISH → PR #197 → merge`

따라서 이 프로토콜은 새로운 source에서 Worker 실행을 자동화하기 위한 운영 기준으로 사용한다.

다음 단계에서 실제 `AUTO_LOW_RISK` merge와 Production 게시를 활성화하려면 별도 검증과 명시적 설정 변경이 필요하다.
