# A-Wiki Worker Router V2 — operating review-only extension

This extends PR #595. The existing C03 V1 table, validation, submit RPC, receipt,
publication finalizer and deployment policy remain authoritative and unchanged.
C01/C02 and historical C03 re-reviews use an additive private DB contract. There
is no new scheduler, paid provider, autonomous publication or inherited approval.

## Contracts and ownership

- `survival_ops.a_wiki_review_jobs`: world/source/SHA/scope/BOOK/approval bindings,
  immutable prepared job, Extractor result and execution ID, fixed proposal,
  independent Reviewer result and execution ID, outcome and retained provenance.
  Same-scope dedup and one active review; a human hold does not monopolize this
  review queue. Old/stale jobs remain preserved. There is no DELETE or publication
  grant. `NOT_PUBLISHED` and `NOT_GRANTED` are enforced, including after APPROVE.
- `survival_ops.a_wiki_review_control`: last actual scan/main SHA/count, actual
  Program/dispatch observations, reviewed program ref/SHA, separate native-worker
  connectivity confirmation. `worker_connected=false` remains until the existing
  reservation actually uses the new router. DB phase is never scheduler ON/OFF.
- All tables have RLS; no public/anon/authenticated/service-role table DML grants.
  New service-only RPCs own writes. Definers have empty search paths and revoked
  PUBLIC execution. Existing Operator capability gate owns aggregate readback.
- Existing C03 V1 RPCs are not renamed, wrapped or relaxed. The new
  `archive_a_wiki_worker_current_v2()` returns `{route,job}`. An actionable C03 V1
  job always wins. C03 HUMAN_REVIEW/REJECT remain immutable and may be reported as
  legacy holds while independent historical work proceeds.

Program prepare uses the existing C03 prepare/recovery first. With no runnable
C03 job, it reuses verified Reader adapters, actual DB dispatch history for world
rotation, and exact scope dedup. It does not rerun semantic extraction on unchanged
completed scopes. An active stale scope is superseded with original evidence
intact. Consume rechecks current main source/RAW/wiki/BOOK/approval bindings before
building a fixed review job or recording the independent result. NO_CHANGE has
no publication. APPROVE with candidates ends at HUMAN_APPROVAL_REQUIRED for every
world in this review-only release; C03's existing NEW_SOURCE finalizer is separate.

New/rewritten facts in these historical jobs are never delivered to C03's V1
finalizer, which requires real Runtime anchors. There are no invented C01/C02
sessions, saves or game times.

## Program execution and exact code/source split

`archive/scripts/a-wiki-worker-router.mjs prepare|consume` is the main-compatible
entrypoint, delegating the existing C03 implementation when appropriate. Existing
workflow prepare/consume steps call this router after the PR is merged. The
review-only dispatch actions `continuous-prepare`, `continuous-consume` and
`continuous-pilot` permit an actual isolated operating connection test on this PR.
They use the same workflow and existing server-only Supabase secrets, with
contents-read permissions and no publisher/GitHub write credentials.

The DB dispatcher uses the existing Vault GitHub dispatch token. Program code is
pinned by `program_sha`; the workflow job requires dispatch `github.sha` to equal
that SHA before secrets are used and verifies checkout again. A moved branch
therefore stops the job. Source data comes from a freshly fetched main worktree;
no JS from that worktree is imported. Approved catalog code remains at the tested
Program revision. Configuration is private and operator-owned, not native-owned.
No arbitrary workflow/ref/URL is accepted by the dispatcher.

The C01 pilot revalidates the existing immutable extraction/proposal against the
current exact source scope, and records its original Extractor execution ID and
GitHub evidence-file SHA. It does **not** import the previous Reviewer APPROVE.
The Program builds a fresh operational REVIEW_READY job. A separate fresh native
Reviewer must read that complete job and submit a new decision. No fact is
published and no initial SEED or PUBLIC_APPROVALS item is edited.

## Native task prompt replacement (install only after DB/Program verification)

Keep task `6ac52bb7615c81918c012afd9f4a4d80`, enabled state, timezone and the existing
KST 01/05/09/13/17/21 schedule. Do not create a task or change scheduling. Add this
file to authority along with current-main A_WIKI_FACT_WORKER_V1.md and
A_WIKI_NATIVE_HANDOFF_V1.md. During this authorized operating pilot, load this V2
file from the exact reviewed Program commit (explicit immutable SHA in the task
prompt), while V1 authority remains current main. Do not follow a mutable PR ref
as Native authority. After merge, current main may own V2 as well. The task must
retain its prohibition on changing
itself or any other reservation.

1. Read `public.archive_a_wiki_worker_current_v2()` once.
2. `route=C03_V1`: use the returned `job` exactly as the old current RPC response.
   Perform the existing V1 Extractor/Reviewer role, version, submit RPC and
   transport rules verbatim. One execution, one role; preserve all terminal and
   binding-mismatch behavior. Never send a V1 result to the continuous RPC.
3. `route=CONTINUOUS_REVIEW_V1`: use only that exact `job.payload`. Each fresh
   execution has a distinct `p_execution_id` (8–180 ASCII alphanumeric/`:_.-`
   characters), retained in DB. It must not reuse the Extractor execution ID for
   Review. The execution identity is a declared Native runtime identity, not a
   cryptographic attestation; actual separate scheduled/native runs remain an
   operating requirement.
4. EXTRACTOR_READY: read the complete `payload.scope.source.text` and all existing
   nodes/facts/relations. Create only `wiki-continuous-result-v1` with the exact
   prepared job ID/scope SHA, COMPLETE coverage, checked count, candidates,
   insufficient evidence and next condition. Preserve recorded/reported/uncertain
   distinctions; do not promote choices, plans or hearsay. Candidates use existing
   world-scoped entity IDs, meaningful change reason, assertion kind and exact
   source-SHA-bound quotes; corrections/enrichments also bind the prior record
   hash. Unsupported new entity allocation is deferred, never invented.
5. REVIEW_READY: a fresh independent native execution reads the complete fixed
   `payload.job.scope` and `payload.proposal`; it never edits them. Return only
   `wiki-continuous-review-v1`, exact job/proposal SHA, APPROVE/HUMAN_REVIEW/REJECT
   and reason. Check entailment, identity, chronology, completeness, semantic
   duplicates, strength of relations, uncertainty and meaningfulness. Previous
   reviews are not approval authority.
6. Submit exactly once using
   `public.archive_a_wiki_review_submit(p_job_id,p_expected_phase,p_binding_sha256,p_result,p_execution_id)`.
   The canonical semantic proposal SHA and PostgreSQL JSONB transport binding SHA
   are distinct; copy each exact returned value. After ACCEPTED/ALREADY_SUBMITTED,
   end the execution. Program consumes the durable result and owns all advances.
   On REJECTED do not alter results to retry. Preserve HUMAN_REVIEW/REJECT evidence.
7. If the submit tool blocks at transport before a DB response, use only the
   existing documented transport-only Base64 fallback after unchanged-phase
   readback. Never use encoding to evade a database rejection or review gate.
8. IDLE/NO_JOB: at most one `archive_a_wiki_review_dispatch('continuous-prepare')`
   request may ask the Program to scan; then end this execution. Keep the recurring
   reservation ON. No source means normal idle, never scheduler shutdown.
9. No native Graph/SEED/Fact/Receipt/approval/main/PR/publication mutation, no other
   Program RPC, no paid API, no new schedule or schema changes. Program-owned
   phases simply end this native execution.

Do not replace the task prompt until the workflow/DB contracts and actual Program
prepare/consume are verified and an explicit immutable Program SHA supplies the
V2 authority. Preserve current-main V1 authority and all its submit behavior.
A PR-only Program pilot is not proof that the existing scheduled task has adopted
V2; confirm prompt readback and a separate actual run of that same reservation.
Updating the prompt after these checks is within this Stage 2 user authorization;
it does not authorize main merge or a Production deployment.

## Dashboard and rollout

The existing authenticated `archive_operator_system_status()` composition returns
`a_wiki.continuous_review` from actual DB rows. Initial C03/B/C aggregates and the
original capability check remain intact. New fields distinguish semantic holds,
independent review decisions, human approval **required** counts, actual approval
count zero, candidate/duplicate/NO_CHANGE counts and publication count zero.
Missing data is unknown, not zero. The task ON/OFF label stays separate-confirmation.
The UI change is available on the PR Preview, not claimed deployed to Production.

Before operating DDL: isolated PostgreSQL 17 tests, C03 recovery regressions,
service-only/RLS/independence/no-bypass/retained-history tests, independent code
review and PR CI. Then apply the additive migration once, recheck permissions and
advisors, configure only the reviewed Program ref/SHA, run the C01 pilot and actual
consumer, then a fresh independent Reviewer. Record actual run IDs, DB state and
original byte preservation in the PR. A main merge requires the repository's human
approval; this user request authorizes PR update/connection validation, not an
unreviewed merge or Production deployment. Keep the two-day release policy.

## Operating DDL verification — 2026-10-16

Applied migration version `20261016141219` (`a_wiki_continuous_runtime_v1`), after
local PostgreSQL 17 and GitHub DB/native-contract CI passed. The CLI-created
migration file was renamed to the actual platform-assigned applied version;
its SQL bytes are unchanged. Initial transport request expired with no DB change;
absence was read back before the successful retry. No migration was applied twice.

Both new private tables have RLS enabled and no anon/authenticated SELECT or
service-role direct UPDATE privileges. Anon submit and authenticated Worker-read
are denied; service prepare is granted. Security advisors return INFO-only
RLS-without-policy entries for these intentionally deny-all private tables; access
is exclusively through guarded definers, matching the existing C03 architecture.
See https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

The original five C03 durable rows still hash to
`d555adf7c610cabea2257898a555a4e98945ee70fc86d48f9d804c955d115505`.
Definitions of the original prepare/current/submit/advance/recovery-current RPCs
were compared before and after and remained exactly equal. Original Graph,
SEED, BOOK, RAW, PUBLIC_APPROVALS, Fact/Receipt and release marker files are absent
from this PR's diff. The new router initially returned IDLE/NO_JOB, and
`worker_connected` remains false. Subsequent actual Program/native pilot results
must be checked separately in PR #595; this DDL verification does not imply a
published fact or a changed reservation prompt.


## Operating REST correction

The first actual Program pilot (`38914185445`) validated C01 source and imported
only its durable extraction. Operating REST pg_safeupdate then rejected a singleton
control UPDATE lacking WHERE; the durable phase remained EXTRACTOR_SUBMITTED and
review_result remained null. No original fact/review was reset. Follow-up migration
`20261016141914` changes only the three control writes to WHERE singleton=true,
retaining the first migration and all rows. Isolated DB and GitHub DB-contract
checks passed; actual REST and Program resume are verified in the subsequent
PR #595 execution evidence. C02 scopes also omit nonexistent optional season
metadata so all three worlds roundtrip through JSON/hashing without inventing a
season or Runtime anchor.
