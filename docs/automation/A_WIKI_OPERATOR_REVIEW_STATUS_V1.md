# A-Wiki operator status: separate semantic holds from worker outages

## Principle

The durable A-Wiki job phase, the ChatGPT scheduled worker's ON/OFF state and
the public Netlify deployment are **three different signals**. The operator
dashboard can read the durable job ledger but it cannot query ChatGPT
reservation state directly. Never call a `HUMAN_REVIEW` job an OFF scheduler
or a general automation failure.

## Status behavior

- `EXTRACTOR_READY` / `REVIEW_READY`: semantic work is queued for a future
  Native Worker run; no claim about actual scheduler enablement is made.
- `HUMAN_REVIEW` / `REVIEWER_HUMAN_REVIEW`: the **independent Reviewer has
  completed** but identified an unsupported/overstated claim. The specific
  reviewer note is displayed only to an authenticated Archive Operator; the
  row is kept immutable and unpublished pending corrected source-bound facts
  and a **fresh independent review**. Do not mark it APPROVE or edit its
  proposal in place.
- `BLOCKED` / GitHub and source validation blockers: distinguish a program
  failure from a semantic content-review hold.
- `PUBLISHED`: a verified GitHub merge, **not** proof that Netlify Production
  already contains it.

## Dashboard semantics

- `active_count`: jobs actively working or in a nonterminal program stage.
- `human_review_count`: the distinct count of terminal native human-review
  holds. It is **not** silently combined into active_count.
- `published_count`: durable, repository-merged jobs only.
- `latest_job.review_note`: the independent review's raw note, truncated to
  2,000 characters in the operator-only RPC. The UI renders it as escaped
  plain text and never assumes a reviewer is correct without source checking.
- If a legacy deployed RPC does not yet have these fields, the UI falls back
  to the latest HUMAN_REVIEW phase and a general human-readable reason.
- The dashboard explicitly says that **reservation enablement cannot be read
  from this DB snapshot**. It cannot claim ON or OFF without task telemetry.

## Operational correction boundary

For S04 SESSION_002, the Reviewer rejected a claim that Jang Tae-hoon
completed diesel quality/equipment compatibility verification when the GM
source only establishes a sample inspection and a need for further checking.
Correct the claim before any future publication. The source RAW, original
Extractor result, Reviewer decision and citation hashes are preserved. Any
new proposal must be independently reviewed again; no automatic override.

This status-only change creates no new ChatGPT task, paid provider or
Netlify Production release.
