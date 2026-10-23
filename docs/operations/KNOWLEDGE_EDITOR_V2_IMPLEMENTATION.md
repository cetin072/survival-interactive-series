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

## 2026-10-23 resumed verification

The existing branch/PR was resumed at `14039e0e`. The Linux environment cannot inspect the Windows-only checkout or its logged-in browser. A local worktree at `/workspace/knowledge-editor-v2` tracks the same remote branch; the unrelated bag branch and its untracked reports were preserved. Current main `bea03b187724678e3581f93b920858a133ce75c6` was merged into this branch, not the reverse.

Confirmed fixes:

- Reproduced the previous browser CI failure. Explicit textarea labels resolve the exact label lookup. Keeping the Save label stable prevents a double click moving onto the Preview button during save.
- Exact quotes follow reordered sections; ambiguous/repeated/deleted text has no inferred anchor. The current sentence can be focused and selected, with the original reason immediately below the editor field. Dirty navigation and revision conflicts preserve input.
- Restore allocates both a new ID and a distinct stable slug on a public identity collision. The editable projection and draft record use the new identity; original jobs and the existing public URL remain unchanged.
- Publication scope now reads complete modified/untracked filenames instead of trimming porcelain output. It binds the exact candidate written during preparation.
- Privacy/safety inspection covers search descriptions, labels, captions, alternative text, tables, source notes and tool descriptions.
- Human hold/rejection participates in server-side restore enforcement. Program-error records remain visible in the existing inbox. Public observation no longer blocks editor loading. Latest request observation uses its update time.
- Cancellation before the Git handoff invalidates the lease. A later request for the same revision creates a new approval record, preserving the cancelled snapshot. Handoff/merge stages cannot be cancelled by deleting their recovery history.
- Public verification additionally checks title, description, canonical and Article identity. The existing browser CI now performs read-only Production observation using the served commit as its baseline.

Local verification (not authenticated Production mutation):

- Web: 282 tests; content/static: 71; semantic/evidence: 85; existing release/consumer: 18.
- TypeScript, verified reader build and public-boundary build passed (53 probes).
- PostgreSQL 17: the existing isolated Knowledge lifecycle workflow and expanded editor SQL contract passed. Includes denied viewer access, exact revision/CAS, locked machine QA, immutable snapshots/history, lease fencing, body-free restore, ID/slug collision, distinct-document queue intents, cancellation and retry boundaries. Production migration remains unapplied.
- Private browser: 320/390/1280; save-before-publish, double click, restoration, empty ideas, exact/moved/ambiguous quotes, dirty navigation, conflicts and denied access. Original reader/navigation and read-only operator regressions also passed locally.
- Read-only DB: all 16 requested representatives reread. Eleven non-public cases were projected/evaluated from private `/tmp` copies; source pins passed 11/11. A second DB comparison found 0 original-result/draft-SHA/revision mismatches across those 11. K-015 remains revision 1 with the original slug; the existing three publication-attempt records remain present. No private manuscript snapshot is committed or uploaded.
- K-018/025/032 still need attributed decisions for current unknowns; K-025 also has claim issues. K-027–029 retain unknowns and rights blockers. K-038 projects seven editable sections but needs missing fields, evidence and rights work. K-034/042 remain body-free held ideas. K-043/044 pass only the editorial structure evaluator; legacy tool names still require deletion or valid downloadable-resource records before the full validator can pass. None of these checks authorizes publication.

### Rollout blockers — keep PR Draft

1. Published records without semantic jobs (K-002/003/007/008/009/010) still lack a verified import into the versioned editor. Do not manufacture semantic provenance, Candidate records or approval receipts to make these pass.
2. Real authenticated V2 save/publication and post-migration operational verification remain unperformed in this environment. The existing Windows session is not available here. Synthetic Auth is not evidence of a real operator publication.
3. The immediate release gate still correctly rejects unrelated pending authored content. No batching exception or approval bypass was added. Source/rights decisions and exact approved revisions are still required.
4. No complete production rollout, database migration, PR Ready conversion or main merge is claimed. Search metadata/index/sitemap readiness does not prove search-engine indexing.

Latest CI and live observation should be read from PR #626 and its browser artifact; do not reuse an earlier HEAD's result as an exact-head PASS.

Repeated editorial publication now pins the latest verified public request in the immutable snapshot. Subsequent edits compare against that commit, while the original job/merge SHA stays immutable. A restored job with an editorial public record retains its published ID and slug. Synthetic SQL and unit contracts cover these boundaries.
The safety-specifics check also applies to edits of historically LOW-risk articles; their old classification cannot exempt newly added voltage/dosage/distance instructions.
