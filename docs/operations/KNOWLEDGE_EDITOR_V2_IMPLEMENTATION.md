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

- Web: 284 tests; content/static: 71; semantic/evidence: 86; existing release/consumer: 18.
- TypeScript, verified reader build and public-boundary build passed (53 probes).
- PostgreSQL 17: the existing isolated Knowledge lifecycle workflow and expanded editor SQL contract passed. Includes denied viewer access, exact revision/CAS, locked machine QA, immutable snapshots/history, lease fencing, body-free restore, ID/slug collision, distinct-document queue intents, cancellation and retry boundaries. Production migration remains unapplied.
- Private browser: 320/390/1280; save-before-publish, double click, restoration, empty ideas, exact/moved/ambiguous quotes, dirty navigation, conflicts and denied access. Original reader/navigation and read-only operator regressions also passed locally.
- Read-only DB: all 16 requested representatives reread. Eleven non-public cases were projected/evaluated from private `/tmp` copies; source pins passed 11/11. A second DB comparison found 0 original-result/draft-SHA/revision mismatches across those 11. K-015 remains revision 1 with the original slug; the existing three publication-attempt records remain present. No private manuscript snapshot is committed or uploaded.
- K-018/025/032 still need attributed decisions for current unknowns; K-025 also has claim issues. K-027–029 retain unknowns and rights blockers. K-038 projects seven editable sections but needs missing fields, evidence and rights work. K-034/042 remain body-free held ideas. K-043/044 expose actionable legacy-resource-format issues before the full validator; tool names require deletion or valid downloadable-resource records. None of these checks authorizes publication.

### Rollout blockers — keep PR Draft

1. Published records without semantic jobs (K-002/003/007/008/009/010) still lack a verified import into the versioned editor. Do not manufacture semantic provenance, Candidate records or approval receipts to make these pass.
2. Real authenticated V2 save/publication and post-migration operational verification remain unperformed in this environment. The existing Windows session is not available here. Synthetic Auth is not evidence of a real operator publication.
3. The immediate release gate still correctly rejects unrelated pending authored content. No batching exception or approval bypass was added. Source/rights decisions and exact approved revisions are still required.
4. No complete production rollout, database migration, PR Ready conversion or main merge is claimed. Search metadata/index/sitemap readiness does not prove search-engine indexing.

Latest CI and live observation should be read from PR #626 and its browser artifact; do not reuse an earlier HEAD's result as an exact-head PASS.

Repeated editorial publication now pins the latest verified public request in the immutable snapshot. Subsequent edits compare against that commit, while the original job/merge SHA stays immutable. A restored job with an editorial public record retains its published ID and slug. Synthetic SQL and unit contracts cover these boundaries.
The safety-specifics check also applies to edits of historically LOW-risk articles; their old classification cannot exempt newly added voltage/dosage/distance instructions.

Empty-idea creation consumes the restore RPC response, including both the assigned ID and slug. The synthetic browser test saves a body-free restored idea under a different server-assigned identity rather than reusing its pre-restore state.

A stored legacy working copy is never labelled approved/published merely because its source job or old public page is PUBLISHED. Without a matching verified editor publication record it remains in review. Unrelated-pending-content release blocks have a plain Korean explanation; the release gate itself is unchanged.

## 2026-10-24 cloud follow-up — PARTIAL, not rollout approval

Resumed the existing PR #626 branch at `0f5a141c5a004bafb2c885c42fb6255bf22ea0a0`.
Remote main was `94fa9a90a741ec5815265d35dc46955a24a7d975`; it was not merged or changed.
The root AGENTS.md matches that main checkout. There is no repository `.agents/skills`
directory at this head and `/workspace/.agents` is empty. The original Windows-only
requirements file and logged-in session are not mounted here.

A concrete approval-display regression was corrected: QUEUED/CHECKING requests with
`publish_requested=false` remain in review, and cancelling a current request cannot
revive the original job's historical APPROVED label. Three regression cases cover
these transitions, including the contrasting explicit publish request.

Fresh local evidence (source tree containing this fix):
- Web: 287/287; content/static: 71/71; semantic/evidence: 86/86.
- Editorial evaluator plus existing release/consumer: 32/32 (14 + 18).
- Verified build and public boundary: PASS, 53 probes.
- Private browser clicks: PASS at 320/390/1280px with system Chromium; save before
  publish, duplicate clicks, restoration, empty draft, denied access, quote anchors,
  dirty navigation and conflict input preservation. All Auth/RPC was intercepted.
- PostgreSQL 17: the Knowledge job from `archive-exporter-migration.yml`, including
  `knowledge_editor_workflow.sql`, passed in a new container with `--network none`.
  Repository mounted read-only; fake net.http_post and synthetic profiles are the
  existing CI fixtures. This is a DB contract test, not a real Auth/API login.
- First semantic run lacked the exact historical Reader source. Fetching the
  existing `worldline/afterfall-rpg` ref made all 86 pass; no source was invented.
- Initial npm cache permissions were resolved with a `/tmp` cache. No lockfile or
  package version changed. Initial browser build had no synthetic Auth settings;
  the existing CI build settings were then used. Downloading Playwright Chromium
  returned HTTP 403; `/usr/bin/chromium` is the available fallback.

### Remaining implementation — not a Windows-only manual check

K-002/003/007/008/009/010 still cannot enter the versioned editor. Inspection
confirms editor state, versions, requests and drafts reference semantic jobs, and
get/save/request plus the worker read semantic source/policy pins. K-002/003 have
no Candidate at all; K-007/008/009/010 have existing Candidates. All six have an
Evidence file. Do not fabricate semantic results, Candidates or prior approvals.
A complete connection needs an explicit immutable legacy source identity (exact
Git commit, brief and Evidence hashes, original ID/slug), reuse of the versioned
editor with that identity, and a worker path that revalidates new edits without
claiming old publication exceptions as new provenance. This implementation is
still pending; the UI fix above does not complete it.

### Remaining actual-session checks

After the missing connection is implemented and an isolated V2 environment is
available, use the authorized existing operator session to save a private test
copy, reload it, compare revision/hash, verify original/public copy unchanged,
check-only without publication, deny viewer access, and cancel/retry an exact
revision. Record actual environment and account role, not credentials. Cloud
mock Auth and SQL claims are not substitutes for that integration check.

The specified Windows session/spec remains unavailable here. Production migration,
actual manuscript publication, main merge and Production deployment are explicitly
outside this task's authorization and were not attempted. A later real publication
check requires separate authorization for the exact revision and destination, and
must verify served deployment SHA plus body/metadata/list/sitemap while retaining
the unrelated-pending-content release gate. No claim of whole-task completion or
current-head remote CI success follows from the previous head's green checks.

## 2026-10-24 continued implementation — supersedes the incomplete connection above

The six legacy connections are now implemented, without manufacturing semantic
jobs, Candidates, old approvals or published request receipts. A common editor
identity references either an existing semantic job or a separate immutable
`LEGACY_PUBLIC` source. Legacy drafts have their own working-copy table; versions,
requests, leases, cancellation, audit events and the existing UI remain shared.
The legacy source pins the exact Git commit and original brief/Evidence bytes.
The operator sees “기존 공개 원본”, not “AI 원본”. Its original ID and public URL
cannot change on save or restore. Importing does not save or approve a draft.

The V2 migration already in this unmerged PR was extended rather than applying
DDL remotely. A read-only production check on 2026-10-24 confirmed version
`20261022163829` is absent and both editor state/documents tables are absent.
No production migration or registration was performed.

`knowledge-editor-import-legacy.mjs --commit <SHA>` emits a read-only manifest for
K-002/003/007/008/009/010. The explicit `--apply` mode requires the server credential,
checks that SHA is the served Production commit and verifies all six public pages
before registering anything. Registration is idempotent for the exact snapshot;
a changed snapshot is rejected, never overwritten. This mode has NOT been run
against Production. It is a later authorized rollout step, not a browser action.

Worker verification independently rereads source bytes from Git, checks ancestry,
identity and original hashes, then runs the existing current-manuscript evaluator.
It writes no Candidate for legacy edits and leaves existing Candidates unchanged.
New Evidence calls this `LEGACY_PUBLIC_SNAPSHOT`, not verified narrative provenance.
Old CLEAR/publication exceptions do not waive new rights checks; explicit rights
inputs are visible. Human release requires the pinned legacy origin, official
claim support, no unresolved conflicts/unknowns, current QA and human publication
policy. Automatic eligibility was not expanded. New saves still require a distinct
exact-revision publish request. Brief AND Evidence drift reject stale replacement.
K-008's unsupported existing claim remains a validation blocker, not a fabricated
PASS; operator editing is available even while publication remains blocked.

### Reproducible isolated checks

- Existing Knowledge DB CI plus `knowledge_editor_legacy.sql`: all six public Git
  snapshots are imported only into the isolated DB, then save/reload/CAS, locked
  identity, archive/restore, check-only denial of publication, cancellation/lease,
  explicit publish intent, subsequent revision baseline, viewer denial, immutable
  originals and unchanged semantic-job/review counts are checked and rolled back.
- Worker regression uses a temporary local clone, tests all six source identities,
  altered hashes, fabricated semantic origin, unchanged Candidates, rights and
  unsafe-content blockers, Evidence-only drift and the human release gate.
- Real Auth integration: `bash archive/scripts/check-knowledge-editor-auth-local.sh
  /tmp/knowledge-real-auth-final` creates a disposable Docker internal network,
  PostgreSQL 17, GoTrue 2.177.0 and PostgREST 12.2.3, builds the local app, and uses
  real password login/JWT/RPC through a loopback proxy. No Auth or RPC responses
  are mocked. Temporary editor/viewer accounts exist only in that private DB.
  Browser traffic outside loopback is denied, and `net.http_post` is the existing
  CI stub; no request can publish to GitHub/Production. The script deletes only
  its own containers/network afterward. Requires Docker, Node dependencies,
  Python Playwright and local Chromium; no production credentials.
- Local test initialization defects were corrected: GoTrue's fixture default role
  is explicitly authenticated, and PostgreSQL readiness waits for TCP rather than
  the temporary initialization socket. These are fixture settings, not changes to
  production authentication or permissions.

### Boundary after code verification

Windows is not intrinsically required to verify these editor functions: the local
real-auth integration exercises the same browser/Auth/API/SQL chain safely. It does
not inspect or reuse the user's Windows session or original Windows-only spec.
What remains outside this task is rollout: authorized migration/registration,
main merge and deployment, then an actual existing-account smoke check on that
approved environment. Actual manuscript publication still needs explicit approval
of the exact revision, with live deployment SHA/body/metadata/index/sitemap proof.
Do not ask the user to debug the six legacy connections or call synthetic/local
request cancellation an actual public publication.

Actual API regression found and fixed during the local-auth run: V2 revision
conflicts raised SQLSTATE 40001, which PostgREST treats as a transient transaction
failure and retries. They now raise PT409, preserving the same conflict message
and returning HTTP 409 promptly. Both SQL contracts and the real-auth test require
this response (under five seconds). This follows Supabase's documented warning:
https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b

Final local results for the continued implementation: web 287/287, content 71/71,
semantic/evidence/legacy worker 89/89; editorial+legacy+release/consumer targeted
suite 35/35. Verified builds retain 53 public-boundary probes. Both the existing
isolated DB contracts and six-import DB contract passed. The reusable real-auth
script passed for all six articles at 320/390/1280px, including save/reload,
original preservation, check-only vs publish intent, cancellation, denied viewer
read/write, HTTP 409 in under five seconds and concurrent save/request exclusion.
No real manuscript was published. Detailed local reports are under
`/tmp/knowledge-real-auth-final/`; source-controlled regression scripts reproduce
these checks. Remote final-head CI/Preview results belong in the PR, separately.
