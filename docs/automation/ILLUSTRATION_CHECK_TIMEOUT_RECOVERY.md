# B reviewed-image timeout recovery

The Archive Finalizer must wait for its own source/build/preview checks, not unrelated survival-zero-ai-test CheckRuns. Both old StatusContext prefix and the three exact Netlify auxiliary check names are excluded. Unknown checks and all survival-diary-archive checks remain mandatory; an empty relevant check set is never PASS. Existing finite wait, stable-poll, lease and independent review gates remain.

For a preserved PASS job blocked by FINALIZER_PR_CHECKS_TIMEOUT or FINALIZER_PR_CHECKS_NOT_REPORTED_TIMEOUT, first verify current job/output/provider/review-staging identity, relevant exact-head checks and the existing one-file request PR. Only then call the existing narrowly scoped service-role timeout recovery RPC once. It retains failure count and all image/review/source fields; wrong hashes, unrelated blockers, active leases and exhausted budgets fail closed. No new Renderer generation or review is authorized by recovery.

Continue through the existing Program Finalizer. Confirm trusted Storage readback, Registry READY, exact SITE_ASSETS and DB SUCCEEDED before reusing the previous output slot. A new PREPARED successor is not proof that the previous image is published. Keep originals and previous receipts until durable completion. Production remains the regular batch; no forced deploy or scheduler change.
