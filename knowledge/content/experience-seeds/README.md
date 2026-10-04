# 경험 기반 생존지식 Seed v1

실제 생활에서 겪은 사건을 생존지식의 질문으로 보존하기 위한 입력 형식이다.

## 핵심 경계

- 경험담은 **질문을 만든 provenance**이며 현실 지식의 근거(Evidence)가 아니다.
- 사용자가 직접 겪거나 확인한 내용과, 나중에 들은 원인·추정은 구분한다.
- 외부 사실 주장은 `RESEARCH_REQUIRED` 상태로 남기고 Automation C의 Evidence-first 검증을 거치기 전에는 공개 지식으로 확정하지 않는다.
- 정확한 주소·동·호수·실명 등 공개에 불필요한 개인정보는 저장하지 않는다.
- 경험 원문을 과장하거나 생존 교훈에 맞추기 위해 재구성하지 않는다.

## 표준 4단 구조

1. **experience** — 실제로 무슨 일이 있었고 당시 어떻게 판단했는가.
2. **question** — 그 경험에서 어떤 현실 질문이 생겼는가.
3. **knowledge_to_verify** — 공신력 있는 자료로 확인해야 할 지식은 무엇인가.
4. **practical_action_target** — 검증이 끝났을 때 어떤 행동 체크리스트로 연결할 것인가.

## 현재 자동화 연결

이 디렉터리는 durable 수동 Seed 저장소다. 현재 C-PREP이 이 디렉터리를 자동 스캔하도록 연결하지 않는다.
자동 소비 기능은 실제 Seed가 쌓여 필요성이 확인된 뒤 별도 변경으로 추가한다. 그 전까지는 기존 Automation C의 Candidate/Evidence/BRIEF 계약을 우회하지 않는다.

## EX-001 단건 파일럿

EX-001은 전체 디렉터리 스캔에 넣지 않습니다. C3 계약 변경과 DB migration이 적용된 뒤 기존 knowledge-semantic-prep.yml을 수동 실행할 때 experience_seed_ref에 knowledge/content/experience-seeds/EX-001-apartment-power-outage.json을 정확히 넣습니다. 이 입력만 기존 C3 job으로 준비하고, knowledge/automation/pilots/EX-001-semantic-result.template.json의 Candidate·Evidence·BRIEF를 예약된 ID에 맞춰 제출합니다. 기존 C-FINALIZER가 패키지를 검증해 Draft PR과 Operator HUMAN_REVIEW를 만듭니다. 자동 게시나 원본 사진 공개는 하지 않습니다.
