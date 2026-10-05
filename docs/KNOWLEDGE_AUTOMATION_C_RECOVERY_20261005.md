# Automation C recovery — 2026-10-05

## Public build boundary

Vite and the static Knowledge generator use the existing publication checks before selecting PUBLISHED articles. A virtual build module exports only fields used by the public page and search. Drafts, editorial notes and extra nested fields remain in canonical JSON and never enter the browser module. K-002/K-003 retain their explicitly identified legacy approval exception for missing Candidate/Reader provenance; other publication checks still apply.

The normal build scans JS, JSON, HTML and any source maps for unpublished body text and editorial notes. The recovery build contains ten published articles, including K-014 and existing short labels. Preview uses the same build boundary. Production remains subject to the existing two-day release window and maximum one release per day; no forced deployment was performed.

## Applied operational changes

The forward operational migration restores the generalized Experience Seed submission contract after the EX-001 pilot, updates the existing prep schedules to 05:45/11:45/17:45/23:45 KST, and serializes admission with a KST-calendar cap of four newly created jobs. BLOCKED rows count. Existing-job retries return their original identity before the cap. The single-active-job guard, source/policy pins, immutable results, restricted RPC grants and human review conditions remain in effect.

The forward review migration adds SUPERSEDED without fabricating a human decision. Admin-only cleanup requires a published job, actual approval audit, matching consumed publication receipt and source/PR revalidation ledger. Six historical K-014 requests were matched against their original candidate source and PR/head history, then linked to the effective approval. K-014 remains PUBLISHED; original requests, actors, payloads and receipts are retained.

Both forward migrations were applied and their live definitions and schedules read back. Repository migration files and live migration timestamps are separate records. CI applies all previous migrations before these forward migrations and runs transactional regression fixtures in an isolated database.

## Actual K-015 cycle

The existing SESSION_008 job was reused, with its exact source/policy pins verified against Git bytes. Official FEMA, EPA and USFA sources informed a full Candidate/Evidence/BRIEF package about prioritizing emergency restoration requests. Because this concerns life safety, the package retains HIGH/OTHER_SEVERE_HARM and HUMAN_APPROVED rather than requesting automatic publication.

Its immutable result was accepted once. The existing finalizer produced [PR #425](https://github.com/cetin072/survival-interactive-series/pull/425) and one current HUMAN_REVIEW item. The finalizer workflow and content checks passed. This is a completed human-review handoff, not a public publication.

## Remaining operational checks

The existing ChatGPT Knowledge Semantic Worker must retain its ID and role, use 00:00/06:00/12:00/18:00 KST, and be read back after activation. The available browser is currently signed out; no duplicate schedule or workaround automation was created. Unattended success must be reported only after an actual scheduled execution is observed.

Production was last observed on `6920371ea293f81102536166eaa30a2b7abd229e`; the public boundary correction and K-014 visibility require the regular deployment and subsequent exact-commit/page/index/sitemap/asset verification.

Producing other articles while human review is pending and rediscovering new questions from previously processed Readers remain separate follow-up tasks.
