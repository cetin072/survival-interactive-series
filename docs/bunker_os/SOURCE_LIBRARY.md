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
- Impact: HIGH
- Status: APPLIED
- Linked: PR #493, Issue #491

## 입력 규칙

- 사용자가 링크만 보내도 기본적으로 Source 후보로 본다.
- 운영총괄이 찾아낸 자료도 동일한 기준으로 기록한다.
- 모든 링크를 무조건 영구 보존하지 않는다. 프로젝트의 전략·생존지식·벙커·수익 실험에 실제 가치가 있는 자료를 남긴다.
- 같은 주장이나 같은 보도자료를 반복한 여러 링크는 독립 증거 여러 개로 세지 않는다.
- 안전·의학·건축·법·재난 대응처럼 고위험 판단은 원전·공식자료·전문가 검증을 별도로 확인한다.
