# Operator Console

The `/operator/` console uses the existing Supabase Auth project and the `survival_archive.review` database capability. It has no sign-up flow. An active `super_admin` profile can sign in; Postgres checks the real profile and role on every RPC call. A signed-in user without the capability receives a denied response.

For local or Deploy Preview builds, provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` using the host's environment settings. These are browser-visible values. Never set a service role key as a `VITE_` variable or in this app. The service role is used only by the repository-owned Knowledge workflow to enqueue review metadata.

Review decisions are written to `survival_ops.archive_review_items` and `archive_review_decisions` through restricted database functions. Approve, hold, and reject do not merge GitHub changes or deploy Netlify. The inbox reports only rows written by a worker; it does not synthesize items from checked-in content.

The preview's `/operator/` route is excluded from indexing. It is still protected by Supabase authentication and database capability checks; the route's obscurity is not treated as security.


## Human-review round trip

Automation C now treats a machine result that requires human review as an Operator handoff rather than a failed publication. The exact Worker PR number, branch and head SHA are stored as review metadata. Approve/Hold/Reject still write only to Supabase.

A repository-owned scheduled consumer checks at most one approved item per run. APPROVED is not a publication bypass: the consumer requires the approved PR/source identity to still match, re-runs the Knowledge contract/evidence/source/content-only gates, prepares the BRIEF as HUMAN_APPROVED, waits for PR checks, merges the exact prepared head, and then records a consumption receipt. HOLD and REJECTED are never returned by the approved-item RPC.

If main or the reviewed PR identity has moved, the approval fails closed instead of publishing stale content. Netlify Production remains controlled by the existing batched release gate.

The Archive CSP permits browser connections only to the exact configured Supabase project origin for Operator Auth/RPC. It does not permit wildcard network origins.


## GitHub sign-in

The Operator login surface prefers Supabase GitHub OAuth. The browser redirects to GitHub's official sign-in flow; the Archive never receives or stores the user's GitHub password.

The OAuth return target is the exact production Operator URL:

`https://survival-diary-archive.netlify.app/operator/`

Localhost development keeps its own `/operator/` callback. Deploy Preview GitHub sign-in intentionally returns to Production rather than requiring a broad Netlify wildcard redirect allowlist.

Email/password sign-in remains available inside a collapsed fallback while GitHub OAuth is being verified in production. GitHub authentication does not grant Operator authority by itself: the existing `survival_archive.review` capability RPC checks still decide access.

Supabase Auth automatically links a new OAuth identity to an existing user when the verified email matches, subject to Supabase's identity-linking rules. If no authorized profile is linked, login may succeed but Operator RPC access remains denied.
