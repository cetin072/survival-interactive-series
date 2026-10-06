# Automation B — regular reservation bridge

Status: **REGULAR ROUTE — LIVE acceptance completed on 2026-10-05.**

Runtime activation still requires actual native task readback; code promotion is not an ON-state claim.

Golden reference / 검증 표준 사례:
[`ILLUSTRATION_B_REFERENCE_CASE_2026-10-05.md`](./ILLUSTRATION_B_REFERENCE_CASE_2026-10-05.md)

이 reference case는 실제 PASS 증거, 실패 교정, 금지 규칙과 최종 LIVE acceptance 조건을 보존한다.
transport PASS를 LIVE E2E PASS로 오판하지 않도록 이 문서와 함께 읽는다.

The existing Prep, `native_chatgpt` provider, DB queue, review handoff,
Transfer and Finalizer remain the authorities. This bridge only transports
the exact visual prompt into a reusable scheduled Renderer and collects its
Library output. No provider, table, DB status or paid API is added.

## Roles and boundaries

| Job / receipt condition | One role for this execution | Result |
| --- | --- | --- |
| No current job | NOOP | No scheduling or image mutation |
| PREPARED, no unresolved dispatch | DISPATCH | Existing Renderer gets the exact visual prompt and a one-time schedule |
| PREPARED, dispatch exists | COLLECT | Validate the new PNG, then existing provider_complete |
| INGESTING | Existing REVIEWER | Existing GitHub review handoff; Program owns durable decision |
| REVIEW_PASS_STAGED | Existing TRANSFER | Existing site staging and Program Finalizer |

Renderer is a separate scheduled execution. Its entire task prompt is the
exact visual text plus `RESERVATION_RENDER_SUFFIX` from
`archive/scripts/lib/illustration-reservation-handoff.mjs`.
It must not read this document, job metadata, DB, GitHub or review authorities.
It generates one PNG, replaces `/IMAGE-RENDER/output/current.png`, and stops.
The suffix only describes image creation and its output destination.

The Coordinator never generates images. After COLLECT it stops; it does not
review in the same execution. Existing review/transfer rules remain in
`ILLUSTRATION_B_NATIVE_WORKER_PROMPT.md` and the current runtime contract.

## Reuse existing resources

- Program: `archive/scripts/prepare-illustration-render-job.mjs`.
- Task editing: supported ChatGPT `automations.update`, called by the
  Coordinator. There is no assumed public HTTP endpoint for GitHub Prep to
  edit a ChatGPT task, and no assumed per-run payload/template expansion.
- Runtime branch: `automation-b-review-handoff`.
- Runtime file: `archive/automation/runtime/illustration-reservation-handoff.json`.
  Its changes do not match the existing review workflow's file trigger.
- Read-only helper CLI: `node archive/scripts/illustration-reservation-bridge.mjs ACTION INPUT.json`.
- `ACTION`: `route`, `prompt`, `inspect`, `dispatch`, `readback`, or `collect`.
- Before DISPATCH, `route` requires actual `{job,runtime,rendererPending}` reads;
  use `previousJob` to resolve a completed prior receipt. The `dispatch` CLI
  applies the same gate before building a prompt.
- Collector mutation: existing
  `public.archive_illustration_render_job_provider_complete(p_job_id,p_prompt_sha256)`.

Use the installed tools' actual schemas. Preserve returned IDs and fresh
blob SHAs. Do not use a guessed API, a browser workaround, or a new task when
an existing designated task can be reused.

## DISPATCH

1. Read current job and exact `archive_illustration_render_prompt()` text.
   Require one current PREPARED/native_chatgpt job. Preserve UTF-8 bytes,
   including trailing newlines; do not summarize or trim the prompt.
2. Read the existing runtime receipt before changing any schedule.
   If a dispatch has no verified collection, never dispatch another job into
   this slot, even if DB stale sweep changed or removed the previous job.
   Report the unresolved dispatch and retain its output. Do not infer that a
   ChatGPT execution stopped because its DB job expired.
3. Inspect the designated Renderer with `automations.peek`. Require no
   unresolved prior execution or pending one-time dispatch. Legacy Clean Renderer and redundant Native Worker remain OFF in regular operation.
4. Acquire the existing job lease for `archive-illustration-reservation-dispatch`
   (7200 seconds, covering the next hourly collection). A failed lease means no schedule mutation. Read the job
   again and require the same immutable binding.
5. List the exact Library output folder. Require at most one exact path match.
   If present, materialize that exact file using the Library skill and run
   `inspect` with `{imagePath,fileId}`. Add the returned SHA to its metadata.
   If absent, pass explicit `null`; a failed lookup is not absence.
6. Run `dispatch` with
   `{job,promptText,rendererId,baselineFile,requestedAt,runtime,previousJob,rendererPending}`. This validates the
   prompt, job and baseline. An image modified since the job was created is
   a recovery case, not permission to overwrite it.
7. Before task mutation, create/update the runtime JSON with fresh blob SHA:
   `{receipt: <helper receipt>, dispatch: null, collection: null}`.
   This is a durable intent record. A competing/stale write must stop.
8. Call `automations.update` once with the helper's `renderer_prompt` as the
   entire prompt, the designated task ID, one-time VEVENT (no RRULE),
   `dtstart_offset_json`, `is_enabled:true`, and `default_timezone:Asia/Seoul`.
   Respect the tool's maximum hourly frequency when reusing the same task.
9. Peek and run `readback` with
   `{job,receipt,promptText,rendererId,scheduledPrompt}`. Also confirm one-time
   scheduling. Record actual task `updated_at`, schedule and any available
   `next_run_time` in `dispatch`, then stop.

If the update response is ambiguous, do not re-arm blindly. Reconcile the
stored prompt/hash, task update time and schedule against the durable intent.
If whether it ran cannot be established, preserve the receipt and stop.
The task API does not expose a context-reset guarantee or a reliable public
run-ID-to-image binding; absence of a next-run value alone is not completion.

## COLLECT

1. Read the current job, durable intent/dispatch and task prompt again. A
   changed job or unresolved previous dispatch blocks collection.
2. List the exact Library path and materialize its current file. Never use
   only `/mnt/data`, an old local copy, or the newest unrelated image.
3. Run `collect` with
   `{job,receipt,promptText,rendererId,scheduledPrompt,currentFile,imagePath,observedAt}`.
   The CLI performs Pillow `verify()`, reopens and fully decodes the PNG;
   caller-supplied decode claims are ignored. Existing hashes must match.
4. The helper requires a changed file/version, changed bytes, exact path,
   valid PNG, time after dispatch/job creation, and unchanged job/prompt
   binding. Same Library identity with a newer backing file/version is valid.
5. Only `READY_FOR_PROVIDER_COMPLETE` may proceed. Persist its source file
   ID/SHA and collection time in the runtime JSON before the RPC. Re-list the
   output and re-read the job immediately before mutation; any file/version
   or job change means stop.
6. Call the returned existing provider_complete payload once. Read back
   `INGESTING` and record completion, then stop. If the response was lost,
   use the existing idempotent RPC/readback; do not generate another image.
7. The next REVIEWER execution checks that current.png still matches the
   persisted collection ID/SHA, then follows the existing review authority.
   REVIEW_PASS_STAGED continues the existing transfer/resume path unchanged.

`ALREADY_COMPLETED` means the job is already INGESTING and no extra RPC is
needed; it is not proof this bridge generated that image. Terminal `NOOP`
does not count as a new successful render or end-to-end test.

## Single output slot

Only one designated Renderer may write current.png. Never overlap preview,
manual render or another test with a live job. Keep an unresolved dispatch
until it is collected or its execution is explicitly resolved; DB expiry
alone must not permit another writer. The helper validates file provenance
within that serialized process; it cannot independently prove which
ChatGPT execution produced arbitrary PNG bytes.

## Preview and acceptance

### Observed transport proof — 2026-10-05

- Actual Prep preview candidate: `event-fireline`; 775-character visual prompt.
- Scheduled Dispatcher read the runtime prompt and updated the existing
  isolated Renderer task; exact stored task text matched all 938 characters.
- Renderer wrote `/IMAGE-RENDER/output/current.png`, retaining its Library
  identity and advancing version 3 to 4.
- PNG: 1672 × 941, 2,912,260 bytes; complete decode PASS.
- SHA-256: `36f861adce87a772d8d5f5e219b78efc6ce057ab977768c2f682757f5c288c8d`.
- [Immutable runtime evidence](https://github.com/cetin072/survival-interactive-series/blob/ecf4b29c5f7cb7efd2e6b3b428056cd322043773/archive/automation/runtime/illustration-reservation-probe.json).
- Both test executions finished and returned OFF. The regular B schedules
  remained OFF. No provider_complete or live E2E was performed by this probe.

`prepareRenderJob({previewOnly:true, attemptHistory})` uses the actual
candidate selection and prompt compiler without enqueue. It returns
`PREVIEW_ONLY`, never PREPARED. Supplied history is forbidden in live mode.
Preview may verify dynamic task-prompt transport and exact-path saving; it
must never call provider_complete or claim the live job E2E passed.

## Regular operation

The completed LIVE fireline case is recorded in the existing Golden Reference.
Use `ILLUSTRATION_B_NATIVE_WORKER_ROUTER.md` as the regular Coordinator entry.
Reuse the Coordinator and designated one-shot Renderer; do not create tests or
turn the legacy operational Clean Renderer back ON.

Target one successful image per KST day. Existing Prep daily-success and
attempt/semantic caps stay authoritative; retry before success at about two
hours. HUMAN_REVIEW stops automatically, REJECT remains a quality decision.
The ONE_EXTRA_LIVE_ACCEPTANCE_JOB exception ended with the 2026-10-05 trial;
it is historical evidence only, never a regular enqueue/DB policy option.

Transfer lease expiry preserves the original and partial staging. With exact
job/source binding, acquire a fresh lease and use the existing resume path;
do not reinterpret PASS or regenerate. Program Finalizer remains unchanged.
