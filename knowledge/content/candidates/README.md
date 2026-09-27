# Candidate JSON 계약

질문은 `KC-...json`으로 기록합니다. Scanner 입력 후보는 `source_manifest_ref`와 `source_manifest_sha256`를 사용합니다. 이미 검증된 공개 Reader 기록을 과거 자료로 검토하는 경우에는 `source_kind: "PUBLIC_READER"`, 고정된 `reader_book_ref`와 BOOK SHA-256, chapter ID와 chapter SHA-256, 해당 chapter의 `source_refs`와 `source_hashes`를 기록합니다. Validator는 Reader 안의 정확한 chapter와 그 source metadata를 검사합니다. 이 경로는 scanner state를 만들거나 바꾸지 않습니다. 공통 필드는 `id`, `question`, `topic_id`, `status` (`DISCOVERED` / `HOLD` / `HUMAN_REVIEW` / `BRIEF_PROPOSED`), `disposition_note`, `brief_id`입니다. `HOLD`와 `HUMAN_REVIEW`도 이유를 기록합니다.
