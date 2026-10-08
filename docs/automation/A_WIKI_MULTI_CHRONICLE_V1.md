# A-Wiki Multi-Chronicle V1 — minimal Reader backfill

Scope: card lobby; one shared world index/document template; source-bound partial C01/C02 seed documents. C03 Graph, extractor/reviewer/finalizer, schedules and production policy remain unchanged.

Identity is `(chronicleId, nodeId)`. Bare historical Wiki node links resolve to C03; an explicit wrong/unknown Chronicle must not fall back to a different world. Reader links and relations keep the same Chronicle. The two Park Do-hyun characters in C02 remain separate entries.

C01/C02 seeds are curated partial extracts of already verified public Reader narration. Every claim and relation carries an exact quote, chapter ID and SHA-256 of the cited body. The build checks the existing public source catalog and original RAW hashes as well. A source hash match is not a semantic-review decision. Dialogue, hypotheses, future choices and missing scenes are not promoted into confirmed events.

Initial seed packages are PREVIEW_ONLY and say PARTIAL. They appear in local/Deploy Preview builds, not Netlify production builds. Human review of the PR is required before changing publication to HUMAN_APPROVED; no fictional independent reviewer receipt is created. No source session is marked processed by this backfill, and the existing C03 job queue is untouched.

To add another world later, reuse the registered Chronicle and validated public Reader inputs; provide its own source-bound seed package. No per-world CSS or card code is necessary. Automated full-world extraction and elaborate book/door animations are out of scope.
