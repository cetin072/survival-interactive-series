# AFTERFALL immutable publication segments v1

Status: **DETERMINISTIC LOCAL CONTRACT IMPLEMENTED / LIVE EXPORT AND SCHEDULING BLOCKED**

The segment contract extends the existing Publication Batch and Reader/graph
pipeline without changing RAW history or the game turn path. `sealPublicationSegment`
accepts sanitized message metadata for one fixed range. It stores no USER/GM
bodies, Supabase payloads, save payloads, hidden state or credentials.

## Segment rules

- A segment belongs to exactly C03 / AFTERFALL / one season / one transcript
  session and has a pair-aligned inclusive message-order range.
- The source snapshot carries the session head observed by the exporter and a
  fixed snapshot fence. Newer messages remain outside this segment and belong
  to a later batch.
- Each included USER→GM pair has valid row identities, idempotency keys,
  content hashes, public-safe capture flags and explicit state linkage. A turn
  is `APPLIED` with a larger GM save version or `NO_STATE_CHANGE` with the same
  version on both rows.
- Segment identity hashes semantic input, not execution time. The original
  session status is preserved; an OPEN session remains OPEN when a range is
  sealed.
- A sealed segment is not a public approval. Even when an approval reference is
  present, publication remains disabled pending a trusted exporter/server
  provenance check.
- Reprocessing the same frozen range produces the same ID. It cannot claim or
  overwrite a later segment.

## Verification

Run the contract tests with:

```sh
node --test archive/scripts/lib/publication-segment.test.mjs
```

The tests use synthetic metadata only. They do not call Supabase, read live RAW,
publish a site, create images, or prove scheduler behavior.

## Exact-body candidate materialization

`materializePublicationSegment(snapshot, rows)` verifies an exported row's identity and exact UTF-8 content hash against each sealed message. It produces one deterministic in-memory RAW PART candidate with locally numbered role headers, preserving the original source message-order fence separately. It invokes the existing Reader transform for a digest-only preview, rejects embedded role headings that would confuse Reader parsing, and rejects oversized or unexpected row fields. An OPEN source session stays OPEN. The candidate remains `PENDING_PUBLIC_APPROVAL` with `publication_allowed: false`; neither a supplied approval reference nor a successful preview changes that. The function does not create `SOURCE_MANIFEST.json`, write to Git/DB, or publish text.

The new CI test uses synthetic bodies. There is still no restricted live body exporter or trusted public approval, and the currently observed unlinked S03 rows cannot pass the segment seal. A later trusted exporter must provide a transaction-consistent exact metadata/body snapshot. A separate reviewed promotion must allocate an archive session path, prove public visibility and create the Step 3 manifest before Reader publication.

## Operations still required

The repository has no least-privilege public exporter for open transcript
segments and no durable distributed task lease. The existing Supabase live
capture function also permits null save-version links. The metadata observed
for the current open AFTERFALL session therefore cannot enter this contract.
Those are blockers for a live `source → segment → Reader → graph → PR → deploy`
run. Do not enable a schedule, use a broad service-role secret as an exporter,
or call the static local contract an automated publication service until a
restricted read path, authenticated runner identity, durable ownership and
end-to-end staging evidence exist.
