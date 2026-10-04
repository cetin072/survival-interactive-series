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

C-PREP은 FRESH가 없을 때 이 디렉터리의 `RESEARCH_REQUIRED` Seed를 오래된 순으로 하나 선택합니다. 기존 C3 job identity와 EX-001 파일럿의 `USER_REPORTED_EXPERIENCE` 계약을 재사용합니다. 선택된 경험은 질문의 출처일 뿐 현실 claim의 Evidence가 아닙니다. EX-001은 전기 안전 위험을 HIGH로 유지하며 완전한 Candidate/Evidence/BRIEF 패키지를 HUMAN_REVIEW로 보냅니다.

수동 EX-001 파일럿 입력도 계속 사용할 수 있습니다. 이미 처리된 source identity는 자동 선택에서 건너뜁니다.
