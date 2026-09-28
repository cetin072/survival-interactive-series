# Knowledge auto-publish handoff

The repository control plane has three explicit publication modes:

- `PR_ONLY` creates the existing review PR and never authorizes an unattended merge.
- `AUTO_LOW_RISK_SHADOW` runs the release checks and reports `WOULD_AUTO_PUBLISH`; it never merges or changes Production.
- `AUTO_LOW_RISK` can report `AUTO_PUBLISH_ELIGIBLE` only when the repository config explicitly enables it, the candidate passes the release checks, and every changed file is on the content allowlist.

The checked-in default is `AUTO_LOW_RISK_SHADOW`; `auto_publish_enabled` is `false`. No scheduled worker or GitHub merge action is created by this control-plane change.

## Worker handoff

The existing Knowledge Brief Worker should continue to handle research and semantic review. For each new public source, it should verify the manifest and part hashes, compare the source manifest ref and SHA with both scanner state and open Knowledge PRs, deduplicate against candidates and published briefs, and record one disposition: `NEW_BRIEF`, `UPDATE_EXISTING`, `HOLD`, or `HUMAN_REVIEW`. It must not mark a source processed before a concrete disposition has been committed.

The worker should create one Knowledge-only branch and one PR. Before creating the PR, it runs the existing Knowledge checks and `node archive/scripts/knowledge-release-check.mjs --brief K-...`. The checker compares the branch file list with `origin/main...HEAD`; workers that cannot provide that exact comparison must pass the changed files explicitly. A disallowed path rejects automatic merge. A release result of `HOLD`, `HUMAN_REVIEW_REQUIRED`, or `REJECTED` stops the flow and triggers human notification.

For an automatic mode, wait for CI, then verify that the PR head SHA is unchanged and rerun the release checker on that exact head. Only a passing `AUTO_PUBLISH_ELIGIBLE` result in enabled `AUTO_LOW_RISK` mode can proceed to a squash merge. The checker itself never performs a merge.

## Production verification

After merge, use the actual merge commit SHA and wait for a Netlify Production deploy. Publication is complete only when the deploy is `READY`, its `commit_ref` equals that merge SHA, the expected `/knowledge/<slug>/` page is reachable, and the Knowledge index and sitemap both contain the page URL. Otherwise record `AUTO_PUBLISH_INCOMPLETE`, notify the user, and do not create a duplicate BRIEF. Retry a transient CI or deploy failure at most once.

Notion remains a best-effort editorial mirror. It is not an approval gate or canonical state store. No paid API, search service, queue, or new scheduled worker is part of this handoff.
