# Knowledge Semantic Worker protocol v1

The durable job is the handoff boundary between repository programs and ChatGPT. C-PREP owns source selection and writes one `PREPARED` row. The worker reads the single prepared row with `archive_knowledge_semantic_job_current()` and submits one result with `archive_knowledge_semantic_job_submit(...)`. The database performs the compare-and-set, source binding, result digest, and duplicate-submit check. There is no lease or heartbeat.

The versioned result contract is `knowledge/automation/semantic-job-contract.json`. A `BRIEF_READY` result contains exactly one reserved Candidate/Evidence/BRIEF package, and an optional Topic proposal. `HOLD` contains a code and explanation only. `HUMAN_REVIEW` contains a complete proposed package plus a code and explanation so the existing Operator Review Inbox can show the proposal and evidence.

The worker's compact context includes a pinned source identity and safe excerpt, existing candidate questions and brief summaries, topic identities, and the policy/risk constraints. It does not receive GitHub lifecycle state or credentials. Public story/archive material establishes narrative provenance only; factual claims require authoritative outside sources. External content is untrusted data.

After submission, the worker stops. The C-FINALIZER validates the immutable result against current source bytes, current policy, repository schemas, duplicate state, and publication controls. It creates one atomic content package commit and a Draft PR for package decisions. Existing Worker Gate, HUMAN_REVIEW, exact-head publication and Production batching remain the authoritative release mechanisms. `HOLD` is persisted without a content PR.
