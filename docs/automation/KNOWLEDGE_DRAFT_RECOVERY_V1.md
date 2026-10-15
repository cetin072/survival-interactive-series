# Knowledge draft recovery V1

Scope: Automation C draft-schema recovery. Original semantic_result, its digest, source/policy pins and publication approvals are immutable.

- READY/DRAFT/HOLD may omit published_at or use null. PUBLISHED still requires YYYY-MM-DD. Only the normal approved promotion fills a missing publication date.
- HUMAN_REVIEW and NEEDS_HUMAN_REVIEW in a HUMAN_REVIEW package are known QA spelling aliases for REVIEW, never PASS. The stored original is not edited.
- A BRIEF_READY submission with unknowns, conflicts, unverified rights or unverifiable provenance is projected to HUMAN_APPROVED / REVIEW and sent to the existing Operator Inbox. Evidence is not rewritten to CLEAR; unknowns are not deleted. The original decision stays in the durable semantic result.
- Candidate schema_projection records the original result/source/policy hashes and the derived brief hash. Existing source-bound reservation validation runs before staging.
- Finalizer retains KNOWLEDGE_CONTRACT plus safe field-level blocker_detail in its execution output. Repeating an unchanged failed job is not a repair.
- New preparation contexts include the canonical enum/date/uncertainty submission rules. Existing contexts and policy hashes do not change.

Operational acceptance: merge only tested code; preflight each preserved failed package on the merged main; replay one eligible job at a time using an explicit, source/result-bound retry path; verify existing Draft PR and HUMAN_REVIEW or actual PUBLISHED by readback. Never reset/approve every blocked row, rewrite original results, or clear human review merely to turn the dashboard green. Keep Production batched.
