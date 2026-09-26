# Automatic Archive Publication — Step 9 / 10: read-only orchestration check

Status: IN_PROGRESS / NO UNATTENDED EXECUTION

`check-archive-pipeline.mjs` now runs the actual public Reader, graph and Visual Catalog preparers in one invocation and returns one stage report. It has only `--check` mode. The S02 demo uses the manifest pinned at the checkout commit; normalized future input requires `--snapshot` and `--facts`, with optional dated appearances/map. Existing preparers retain their visibility, source and consistency checks. No new image provider, network fetch, storage write or scheduler is introduced.

The orchestrator proceeds from Reader to graph only when the Reader candidate matches the currently committed book (`NOOP`). A new or changed Reader candidate is reported as `AWAITING_REVIEWED_BOOK_COMMIT` and graph/visual are skipped, because the current graph preparer reads the committed public book. This is a real integration boundary. It does not silently compile later stages from an older book. The report preserves batch/revision identity and rejects nonzero write/provider counts.

The selection list remains a non-executing Step 5 plan. The report explicitly records 0 accepted images, 0 durable assets, 0 site publications, scheduling not proven and cost not audited. The CLI does not take `--apply` or infer successful image receipts from a request. Unit tests cover stage ordering, stale Reader gates, batch mismatch and execution refusal. Existing archive CI runs the real S02 read-only invocation on Ubuntu.

Remaining for operational Step 9: trusted automatically produced public batches, committed Reader-to-graph handoff for new text, durable attempt/receipt ledger, accepted image execution, storage/publication controls, and observed unattended runs. The current command is a diagnostic end-to-end **dry-run**, not the final continuously operating archive.
