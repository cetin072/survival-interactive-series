# Operator runtime audit correction

## Scope

Separate dispatch, execution, stored job completion and public deployment. No
content approval, scheduler change, Production deploy, DB migration or state
repair is performed by this change. PR #626 remains behind its recovery/backup
gate; #595 remains a separate Draft. Only its existing continuous-review display
contract is reused, without importing its publisher, migrations or workflow.

## Observation contract

- A-Core and B read their fixed public GitHub workflow endpoints only after the
  existing Operator capability RPC succeeds. Credentials are omitted; no logs,
  private artifacts, provider tokens, new endpoints or permissions are added.
- A-Core dispatch success is distinct from workflow success. B Prepare failure
  takes headline priority over an older successful image. A successful Prepare
  can be a no-op; it is never evidence of a newly generated image.
- Public rate limits/CORS/errors/missing evidence fail closed. Workflow evidence
  expires after five minutes. An old successful execution is labelled old after
  30 hours, not assumed current. Failure remains a failure until newer evidence.
- Visible dashboard DB reads refresh every minute; hidden tabs do not poll.
  Two-minute-old DB observations no longer drive current counts or green badges.
  Workflow reads refresh at most every five minutes automatically, with manual
  refresh available. Site deployment cards keep their existing separate
  two-minute validity/manual refresh contract; no deployment policy is changed.
- Refresh and mutation busy state have separate ownership. A read cannot unlock
  a pending approval. Results arriving after session/view invalidation are ignored.
- Continuous A-Wiki review has separate error/approval counts and worker
  connection evidence. An unverified worker flag does not imply schedule OFF.
  Native BLOCKED cannot be hidden by continuous-review approval/running state.
- C PUBLISHED means repository completion. Inbox/detail/dashboard do not assert
  public deployment from that database state. Current site evidence remains
  separately visible. Missing/failed inbox reads are not rendered as zero items.

## B recovery boundary

Read-only comparison found an immutable retry prompt mismatch: the original
compiler at `457fcf6` reproduces the saved prompt hash; subsequent compiler
changes at `c228cb1` and `22e080d` change that hash while retaining generation
identity and contract version. Provider and review-context binding agree. The
`ILLUSTRATION_RETRY_BINDING_CHANGED` guard is correctly refusing to overwrite the
old retry identity. Do not remove it or reset failure counters.

The affected blocked attempt has no generated asset, but an earlier rejected
attempt has an output that must remain preserved. The current history API lacks
job identity/prompt; readback omits prompt, current prompt reads cover active jobs,
and vault reads require a vault item. Consequently there is no existing complete
read path that safely restores this blocked immutable payload for a normal retry.

**Pending separate approval, not executed:** design and apply a narrowly scoped
read-only service-role lookup for an exact blocked identity with expected binding
digests, excluding leases/tokens. Verify old vs current prompt policy before
choosing restoration or a separately recorded new revision. Any production
state/lease transition or image generation with additional cost requires its own
concrete approval. Do not re-run the Prepare workflow merely to test: its normal
steps also perform vault cleanup and publish prompt transport. No original image,
prompt, job status, failure count or approval was changed during this fix.

## Verification and remaining coverage

Unit regressions cover provider failure/expiry/identity, dispatch vs execution,
old B success plus new Prepare failure, combined A-Wiki failure/approval and C
repository-vs-public labels. `check-operator-runtime-browser.py` intercepts all
remote traffic, uses synthetic Auth/RPC/provider data, checks 1440/390/320px,
polling, hidden-tab expiry, denied reads and slow approval vs fast refresh.
No real approval or DB write is exercised by that test.

Actual browser login integration remains unverified without an allowed operator
session and cloud network access. Local synthetic checks, PR Preview, actual
workflow recovery and Production publication must be reported separately.

The source-library mobile input/C automation connection is a separate feature,
not part of this defect repair. Follow-up planning should first specify source
rights, immutable provenance, deduplication and approval boundaries; no automatic
publication or bulk import is introduced here.
