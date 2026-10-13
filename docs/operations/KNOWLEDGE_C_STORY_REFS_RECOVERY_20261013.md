# Automation C story relation and live status recovery

Status: code and deterministic publication projection verified; live recovery
pending approved main rollout. No operational DB mutation has been performed.

## Evidence

Base main: `7d0696a8b81a5d9c1cf6cc6423f9e90a890e1cc3`.
Finalizer failures:

- K-022: [run 38308373190](https://github.com/cetin072/survival-interactive-series/actions/runs/38308373190), job 115007832659.
- K-023: [run 38339574282](https://github.com/cetin072/survival-interactive-series/actions/runs/38339574282), job 115107311331.

Both logs bind the original job to `KNOWLEDGE_CONTRACT`. Actual stored packages
reproduce `KNOWLEDGE_CONTRACT: K-022 story refs` and `K-023 story refs` in the
main Knowledge validator. K-021 succeeds with `story_refs: []`; its Candidate
still carries all Reader provenance. Neither failed chapter has an explicit
matching registry ID. Paths are not registry relations.

The dashboard counted HUMAN_REVIEW as active, marked it stalled after six
hours, read the latest HOLD reason as an error, and used static K-010 as the
latest brief. The new live contract separates machine activity, human review,
actionable BLOCKED and HOLD disposition. A historical BLOCKED whose reserved
brief ID is already PUBLISHED is history, not an actionable publication retry;
its row remains immutable. No age cutoff hides unresolved recent failures.

## Preservation and projection

`knowledge-c-story-refs-projection-20261013.json` records the exact original
job/source/policy/result pins, removed bound paths, successful source/policy
byte verification, Knowledge validation, and release gate assessment. This is
an offline projection receipt, not a publication receipt.

The program verifies reservation/result digest with the existing DB RPC, verifies
source/policy bytes, and then projects only `brief.story_refs`. It retains actual
registry IDs and removes only explicit paths already in the matching Candidate
and prepared source binding. Unknown IDs, URLs, unbound paths, mismatched source
or missing VALID receipt fail closed. No title, body, evidence, risk or provenance
is changed by this compatibility step. The original stored result is never
updated. The existing staging timestamp behavior is unchanged. Projection receipts
are also emitted into the Finalizer workflow log before publication checks.

New PREP contexts supply `story_registry_ids` and `story_refs_policy`. Existing
Worker task `6abe754980a88191986e041b52181e7d` reads prepared context and the current
result contract; its task prompt, enabled flag and 00/06/12/18 KST schedule are
unchanged. Submit rejects non-registry refs before accepting new results. Legacy
prepared contexts without a registry list accept `[]`, preserving idempotent
resubmission of already stored results. Policy files and their digest are unchanged.

## Approved rollout and sequential recovery

1. Review this Draft PR and its exact-head checks. Merge requires user approval.
   Apply the forward migration through the existing approved migration procedure
   after merge; do not run it on the operational DB before that approval.
2. Confirm main contains the projection helper and forward status/submit contract.
   The existing Finalizer explicitly checks out main; a branch-only workflow
   dispatch cannot install this fix. Do not change that authority or force deploy.
3. Re-read the exact K-022 job, reservation, source/policy/result pins, current main
   brief absence, and machine slot. Call `verifyPins` against that main and the
   existing reservation-verification RPC again. Require VALID and no existing PR.
4. In one transaction acquire advisory lock 724015 and check zero statuses in
   PREPARED/SUBMITTED/FINALIZING/PR_OPEN. Reuse
   `survival_ops.retry_knowledge_semantic_blocked_finalizer(job_id, result_sha,
   'KNOWLEDGE_CONTRACT')` for K-022 only. Invoke the existing finalizer pulse
   dispatcher; do not create a Worker or semantic execution. Wait for K-022 to
   leave the machine slot and read the actual PR/release decision and digest.
5. Repeat those exact checks and the same existing retry for K-023. Never retry
   both in one transaction or override an occupied slot. A new legitimate job
   can occupy the slot while awaiting rollout; wait for it instead of canceling it.
6. Re-read K-015/K-018 and their original review IDs, K-024 HOLD, original result
   digests and live dashboard. No duplicate review item, renumbering or forced
   publication. PR_OPEN is a valid outcome; every release/human/public boundary
   still applies. Production follows the existing two-day batch policy.

Exact retry targets (starting evidence; re-read before use):

| Brief | Job | Stored result SHA-256 |
| --- | --- | --- |
| K-022 | 56a8add3-eab3-43b4-84f2-0f27e5fbadc8 | aba32006133f648200f2e99044c284907efa5ee56b75439e34a7de2142339bc2 |
| K-023 | c75359fe-dc3a-48b0-b1c5-fec52172d01c | 974aecca99cb4ea8314579c4643e8382f25cb1cd03dd0189465b14a84488064c |

The local migration file was generated after Supabase CLI creation was attempted
but blocked by its read-only managed home directory. Existing migration files
were not modified. The forward SQL is tested in isolated PostgreSQL 17; it was
not applied to the operational project.
