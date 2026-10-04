# Automation B — Image Reviewer Scheduled Prompt

Status: **SUPERSEDED**

이 문서는 더 이상 예약 authority가 아니다.

Automation B는 `docs/automation/ILLUSTRATION_B_NATIVE_WORKER_PROMPT.md`의 단일 예약 구조로 통합되었다.

현재 Reviewer 규칙:
- INGESTING에서 Library 이미지를 직접 보고 판정을 먼저 DB에 기록한다.
- REJECT/HUMAN_REVIEW는 binary transport를 하지 않는다.
- PASS만 REVIEW_PASS_STAGED에서 작은 512×512 site PNG를 전송한다.
- pre-review Vault는 current runtime에서 사용하지 않는다.
- Finalizer는 Program이 담당한다.

별도 `Image Reviewer` 예약은 사용하지 않는다.
