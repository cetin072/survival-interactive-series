# Operator Console

The `/operator/` console uses the existing Supabase Auth project and the `survival_archive.review` database capability. It has no sign-up flow. An active `super_admin` profile can sign in; Postgres checks the real profile and role on every RPC call. A signed-in user without the capability receives a denied response.

For local or Deploy Preview builds, provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` using the host's environment settings. These are browser-visible values. Never set a service role key as a `VITE_` variable or in this app. The service role is used only by the repository-owned Knowledge workflow to enqueue review metadata.

Review decisions are written to `survival_ops.archive_review_items` and `archive_review_decisions` through restricted database functions. Approve, hold, and reject do not merge GitHub changes or deploy Netlify. The inbox reports only rows written by a worker; it does not synthesize items from checked-in content.

The preview's `/operator/` route is excluded from indexing. It is still protected by Supabase authentication and database capability checks; the route's obscurity is not treated as security.


## Human-review round trip

Automation C now treats a machine result that requires human review as an Operator handoff rather than a failed publication. The exact Worker PR number, branch and head SHA are stored as review metadata. Approve/Hold/Reject still write only to Supabase.

A repository-owned scheduled consumer checks at most one approved item per run. APPROVED is not a publication bypass: the consumer requires the approved PR/source identity to still match, re-runs the Knowledge contract/evidence/source/content-only gates, prepares the BRIEF as HUMAN_APPROVED, waits for PR checks, merges the exact prepared head, and then records a consumption receipt. HOLD and REJECTED are never returned by the approved-item RPC.

If main or the reviewed PR identity has moved, the approval fails closed instead of publishing stale content. Netlify Production remains controlled by the existing batched release gate.

Operator Auth/RPC connects only to the exact configured Supabase project origin.
The Operator-only public deployment observations additionally allow the two exact
provider origins documented below. No wildcard network origins are permitted.

## 주요 사이트 · 48시간 배포 현황

`/operator/` reuses the existing refresh button, Supabase session and the successful
`archive_operator_system_status` capability check. Only then does it issue public
GETs for Taejang, Survival Diary Archive and **worklog-voice-pwa** (not
work-notebook-app). The four automation boards and the current screen's build /
release-marker evidence remain separate from these live site observations.

`siteDeploymentStatus.ts` reads each site's public Netlify site snapshot and
recent Production deploys, the repository's main ref, the policy pinned to that
SHA, the last scheduled release run and an ancestor-checked GitHub comparison.
Only `published_deploy` with the correct site, main branch, Production context,
ready state, full commit and valid publication time proves a public release.
An Actions success or a ready but unpublished deploy does not prove publication.
An explicitly `skipped=true` Netlify record is an ignored build, not a failed
release attempt. Live reads also verified that Netlify reports the exact ignore
result `Failed during stage 'checking build content for changes': Canceled build
due to no content change` as `state=error, skipped=null`. Only this exact known
reason is excluded; other Production failures are not hidden. An ignored build
does not prove there are no web changes: the GitHub comparison still decides.
The public list omits this error reason. Recent errors since the published release
therefore get individual public deploy-detail GETs (at most 20, bounded timeouts
and parallel reads). Missing or mismatched detail responses fail closed. Full
provider error text is neither rendered nor logged by the app.
The actual unauthenticated detail endpoint can also omit error reasons. In that
case the overall signal is unavailable, while independently verified publication
times, the next policy slot and the repository comparison remain visible with
their observation time. Account-authenticated MCP reads are not evidence that a
browser can read those fields anonymously. No account token or new Secret is
configured by this implementation. A future authenticated collector, if desired,
requires a separately reviewed credential and server-side Operator authorization;
merely adding a tokenless proxy cannot recover fields absent from public data.
`deploy_inputs` / `deploy_excludes` and the scheduler's test-file exclusions decide
whether a differing main actually needs a web deployment. Comparisons at GitHub's
300-file limit or with diverged ancestry fail closed.

The fixed epoch and interval/window come from each original policy. Index 0 is
the baseline; index 1 is the first scheduled slot, matching the existing release
script. UTC arithmetic preserves the 48-hour interval across month/year changes;
all display times use Asia/Seoul. The legacy `release_hour_kst` is not used.
The next fixed slot, its 24-hour observation window, the minimum 48 hours since
actual publication, and a delayed Actions invocation are different conditions.
No elapsed-time rule alone declares failure.

**Minimal structure:** public browser GETs avoid a new service, Function, database,
provider token or credential forwarding. The Operator-only CSP allows exactly
`https://api.github.com` and `https://api.netlify.com` in addition to the existing
Supabase origin. Public reader CSP rules are unchanged. Requests omit credentials,
have an 8-second timeout each, and return independent site results as they finish.
Only required fields are retained in memory. Each site has a two-minute cache;
refreshes do not extend its original timestamp. There is no automatic API polling,
localStorage persistence or stale-on-error success fallback. A local clock updates
the countdown and changes expired observations to `상태 조회 불가`. Signing out
clears observations; late responses cannot refill the signed-out screen.

Unauthenticated GitHub rate limits, CORS errors, denied public Netlify reads and
missing/inconsistent evidence show `상태 조회 불가` with safe diagnostic codes.
Never solve a browser limit by adding a GitHub/Netlify token to client code. If
real usage proves a server-side collector necessary, it must preserve this same
capability check and read-only contract; no collector or secrets are added here.

Tests: the original exact-four-board assertion is preserved. New Vitest tests
cover epoch/window/calendar edges, scope/no-change/rename/truncation, Production
vs Preview, failures, independent API errors, cache expiry and request aborts.
`check-operator-deploy-browser.py` uses the existing Playwright tooling to inspect
1440/390/320 layouts and all six states. Its Auth/RPC are **synthetic**; it never
logs in a real operator or writes real Supabase data. `--live` leaves provider GETs
unmocked and records actual browser/CORS outcomes separately in `audit.json`.
The existing browser CI uploads local, Preview and live captures. A live API
failure can pass the fail-closed UI check; it is not recorded as a successful live
lookup. No release policy, scheduler, hook, secret or Production switch changes.
