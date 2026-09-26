# Automatic Archive Publication — Step 8 / 10: website visual states

Status: CODE COMPLETE FOR CURRENT PENDING STATES / IMAGE DISPLAY BLOCKED

The archive website now consumes the checked-in public `VISUALS.json` snapshot derived by the Step 5 compiler from `main` at `1da3cd03f27b1c072a98a108311223b62055b8a3` (save 253). The Explorer detail displays a prepared-brief state or a public-source-pending state for matching public nodes. References without a visual point receive no invented image state. The current catalog contains 34 points: 30 ready briefs and 4 waiting. These are **brief counts, not images**.

`visualStatus.ts` deliberately exposes no image URL because no accepted or published image exists. The UI says that a prepared brief still awaits an image. It renders no placeholder pixels that could be mistaken for generated art. Local unit tests cover ready, waiting and absent points, plus the pinned counts. The archive CI runs the website tests and build.

The committed snapshot is a static public input for this code-only integration. It is not a live refresh, Supabase read, asset publication or proof of unattended scheduling. A later orchestrator must update the site-ready projection from a newer approved public catalog and a durable published-asset manifest; a local Step 7 candidate must never be exposed as a public image. This PR retains `[skip netlify]` and does not roll out the changed website.
