# Automation B retired identity hold

The operator retired one failed illustration identity and did not authorize a
successor generation. Preparation now exits nonzero with
`ILLUSTRATION_OPERATOR_HOLD:RETIRED_IDENTITY_NO_SUCCESSOR_AUTHORIZED` before vault
cleanup, database calls or prompt publication. The schedule remains configured;
this is an explicit operational hold, not a successful image or completed repair.

The exact retired content identity is represented by a SHA-256 fingerprint of
`point_id + ':' + generation_key`. It remains rejected even after failed-job
history is deleted. No job IDs, asset references or prompt contents are published
here. All other failed jobs, existing images, rejected attempts and approval gates
are preserved. Resuming preparation or advancing to another image requires a
separately reviewed decision; deleting the failed row cannot clear this hold.

Before the separately authorized deletion, verify the current matching row counts,
foreign keys, no active lease, and no older non-completed Prepare execution,
including queued/waiting/requested/pending runs. Checkout alone does not update
the workflow YAML: a pre-merge run could still clean the vault before its new CLI
stops. Drain every pre-merge run before deletion; do not assume queued means safe.
Runs created after the merge use the workflow hold before cleanup. Delete only the exact
confirmed failed row in a conditional transaction after locking and checking its
dependent rows. Do not delete Library originals or previous rejected attempts.
An unexpected count, state, connection or outcome must stop the operation.

The existing workflow API does not distinguish an intentional hold from other
nonzero failures; its run log names this hold explicitly. The dashboard must not
show a successful generation. Site deployment is separate and unchanged.

Earlier audit clarification: the existing privileged read-only connection can
verify stored prompt hashes without new grants. Coordinator RPC limitations are
separate. The first capped candidate is skipped before the subsequent policy-held
candidate fails binding validation. A Library original was located, but full-byte
hash verification remains pending because download failed; this change neither
claims image recovery nor generates a replacement.
