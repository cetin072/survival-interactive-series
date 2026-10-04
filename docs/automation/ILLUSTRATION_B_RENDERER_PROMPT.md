# Automation B — Image Renderer Scheduled Prompt

Status: **SUPERSEDED**

이 문서는 더 이상 예약 authority가 아니다.

Automation B는 `docs/automation/ILLUSTRATION_B_NATIVE_WORKER_PROMPT.md`의 단일 예약 구조로 통합되었다.

현재 구조:
- PREPARED → Native Worker의 Renderer 역할
- INGESTING → 다음 Native Worker 실행의 Reviewer 역할
- REVIEW_PASS_STAGED → PASS site asset transfer/resume
- FINALIZE_QUEUED 이후 → Program Finalizer

별도 `Image Renderer` 예약은 사용하지 않는다.
