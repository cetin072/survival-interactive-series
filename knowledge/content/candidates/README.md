# Candidate JSON 계약

미래 Worker가 발견한 질문은 `KC-...json`으로 기록합니다. 최소 필드: `id`, `question`, `topic_id`, `source_manifest_ref`, `source_manifest_sha256`, `status` (`DISCOVERED` / `HOLD` / `HUMAN_REVIEW` / `BRIEF_PROPOSED`), `disposition_note`, `brief_id` (없으면 `null`). Scanner는 이 파일을 작성하지 않습니다. `HOLD`와 `HUMAN_REVIEW`도 이유를 기록해야 source를 처리 상태로 넘길 수 있습니다. 현재 실제 Candidate는 없습니다.
