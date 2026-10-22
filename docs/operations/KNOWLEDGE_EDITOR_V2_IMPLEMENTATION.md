# Knowledge editor V2 — implementation and verification ledger

Status: implementation in progress; no overall PASS claimed. Scope follows the user supplied `codex_knowledge_editor_v2.md` and requirements 1–7.

## Reused boundaries

- Existing structured editor, Knowledge static renderer, content validator, exact-source/policy pins and human-approved release gate.
- Existing `knowledge-review-consumer.yml`, global concurrency, Vault dispatch credential, server-only worker credentials and the same Netlify Git hook. No new service, scheduler, PAT or public test account.
- Original semantic jobs, AI results, original Evidence, old review decisions/receipts and public slugs are preserved. Additive working state, version history and immutable request snapshots capture the current manuscript plus evidence decisions.

## Changes being verified

- Save is separate from approval. Publish saves the exact current working copy then requests validation. The browser cannot change the machine QA field.
- Unknowns have explicit, evidence-linked removal/support/condition/limitation decisions. Original uncertainties remain in history. Missing rights and source verification cannot be dismissed by a checkbox.
- Restore/create draft, title/source/table editing, actual block deletion, exact quote anchoring, session recovery and sticky mobile actions reuse the editor.
- Requests use exact revision/hash, one active request per job, a fenced worker lease, exact-head CI and current-main merge checks. Already-live content is observed without another deploy; merged failures resume verification.
- Main has advanced with the separately reviewed source recovery #620 and its normal recovery publications #622–625. Tests must use current identities; previous failure statuses are not assumed current.

## Evidence so far

- Existing web suite: 279 passed before the final additional UI refinements.
- Existing immediate consumer/release regressions: 18 passed.
- New editorial safety/quote/rights/exact-head suite: 9 passed.
- Reader, TypeScript/Vite, generated Knowledge consistency and public boundary build passed (52 probes).
- User logged into the existing Production operator account. Authenticated current UI was observed; new UI is not yet deployed or reported verified.
- A private, read-only local snapshot records 16 target jobs, existing user drafts and original/source digests. No unpublished snapshot is committed or uploaded.

## Pending gates

Isolated DB contract test, private scenario/browser tests at 320/390/1280, exact-head CI/Preview, authenticated new UI, preservation readback, independent review and safe service rollout. New publication is limited to an exact revision explicitly approved by the user; other scenarios use synthetic/private copies.
