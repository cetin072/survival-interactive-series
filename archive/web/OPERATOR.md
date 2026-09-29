# Operator Console

The `/operator/` console uses the existing Supabase Auth project and the `survival_archive.review` database capability. It has no sign-up flow. An active `super_admin` profile can sign in; Postgres checks the real profile and role on every RPC call. A signed-in user without the capability receives a denied response.

For local or Deploy Preview builds, provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` using the host's environment settings. These are browser-visible values. Never set a service role key as a `VITE_` variable or in this app. The service role is used only by the repository-owned Knowledge workflow to enqueue review metadata.

Review decisions are written to `survival_ops.archive_review_items` and `archive_review_decisions` through restricted database functions. Approve, hold, and reject do not merge GitHub changes or deploy Netlify. The inbox reports only rows written by a worker; it does not synthesize items from checked-in content.

The preview's `/operator/` route is excluded from indexing. It is still protected by Supabase authentication and database capability checks; the route's obscurity is not treated as security.
