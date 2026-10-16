# A-Wiki continuous review V1 — implementation and operating boundary

Stage 1 checkpoint below is retained as history. Stage 2 operating contracts,
versioned Program/Worker router and deployment boundaries are documented in
[A_WIKI_WORKER_ROUTER_V2.md](A_WIKI_WORKER_ROUTER_V2.md). Actual operating run and
DB evidence are recorded in PR #595 after verification; do not infer live
connection merely from either implementation document.

## Status: PARTIAL, not multi-world production acceptance

Baseline main: `91e64a52e43478beef8369790167b91bbc1ae3ca` (2026-10-16).
This PR implements verified source adapters, a local persistent candidate queue,
semantic result/review handoff contracts, and optional Operator telemetry rendering.
The existing C03 Native DB/Program/Worker remains unchanged. This new contract is
**not connected to that operating worker**. No migration, operating DB mutation,
schedule edit, content publication, main merge or Production deployment occurred.

## Actual investigation

- Open PRs and wiki-named branches inspected. Existing multi-chronicle branch
  covers the already merged static wiki/approval implementation; no open PR for
  continuous semantic review was found. Existing unrelated Drafts are untouched.
- Read AGENTS, central Development Constitution and Web Architecture Standard,
  A_WIKI_FACT_WORKER_V1, A_WIKI_NATIVE_HANDOFF_V1,
  A_WIKI_MULTI_CHRONICLE_V1 and operator review-status rules.
- C01: 10 verified Reader chapters, 58 nodes, 111 relations; C02: 11 chapters,
  65 nodes, 72 relations. Initial approved SEED/BOOK byte bindings are preserved.
- C03: 43 Reader chapters (S01 17 / S02 16 / S03 8 / S04 2), 77 nodes,
  148 relations, Graph anchor save 291. Discovery includes the verified historical
  Reader scope; it does not claim complete recovery of every original conversation.
- `archive_a_wiki_native_job_current()` returned `NO_JOB`. Latest durable
  publication: S04 SESSION_002, PR #562, 2026-10-15 10:50:55 UTC.
- Existing task `6ac52bb7615c81918c012afd9f4a4d80` was actually read using
  automations peek: enabled, KST 01/05/09/13/17/21, last run observed
  2026-10-16 11:58:42 UTC. No task modified or created. This is a one-time
  control-plane observation, not new dashboard telemetry.
- Existing durable table has SESSION_### identity and C03 result/proposal
  contracts. Existing public RPC and finalizer cannot accept a Reader-world
  chapter job merely because a source adapter now exists.

## Source and ownership boundaries

`wiki-review-sources.mjs` reuses the approved Reader seed loader and public RAW
catalog. It verifies SEED/BOOK approvals, per-chapter RAW bytes, public catalog
membership, and C03 Graph identity/content hash before emitting a scope. Each
scope pins world, chapter, Reader text SHA, all RAW refs/SHAs, wiki bytes, BOOK
bytes and approval bytes. A future registered Reader world requires its own
catalog and explicit approval; it never inherits C01/C02 approval.

No Runtime save_version/game_time is invented for Reader review jobs. No private
worldline/Canon input is loaded. Partial recoveries outside verified public
Reader coverage are not admitted simply because a filename or visibility says
PUBLIC. This is a Reader coverage baseline, not a raw-fragment expansion engine.

New C03 source detection delegates to existing `discoverWikiSource` and returns
`LEGACY_NEW_SOURCE / EXISTING_C03_NATIVE`; the local CLI does not enqueue it in
the new contract or create a duplicate C03 job. Existing C03 program code is
untouched. Historical re-review scopes do not become NEW_SOURCE just because
an old receipt is absent.

## Executable local queue

```sh
node archive/scripts/run-wiki-continuous-review.mjs --scan
node archive/scripts/run-wiki-continuous-review.mjs --enqueue \
  --ledger /tmp/a-wiki-review-ledger.json
node archive/scripts/run-wiki-continuous-review.mjs --extract \
  --ledger /tmp/a-wiki-review-ledger.json --result /tmp/extraction.json \
  --execution unique-extractor-execution
# A separate native execution reads the complete fixed package before this step.
node archive/scripts/run-wiki-continuous-review.mjs --review \
  --ledger /tmp/a-wiki-review-ledger.json --result /tmp/review.json \
  --execution unique-independent-review-execution
```

One active local job, world rotation by last dispatch/workload, exact scope
deduplication, hash-chained append-only events and exclusive file locking are
implemented. Storage requires a path outside the real repository, including
symlink resolution. The local ledger is an operator-owned handoff artifact,
**not a secure server-side authority**. Caller-provided execution IDs enforce
separation in the contract but cannot authenticate an AI run. Production must
bind execution ownership through its trusted control plane.

Current discovery schedules SOURCE_REVIEW scopes. Extractor candidates distinguish
MISSING_FACT, MISSING_RELATION, FACT_CORRECTION and FACT_ENRICHMENT; meaningfulness
and semantic duplicates require native judgment. Exact duplicate text and repeated
pending semantic keys are excluded. Rejected/stale unposted proposals are never
treated as published facts. New entity ID allocation, candidate priority queues
across all four change types, and automatic source-bound error reports remain
unimplemented. Do not describe these as finished automatic discovery.

Extractor output: `wiki-continuous-result-v1`, exact job/scope, COMPLETE coverage,
checked count, candidates, insufficient evidence, next review condition. Each
candidate needs world, supported existing entity IDs, meaningful change reason,
RECORDED/REPORTED, and exact source-bound quotes. Corrections/enrichments also
bind a previous record hash. Quotes establish provenance, not entailment.

Reviewer output: `wiki-continuous-review-v1`, exact job/proposal SHA, APPROVE,
HUMAN_REVIEW or REJECT, and note. Same execution ID is rejected. Full source/wiki
must be read in a fresh native execution; the Reviewer never edits the proposal.
HUMAN_REVIEW/REJECT stay terminal. No in-place override or publication exists.
APPROVE with no candidates records NO_CHANGE; APPROVE with candidates records
HUMAN_APPROVAL_REQUIRED. All original events/results/reviews remain retained.
Source/wiki drift supersedes the old active job and requires fresh extraction
and review. Identical completed scopes are not rescheduled by elapsed time alone.

## Actual local semantic pilot

Evidence: [A_WIKI_CONTINUOUS_LOCAL_E2E_20261016.json](evidence/A_WIKI_CONTINUOUS_LOCAL_E2E_20261016.json).

C01 chapter 1 was read in full and compared with existing wiki facts/relations.
The Extractor found one meaningful enrichment: at 18:48 Seoyun reports increasing
emergency-room arrivals including traffic injuries and respiratory symptoms.
The candidate retains REPORTED and the original uncertainty; it does not turn
the report into confirmed diagnoses/statistics. A fresh independent native
Reviewer read the complete chapter and all 58 nodes/111 relations, and APPROVED
the exact immutable proposal. Program submission produced
`HUMAN_APPROVAL_REQUIRED`. No SEED, approval, Graph, Fact or Receipt was changed.
The checked count 23 is the 14 existing facts and 9 relations cited to chapter 1;
it is not a count of all potential assertions in the narrative.

This is an actual **local program + native review** pilot. It is neither a
scheduled-worker E2E nor an operating Supabase publication. Only one of 64 scopes
has undergone this new semantic review, so all-world full re-review is unfinished.

## Dashboard

Optional `a_wiki.continuous_review` telemetry is rendered in the existing Operator
card. Missing telemetry says connection/aggregation unverified; it never converts
an empty legacy DB queue to an assertion that all worlds were scanned. Explicit
connected scan + NO_JOB shows normal idle. Human holds and system failures are
separate; counters, world/type, last scan and last success are supported.
Reservation ON/OFF is always “예약 상태 별도 확인 필요” until a separate trusted
task-status signal is wired. No fabricated numeric zero is shown for absent data.
The operating RPC does not emit this new telemetry yet.

## Verification and acceptance

- 139 Node assertions across new engine and existing C03 source/extractor/reviewer/
  finalizer/publication/seed/native-control tests.
- 222 web tests and `build:verified` passed locally, including TypeScript and
  public projection/Reader checks. Existing Vite bundle-size advisory remains.
- Independent content review APPROVE. Independent code audit found two P2s
  (stale/rejected semantic-key suppression, symlink ledger path); both fixed with
  regressions. Final-head CI/Preview must be checked on the submitted PR.

User test matrix: 1–10/13–14 have deterministic/fixture coverage; actual source
adapter corpus checks cover all three worlds. TEST 11 existing C03 regressions
pass locally. TEST 12 rendering is fixture-tested, not live telemetry. TEST 15
**NOT PASS**: only local Program invocation, no new-world scheduled/live Program
handoff. Full operating acceptance remains PARTIAL.

## Remaining operating connection (must not be skipped)

1. Define a trusted DB contract with explicit Chronicle/work-type/source identity;
   reuse the existing ledger where sound. Any necessary migration needs RLS,
   service-only RPC grants, immutable result/review history, one-active-job and
   stale-binding regression checks before applying. No DDL was applied here.
2. Connect existing Program prepare/consume to those contracts with a versioned
   compatibility router. Preserve C03 V1 byte-compatible behavior and priorities.
3. Implement a reviewed Reader amendment artifact and exact-byte human approval
   boundary; retain initial SEED/BOOK/PUBLIC_APPROVALS. Do not edit an approved
   SEED and automatically inherit its prior approval. Publisher must validate
   collisions/source SHA/current wiki and preserve prior revisions.
4. Only after DB + Program + finalizer are tested, extend the existing reservation
   prompt in place. Preserve task ID, enabled state, schedule, role separation,
   transport fallback rules, no paid API, no other task changes.
5. Add trusted Operator RPC aggregate telemetry. Execute C01/C02 and historical
   C03 through the real reservation or deployed Program, then verify reviewed
   publication PR → exact-head CI/Preview → authorized merge → durable DB record.
   Keep Production on its existing two-day batch gate.

Prompt delta once these prerequisites exist: add this document to authority;
retain the current V1 branch verbatim; route only an explicit new version to its
complete Reader scope/immutable proposal and corresponding service-owned submit
RPC; one execution/one role; NO_JOB ends only that run. There is intentionally
no immediately usable replacement claiming nonexistent RPCs. Do not install a
new prompt against today's C03-only DB contract.
