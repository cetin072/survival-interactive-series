# Knowledge Worker Protocol V2

상태: **단일 예약 Dispatcher + FRESH 우선 + 24시간 BACKFILL + 교체 가능한 AI Provider**

## 1. 실행 구조

현재 ChatGPT 예약은 Knowledge 시스템 자체가 아니라 외부 trigger/provider 역할만 한다.

```text
6시간마다 단일 예약
  ↓
Dispatcher
  ├─ 열린 Knowledge Worker PR 존재 → 종료
  ├─ PENDING / SOURCE_CHANGED 존재 → FRESH 1건
  ├─ FRESH 없음 + 06:00 KST → BACKFILL 최대 1건
  └─ 그 외 → 종료
```

FRESH가 항상 BACKFILL보다 우선한다.

BACKFILL은 별도 예약을 사용하지 않는다. 하루 네 번의 동일 예약 중 06:00 KST 실행에서만, FRESH가 없을 때 최대 1건을 검토한다. 따라서 별도의 last-backfill 메타데이터를 쓰기 위한 불필요한 state commit이 필요 없다.

## 2. Provider abstraction

현재 활성 provider:

`CHATGPT_SCHEDULED`

Provider 설정은 `knowledge/automation/provider-config.json`이 authoritative하다.

지원 슬롯:

- `CHATGPT_SCHEDULED`: 현재 사용. ChatGPT 예약 실행에서 의미판단·웹리서치·작성 수행.
- `OPENAI_API`: 향후 유료 API adapter용 슬롯.
- `OTHER_LLM_API`: 다른 LLM provider adapter용 슬롯.

Provider는 Knowledge 본체를 소유하지 않는다. 어떤 provider를 쓰더라도 동일한 `KNOWLEDGE_WORKER_JOB_V1` 입력 계약과 `KNOWLEDGE_WORKER_RESULT_V1` 결과 계약을 따라야 하며, 저장소의 Evidence/BRIEF schema와 Safety Gate를 우회할 수 없다.

향후 API 전환 시 바꾸는 범위는 trigger/provider adapter와 provider-config이며 다음은 유지한다.

- Archive scanner / source provenance
- Candidate / Evidence / BRIEF 구조
- risk policy
- dedupe
- release gate
- GitHub CI
- publication verification

API secret 값은 저장소에 기록하지 않는다. config에는 환경변수 이름만 둘 수 있다.

## 3. FRESH mode

검증된 공개 Archive scanner 결과에서 가장 오래된 PENDING 또는 SOURCE_CHANGED source 1개만 처리한다.

- PUBLIC_ARCHIVE
- public_safe
- VERIFIED_CONTIGUOUS_TURN_PAIRS
- atomic pairing
- manifest/part hash

의미기반 질문을 추출하고 기존 Candidate/BRIEF/Topic과 중복검사한다.

한 source당 새 BRIEF는 최대 1개.

고위험 주제를 AUTO_LOW_RISK로 낮춰 분류하지 않는다.

## 4. BACKFILL mode

BACKFILL은 06:00 KST 실행에서 FRESH가 없을 때만 수행한다.

대상은 이미 공개된 Archive/Reader 자료다.

최대 1개의 강한 후보만 조사한다. 좋은 후보가 없으면 억지로 글을 만들지 않는다.

BACKFILL은 신규 PUBLIC_ARCHIVE scanner source처럼 가장하거나 FRESH state를 거짓으로 생성하지 않는다. PUBLIC_READER 등 현재 schema가 안전하게 표현할 수 있는 provenance를 사용한다. schema로 안전하게 표현할 수 없으면 HUMAN_REVIEW로 멈춘다.

## 5. 공통 Semantic Worker

FRESH/BACKFILL 이후 단계는 동일하다.

1. 질문 선별
2. 의미 중복검사
3. 위험분류
4. authoritative web research
5. Evidence first
6. Candidate/BRIEF 작성
7. semantic QA
8. Knowledge-only PR
9. repository tests/CI
10. repository release gate

현실 claim은 게임/Archive를 사실 근거로 사용하지 않는다.

AUTO_LOW_RISK 후보는 원칙적으로 authoritative external source 2개 이상을 요구한다.

## 6. Concurrency guard

열린 Knowledge Worker PR이 있으면 새 FRESH/BACKFILL PR을 만들지 않는다.

기존 PR을 먼저 완료하거나 사람 판단이 필요한 상태를 유지한다. 이를 통해 6시간 예약이 같은 source 또는 BACKFILL을 중복 생성하는 것을 막는다.

## 7. 현재 publication boundary

현재:

- `publication_mode = AUTO_LOW_RISK`
- `auto_publish_enabled = true`
- LOW-risk eligible BRIEF만 automatic merge 허용
- exact prepared-head validation 필수
- merge 직전 current main 재확인 필수
- merge 후 Netlify Production `commit_ref == merge SHA` 검증 필수
- article / Knowledge index / sitemap 실제 반영 검증 필수

Semantic Worker는 직접 merge하지 않는다. Worker는 검증된 Knowledge PR에 publication-preparation label을 부여하고, GitHub Actions가 READY→PUBLISHED 준비, exact-head 재검증, exact-SHA merge, Production 검증을 수행한다.

고위험·충돌·unknown·중복·source 변경·권리 불명확·검증 실패는 기존대로 fail-closed 한다.

## 8. Scheduler

현재 ChatGPT 예약 하나만 사용한다.

권장 실행 시각:

`00:00 / 06:00 / 12:00 / 18:00 KST`

06:00 실행만 BACKFILL window 역할을 겸한다.

이 스케줄 자체는 교체 가능하다. 향후 GitHub event/cron 또는 외부 orchestrator가 동일 Dispatcher/Provider 계약을 호출해도 Knowledge 본체는 변경하지 않는다.
