# Automatic Archive Publication — Step 8 / 10: website visual states

Status: CODE COMPLETE FOR CURRENT PENDING STATES / IMAGE DISPLAY BLOCKED

The archive website now consumes the checked-in public `VISUALS.json` snapshot derived by the Step 5 compiler from `main` at `1da3cd03f27b1c072a98a108311223b62055b8a3` (save 253). The Explorer detail displays a prepared-brief state or a public-source-pending state for matching public nodes. References without a visual point receive no invented image state. The current catalog contains 34 points: 30 ready briefs and 4 waiting. These are **brief counts, not images**.

`SITE_ASSETS.json` is a separate, empty, digest-bound site-ready manifest. Its build-time validator accepts only current READY point/generation bindings and same-origin `/visual-assets/<sha256>.png` files whose bytes, hash, size (at most 200 KB) and PNG dimensions match. Symlinked files and invalid paths fail. The browser displays an image only when this manifest includes one; it uses declared dimensions, lazy loading and an explicit load-error/retry state. The current manifest has **0 assets**, so the UI still says that a prepared brief awaits an image. Synthetic positive tests verify the contract without claiming model generation or publication.

The manifest's `accepted_candidate_id` and source hash are provenance fields supplied by a future trusted publication producer. This validator does not independently prove that an image passed visual/Canon review; a matching hash or test fixture is not semantic approval. Filling the manifest or deploying assets remains disabled pending an actual Step 7 accepted result and publication approval.

The committed snapshot is a static public input for this code-only integration. It is not a live refresh, Supabase read, asset publication or proof of unattended scheduling. A later orchestrator must update the site-ready projection from a newer approved public catalog and a durable published-asset manifest; a local Step 7 candidate must never be exposed as a public image. This PR retains `[skip netlify]` and does not roll out the changed website.
