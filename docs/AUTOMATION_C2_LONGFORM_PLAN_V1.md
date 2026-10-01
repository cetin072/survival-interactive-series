# Automation C 2.0 — BRIEF → LONGFORM Plan V1

상태: **NEXT AFTER AUTOMATION C1 / 장기 기획 기준점**

이 문서는 《생존일기》 Knowledge Automation C의 다음 단계인 **C 2.0 Longform Synthesizer** 기획을 고정한다.

핵심 전략은 다음 한 문장으로 요약한다.

> **BRIEF로 유입시키고, 깊은 COLUMN/GUIDE로 구독·재방문을 만든다.**

---

## 1. 콘텐츠 역할

### BRIEF = 숏츠

BRIEF는 질문 하나에 빠르게 답하는 짧고 실용적인 지식 콘텐츠다.

역할:

- 게임/Archive에서 현실 생존 질문을 발견
- 검색·SNS·관련글·게임 독자의 첫 유입점
- 한 질문에 명확한 답 제공
- Topic별 지식 재료 축적
- 장기적으로 LONGFORM의 원재료가 됨

C1 자동화가 담당한다.

현재 목표 흐름:

```text
게임 / Archive
→ 현실 질문 발굴
→ Evidence
→ BRIEF
→ Topic에 축적
→ 자동 게시
```

### LONGFORM = 칼럼 / 가이드

LONGFORM은 여러 BRIEF와 Evidence를 바탕으로 하나의 큰 주제를 깊게 다루는 콘텐츠다.

역할:

- BRIEF보다 더 깊은 이해 제공
- 여러 하위 질문을 하나의 논리적 흐름으로 통합
- 추가 공식자료 조사
- 비교·판단 기준·실전 체크리스트·맥락 제공
- 독자의 신뢰, 재방문, 구독 동기 강화

C2 자동화가 담당한다.

---

## 2. C2의 가장 중요한 원칙

**LONGFORM은 BRIEF 여러 개를 이어 붙이는 글이 아니다.**

반드시 다음 과정을 거친다.

```text
같은 Topic의 BRIEF 축적
        ↓
Longform 가치 판단
        ↓
기존 BRIEF + Evidence 전체 재독
        ↓
겹치는 주장 / 빠진 영역 / 충돌 / 한계 분석
        ↓
추가 공식자료 조사
        ↓
새로운 목차와 논리 구조 설계
        ↓
독립적인 LONGFORM 작성
        ↓
BRIEF ↔ LONGFORM 상호 연결
```

즉 BRIEF는 **재료**, LONGFORM은 **새롭게 편집·조사된 독립 작품**이다.

---

## 3. 기존 저장소 구조를 활용한다

현재 Topic 구조에는 이미 다음 연결 자리가 있다.

```text
Topic
├─ brief_ids[]
└─ guide_id
```

또한 `knowledge/content/guides.json` 레지스트리가 존재한다.

C2는 이 기존 구조를 우선 활용한다.

목표 예시:

```text
community-emergency-resource-management
├─ K-004
├─ K-005
├─ K-0XX
├─ K-0YY
└─ guide_id = G-001
```

초기에는 GUIDE/COLUMN을 하나의 LONGFORM 계층으로 취급하되, 필요하면 향후 editorial type을 분리한다.

---

## 4. Longform 후보가 되는 조건

단순히 BRIEF 개수만 세지 않는다.

아래 조건을 종합 판단한다.

- 같은 Topic에 서로 보완적인 BRIEF가 충분히 쌓였는가
- 독립된 큰 질문으로 묶을 수 있는가
- 기존 BRIEF를 반복하는 것보다 큰 글로 읽을 가치가 있는가
- 독자가 저장·공유·재방문할 만큼 실용적인가
- BRIEF 사이에 추가 조사로 메워야 할 중요한 공백이 있는가
- 공식 근거를 충분히 확보할 수 있는가
- 안전·위험 경계상 LONGFORM 자동화가 가능한가

초기 운영 후보 기준은 **대략 3개 이상의 상호보완 BRIEF**를 기본 신호로 삼을 수 있으나, 숫자는 하드 규칙으로 고정하지 않는다.

강한 2개 BRIEF와 큰 편집 공백이 있으면 LONGFORM 후보가 될 수 있고, 5개가 있어도 서로 중복이면 만들지 않는다.

---

## 5. C2 Longform Synthesizer 작업 단계

### Step 1 — Topic Cluster Scan

Topic별로 다음을 읽는다.

- brief_ids
- 각 BRIEF
- 각 Evidence
- 관련 Candidate
- 기존 LONGFORM / guide_id
- 관련 story provenance

### Step 2 — Longform Readiness 판단

결과:

- `NOT_READY`
- `LONGFORM_CANDIDATE`
- `HUMAN_REVIEW_REQUIRED`

좋은 주제가 없으면 억지로 LONGFORM을 만들지 않는다.

### Step 3 — Gap Analysis

기존 BRIEF를 분석해:

- 이미 충분히 설명된 내용
- 서로 겹치는 내용
- 서로 충돌하는 내용
- 빠져 있는 핵심 하위 질문
- 지역/대상/시점 차이
- 전문 검토가 필요한 경계

를 정리한다.

### Step 4 — 추가 Research

기존 BRIEF의 sources만 재활용하지 않는다.

LONGFORM 전체 질문에 맞게 공식자료를 다시 조사한다.

원칙:

- 현실 claim은 authoritative source 기반
- 가능하면 여러 역할의 공식자료 교차검증
- 최신성이 필요한 내용은 재확인
- BRIEF 당시 자료가 오래되었으면 갱신
- 작품은 provenance일 뿐 현실 Evidence가 아님

### Step 5 — Longform Outline

BRIEF 제목들을 목차로 그대로 붙이지 않는다.

큰 질문을 독자가 이해하는 순서로 새 목차를 만든다.

예:

```text
왜 필요한가
→ 준비 수준을 어떻게 정할까
→ 물자를 어떻게 분류할까
→ 어디에 어떻게 보관할까
→ 장부와 책임은 어떻게 나눌까
→ 반출·보충·점검은 어떻게 할까
→ 분산 비축은 언제 필요한가
→ 흔한 실패와 한계
→ 실전 체크리스트
```

### Step 6 — Longform 작성

LONGFORM은 별도의 중앙 편집 규칙:

`docs/KNOWLEDGE_LONGFORM_EDITORIAL_SPEC_V1.md`

을 만들어 따르게 한다.

이 규칙은 C2 구축 시 별도로 설계한다.

### Step 7 — 연결

게시 후:

- Topic의 `guide_id` 연결
- 관련 BRIEF → LONGFORM 링크
- LONGFORM → 관련 BRIEF 링크
- 관련 다운로드/체크리스트가 있다면 연결

---

## 6. 독자 퍼널 전략

목표 독자 흐름:

```text
Google / SNS / 게임 / 관련 검색
          ↓
        BRIEF
   "이거 궁금했는데"
          ↓
   더 깊게 알아보기
          ↓
    COLUMN / GUIDE
   "이 사이트 괜찮다"
          ↓
 재방문 / 구독 / 신뢰
```

반대 방향도 지원한다.

LONGFORM 독자가 특정 세부 질문을 더 자세히 보고 싶으면 관련 BRIEF로 이동한다.

따라서 최종 구조는:

```text
BRIEF ↔ LONGFORM
```

의 양방향 지식망이다.

---

## 7. 자동화 C의 단계 구분

### C1 — BRIEF Factory

상태: **현재 구축·운영**

```text
발굴
→ 조사
→ Evidence
→ BRIEF
→ Topic 축적
→ 자동 merge
→ batched Production
```

### C2 — Longform Synthesizer

상태: **다음 개발 목표 / 아직 미구축**

```text
Topic Cluster
→ Longform readiness 판단
→ Gap analysis
→ 추가 research
→ Longform Evidence
→ Outline
→ COLUMN / GUIDE 작성
→ QA / Safety
→ Topic / BRIEF 연결
→ 게시
```

---

## 8. C2 스케줄 원칙

C2는 C1처럼 하루 두 번 돌릴 필요가 없다.

LONGFORM은 BRIEF보다 희소하고 무거운 콘텐츠이므로 다음 중 하나가 적합하다.

- **Event-driven:** Topic이 Longform-ready 조건을 충족할 때만 실행
- **저빈도 batch:** 주 1회 정도 Topic cluster를 점검
- 두 방식을 조합

C2 구축 시 비용·예약 슬롯·콘텐츠 품질을 보고 최종 결정한다.

핵심은 **발행량보다 완성도**다.

---

## 9. C2에서 반드시 유지할 안전 원칙

- 위험한 주제를 자동 게시하기 위해 위험도를 낮추지 않는다.
- 의료·약물·응급처치·수질·전기·연소·구조안전 등 고위험 영역은 기존 fail-closed 원칙을 유지한다.
- 기존 BRIEF가 LOW-risk라고 해서 LONGFORM 전체가 자동으로 LOW-risk가 되는 것은 아니다.
- LONGFORM 전체 범위를 다시 risk classification 한다.
- source conflict / unknown / copyright / stale evidence는 별도로 재검토한다.

---

## 10. C2 시작 시 첫 작업

사용자가 “자동화 C 2.0 만들자”라고 하면 이 문서를 먼저 읽고 다음 순서로 시작한다.

1. 현재 `topics.json`, `guides.json`, BRIEF/Evidence inventory 감사
2. Longform data schema 결정
3. `KNOWLEDGE_LONGFORM_EDITORIAL_SPEC_V1.md` 작성
4. Longform readiness / cluster detector 설계
5. Gap analysis + research contract 설계
6. Longform build/render 구조 설계
7. BRIEF ↔ LONGFORM 링크 설계
8. Safety/QA/release gate 설계
9. 첫 Topic을 이용한 SHADOW E2E
10. 운영 자동화 활성화

---

## 11. 제품 전략 기준점

Automation C 2.0의 성공은 “LONGFORM 글 수”가 아니다.

성공 기준은:

- BRIEF가 지속적으로 유입 콘텐츠 역할을 하는가
- 충분히 쌓인 Topic이 더 깊은 LONGFORM으로 자연스럽게 승격되는가
- LONGFORM이 단순 요약/붙여넣기가 아니라 추가 조사와 새로운 편집 가치를 가지는가
- BRIEF와 LONGFORM이 서로 독자를 순환시키는가
- 독자가 사이트를 다시 찾거나 구독할 이유를 만드는가

최종 목표:

> **BRIEF는 발견과 유입을 만들고, LONGFORM은 신뢰와 구독을 만든다.**
# C3 integration note

Future Longform automation may use the durable C3 semantic-job architecture with `job_type = LONGFORM`; this is an extension point only. C2's scope, requirements, and implementation plan remain unchanged.
