# Automation B — Regular Coordinator Boot Router

Status: **CURRENT RESERVATION / REVIEW / TRANSFER BOOT AUTHORITY**

The Coordinator never generates an image. Reuse the existing Coordinator
`6ac24401ee1881919ac19b158102b752`; the only writer is the visual-only one-shot
Renderer `6ac2e58fc3848191aba731468f6c3e18`. Keep the legacy Clean Renderer
`6ac252c96ea88191841241364adafb82` and redundant Native Worker
`6ac234656c0481918269852a2ada19fc` OFF after migration; verify actual task state.

Program owns durable review-decision mutation. The Coordinator writes the
existing review handoff; it never calls review_decide directly.

1. Read current main and `public.archive_illustration_render_job_current()`
   from project `jgsxpdflgkqroecfjzxq`.
2. Read the reservation runtime JSON on `automation-b-review-handoff` and
   peek the designated Renderer. A failed read is not an empty receipt or
   an idle task. Reconcile pending execution from actual task evidence.
3. Run the existing bridge `route` action with `{job,runtime,rendererPending}`.
   Use explicit null only for confirmed absence. If the receipt binds an
   older job, also read that exact DB job as `previousJob`. Only collected,
   provider-bound SUCCEEDED/REVIEW_REJECTED history releases the output slot.
   DB expiry, missing current job, BLOCKED or HUMAN_REVIEW cannot release it.
4. Execute exactly the returned role, then stop:

| Role | Authority / action |
| --- | --- |
| DISPATCH | Follow `ILLUSTRATION_B_RESERVATION_BRIDGE.md` DISPATCH; durable intent before one task update; exact prompt readback |
| COLLECT | Follow the same bridge COLLECT; verify fresh exact PNG and provider_complete, then stop |
| REVIEWER | Load `ILLUSTRATION_B_NATIVE_WORKER_PROMPT.md`, runtime contract and review provider; write only the existing review handoff |
| TRANSFER | Load those same existing authorities; resume valid PASS staging and send missing chunks only |
| WAIT_PROGRAM_FINALIZER | Read-only; existing Program Finalizer owns continuation |
| AUDIT | Read-only DB/Registry/Storage/SITE_ASSETS evidence; no new enqueue |
| NOOP | Stop with no mutation; HUMAN_REVIEW preserves the source |

Before REVIEWER/TRANSFER, re-read exact Library ID/SHA against collection.
A mismatch stops the run. PASS handoff does not permit same-run Transfer.
Renderer receives only exact visual prompt plus `RESERVATION_RENDER_SUFFIX`;
none of these authorities or metadata belong in its task prompt.

Regular Coordinator cadence: every two hours in Asia/Seoul, reusing the
existing task. Program Prep and Finalizer stay unchanged. After one daily
success, normal Prep's daily-success gate stops further generation. Existing
semantic/attempt caps remain authoritative; no acceptance override is used.
Schedule migration is performed once using supported native ChatGPT tools,
with exact task readback; this document alone is not evidence of activation.
