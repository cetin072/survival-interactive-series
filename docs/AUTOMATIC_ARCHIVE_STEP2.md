# Automatic Archive Publication — Step 2 of 10

Status: IMPLEMENTED / OFFLINE DRY-RUN ONLY
Scope: Publication Batch identity, frozen source metadata, cost guard, attempt-budget simulation and deterministic planning.

## What this step actually does

`published source metadata -> immutable snapshot -> stable batch/task ids -> text/graph/visual delivery plan`

It does **not** rebuild Reader books, extract graph facts, detect actual visual points, generate images, persist jobs, call Supabase, publish to Netlify or enable a scheduler. These remain subsequent steps. `PLANNED_READER_INPUT` means an eligible capture span, not an already-written chapter. Balanced metadata counts do not independently prove RAW bytes; the existing publication integrity checks remain required before execution.

## Run

Node 22, built-in modules only; no new npm dependency or secret is required.

```sh
node --test archive/scripts/lib/publication-plan.test.mjs
node archive/scripts/dry-run-publication.mjs --demo-s02 --source-revision "$(git rev-parse HEAD)"
# Or supply the normalized metadata contract:
node archive/scripts/dry-run-publication.mjs --snapshot ./snapshot.json
```

The CLI only reads local JSON and prints to stdout. There is no execute flag or output-file writer. Parse failures print a bounded error without source text or secret values.

## Source contract and identity

`publication-snapshot-v1` has a Chronicle/worldline/season namespace, PUBLIC_ARCHIVE visibility, immutable checkout SHA, save/time/checkpoint anchor, PARTIAL coverage and an array of metadata-only source records. Unknown fields are rejected. RAW prose, prompts, gm_state and hidden_state are not accepted.

Every source has a namespace-checked source reference, metadata digest, capture classification, pairing flag, exact captured-message range and counts. References outside the snapshot namespace, future timestamps, invalid dates, duplicate sessions, unknown classifications and conflicting pairing metadata are rejected. Legacy sources are explicitly deferred, not rewritten or newly marked complete.

The public S02 adapter reads **only the already-published Archive MANIFEST**. It is not a general adapter from live `public_safe=true` DB rows to PUBLIC_ARCHIVE. Player-known facts are not automatically approved for the public internet. Live source selection and source-hash verification remain later integration work.

The batch id hashes the validated snapshot in canonical key/source order. The checkout SHA is retained as provenance but excluded from batch identity: unrelated code commits must not create duplicate publication batches. Source metadata, source digest, save/time, coverage or namespace changes produce a new identity. Plan identity separately includes policy, gates, budgets and task states.

Batch snapshots are defensive clones and deeply frozen. Completion receipts skip only their exact stable task ids; a completed text task does not suppress a pending image task. No receipt is created here. Durable exactly-once claiming, concurrency and resumable ledger storage are **not** claimed by this dry-run.

## Independent output lanes

- Verified paired capture: PLANNED_READER_INPUT.
- Incomplete capture: PRESERVE_FRAGMENT_ONLY.
- SESSION_001/002 legacy metadata: DEFERRED_LEGACY_ADAPTER; existing published books stay untouched.
- Graph and visual scan: WAITING_PUBLIC_CANON_INPUT. Transcript metadata alone cannot invent entities, relations or visual facts.
- Image, Storage and publication: separate capability gates, UNKNOWN by default.

An invalid image capability configuration is contained as CONFIG_REJECTED and cannot block text-input planning. Invalid source data rejects the plan without touching gameplay. No plan uses GENERATED or PUBLISHED as an achieved state.

## Cost and attempt policy

ZERO_COST_ONLY is fixed. PAID and UNKNOWN always return WAITING_HUMAN_COST_APPROVAL. Merely setting INCLUDED is insufficient: explicit zero-cost evidence, verified capability, enabled state and positive included quota are all required even for **simulated eligibility**. Environment flags cannot enable paid execution. There is no paid-approval implementation in this step.

Capability evidence is caller-supplied planning metadata, not an independent billing probe. A future execution adapter must validate current billing/quota/product support at the call boundary; it must not treat an old dry-run report as permission to spend.

For a conservative v1, limits count **attempts including failed calls and retries**, not only successful images: maximum 3 per batch, 6 per day, and 1 initial attempt + 2 retries per asset. The dry-run evaluates supplied counters but does not persist or reserve them. Future counters use Asia/Seoul day boundaries and must be atomic across workers.

## Verified public S02 example

Source checkout at local verification: `1ee5f43c7197499ca57054df7849d0ea34aa3598`.
The read-only local public MANIFEST copy matches GitHub blob `6a2d12db963d3869959e8b1c34439e377fa85b46`.
MANIFEST SHA-256: `0638c709b113830c88f8af517806969fb8182e4cca61bfb293b14e207dd4bba5`.

- Save anchor: 253 / 2027-03-23 17:50.
- 9 source sessions; 2 legacy sources remain outside the new adapter's verified-pair path.
- 7 rolling spans contain 70 recorded messages: 34 complete turn pairs plus 2 one-sided fragments.
- 5 rolling spans are planned Reader inputs; no missing dialogue is reconstructed.
- All external gates remain blocked, no images/jobs/publications are written.
- Repeated CLI runs with the same inputs are byte-identical.

Batch id: `batch-64452723ce85e955cee728f2e2b64a5977e113802897af92751b988f9b795263`.

## Verification and cost-safe delivery

56 built-in Node tests cover positive and negative cases, immutable/idempotent identity, namespace/security guards, legacy/fragment preservation, malformed inputs, cost bypasses, quota/attempt limits, task-level resume and failure isolation. Existing Archive CI also runs the real S02 CLI twice before unchanged Reader/RAW integrity checks and the existing build.

This repository is public and CI uses its existing standard `ubuntu-latest` runner. GitHub documents standard public-repository runner use as free: https://docs.github.com/en/billing/concepts/product-billing/github-actions . This verification adds no cache/artifact upload, larger runner or external service.

This code-only stage uses `[skip netlify]` in the PR title and commit message, including squash merge, to avoid new Preview/Production deployments: https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/ . Existing production remains unchanged. `[skip ci]` is **not** used; GitHub tests must run.

## Roadmap handoff

1. Foundation + live audit: completed in #133.
2. Publication Batch + cost guard + deterministic dry-run: this change.
3. RAW -> Reader automatic publication: next; reuse current Reader rather than invent prose.
4. Public entities / relationships.
5. Visual Point / Brief compiler.
6. Included-cost ChatGPT image POC / supported bridge decision.
7. Image storage / publication.
8. Scheduled batches / durable retry.
9. Archive presentation integration.
10. End-to-end season verification.

No live database migration, Canon/RAW edit, image request, paid API or scheduler change belongs to Step 2.
