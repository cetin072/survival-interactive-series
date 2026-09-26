# Automatic Archive Publication — Step 6 / 10: native image POC

Status: POC REVIEWED WITH BLOCKER — NOT AN OPERATIONAL IMAGE PIPELINE

2026-09-27 follow-up: Step 7 handoff code now accepts only a separately reviewed, hash-bound local image candidate. The two recorded outputs remain quarantined; accepted real images remain **0**. The new passing tests use synthetic pixels and do not change the experiment verdict. No further native image call was made because the zero-added-cost allowance for an additional run has not been verified.
Base audited: `5c1a0c59eae96a535c9e5f94d973308f52f8e7b6` (includes #138 and #139).

## Actual experiment result

Two native ChatGPT image outputs were returned during this development conversation. Both were readable local PNG files, and both independently passed Pillow `verify()` and pixel `load()`. **Neither complied with the requested single-character, no-text portrait brief. Both are quarantined and neither is an accepted illustration.** Stop after these two observations rather than repeatedly consuming image allowance.

The generated pixels contain completion/PR/test/cost assertions. Those assertions are model-created image content, not repository actions or measurements. They must never be used as evidence of a merge, a passed test, successful style/Canon QA, or an invoice. The actual observations are in `AUTOMATIC_ARCHIVE_STEP6_OBSERVATIONS.json`.

| Question | Observed verdict |
| --- | --- |
| Does native ChatGPT return an image in this conversation? | Yes: two image files observed. |
| Can this working runtime access the returned bytes without player file copying? | Yes: exact returned mounted paths were read and hashed. |
| Does the sample reliably render the intended Step 5 brief? | No: both samples failed the requested portrait/no-text output. |
| Is the result associated with an intended point/revision? | Observer-bound local receipts; not proof of the provider's actual internal prompt. |
| Was image -> Supabase -> site delivery tested? | No; no upload, database write or publication occurred. |
| Was scheduled/unattended generation tested? | No; no schedule was created/enabled. |
| Was a zero-added-cost invoice independently verified? | No. Native chat was used; no paid API, credit purchase or upgrade action was taken. |

Foreground file accessibility is a useful proven substep, not proof of unattended generation or readiness to publish.

## Intended request

Subject: fictional character `char-jinwoo` / 서진우, **not the user's likeness**.
The intended brief is the Step 5 public master-portrait brief from the unchanged public appearance file (blob `74beacb2424ad2b6d39fdbf4761fdfb99032df85`), as read with the Step 5 CI sample. It uses the established painterly AFTERFALL_ARCHIVE_V1 appearance and a square single-person composition with no typography.

- Point: `point-e33f848046b1245234e579828dadc03939faf10d609c15bff315b8c421be1a72`
- Generation key: `generation-a59f0391ed3fa13bcbcde8ea2123446837e6cc84ef5ab24f93d07f815170f7e8`
- Intended-request record: `request-755ce55bd782802eef325b233c280dd8b776bb0a66fb5bea6c5db3f4e4da10a0`

The assistant invoked the native tool in the conversation, **not from JavaScript or a background worker**. The normalized request/receipt records were produced to document the same intended brief. They do not claim that a JavaScript `provider.generate(brief)` path has been implemented or that the tool received a byte-identical prompt. The returned files are not promoted to master portraits or Canon.

## Files actually observed

| Attempt | Tool result id | Size / dimensions | SHA-256 | Decision |
| --- | --- | --- | --- | --- |
| 1 | `018c9ad4-82b6-4d6d-9579-a0bd6f1081da` | 1,814,033 bytes / 1536x1024 | `9b36d658bdc2ad5d449b9ad0ddfeaf7e02d336f9df3b2f6527e39a3824bd70d5` | QUARANTINED_NOT_AN_ASSET |
| 2 | `ad71390b-0f25-4356-8e41-bdea6640e4f3` | 1,677,612 bytes / 1226x1283 | `e1367031e28af6ae2a3251c669eed9226ac395a7a3ee81cd5b607beb46ca208f` | QUARANTINED_NOT_AN_ASSET |

The image files remain conversation artifacts. No pixels or temporary runtime path are committed to the repository; only observation metadata is preserved. A receipt does not make a temporary ChatGPT file a permanent storage object or CDN URL.

## Small reusable addition

`image-poc-exchange.mjs` supplies:

- a deterministic, request-only envelope for a validated Step 5 public portrait;
- separate intended brief identity and observed native tool result id;
- bounded local PNG signature/chunk/CRC/dimension checks and byte hash;
- exact local-file reads under an allowed working root (no URL fetching, file guessing or symlink following);
- observer-bound receipts that quarantine a failed review or wrong aspect ratio;
- no GENERATED/PUBLISHED ledger receipt, billing permission, actual provider call, upload, schedule or automatic quality pass.

PNG structural checks are **not a full pixel decoder or semantic image QA**. The actual two files were separately fully decoded with Pillow in this working runtime. Semantic mismatch was reviewed from the actual visible output, not from OCR, generated captions or guessed metadata. Even a future matching sample remains LOCAL_SAMPLE_REVIEW_REQUIRED in this POC, never public automatically.

`prepare-image-poc.mjs` compiles the real Step 5 public catalog and selects 서진우's ready brief. CI verifies stable request preparation and disabled execution flags without creating images. The 37 isolated unit tests use synthetic PNG bytes only; they are not counted as model generations. Unit tests also cover request/result mismatch, malformed files, unknown options, nonpublic sources, paid/scheduled surface masquerading, non-image input, path escape and symlinks.

```sh
node --test archive/scripts/lib/image-poc-exchange.test.mjs
node --experimental-strip-types archive/scripts/prepare-image-poc.mjs --check
node --experimental-strip-types archive/scripts/prepare-image-poc.mjs --request
```

No new package is needed. Full-repository checks run on GitHub CI; isolated module tests and the two actual local PNG reads/receipts run in the working container. Direct GitHub cloning is unavailable in that container, so a local full-repository build is not claimed.

## Current product-path review (official documentation checked 2026-09-26)

1. **Native ChatGPT foreground images.** The official Images help page documents conversational image creation. The two observed outputs establish generation and local handoff in this environment, but do not establish faithful brief rendering. Retry in a focused image-only context is a future experiment, not an automatically successful fallback.
2. **ChatGPT scheduled tasks.** Tasks documentation supports recurring work and says plan limits apply. Its current unsupported-feature list does not list image generation. Therefore do not repeat the outdated blanket assertion that all scheduled image generation is impossible. The exact scheduled image + artifact + connector chain remains **NOT TESTED**, with no scheduler enabled here.
3. **Codex/Work image capability.** Official image documentation describes a built-in image path and associated usage allowances. This is not proof that this account's unattended runs and overages have zero incremental cost. Leave disabled pending capability, quota and cost evidence. Local scheduled project workflows may require the app and computer to stay running.
4. **Image API.** Programmatic image APIs are a different execution/billing path. They are not assumed to be covered by the ChatGPT subscription and are not called or configured in this project.

Sources:
- https://help.openai.com/en/articles/11084440-images-in-chatgpt
- https://help.openai.com/en/articles/10291617-tasks-in-chatgpt
- https://learn.chatgpt.com/docs/image-generation
- https://learn.chatgpt.com/docs/automations?surface=app
- https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans

No browser cookie extraction, session scraping, undocumented endpoint or purchased-credit workaround is implemented. Unknown cost remains an approval boundary. Account invoice or quota was not inspected; never substitute a successful file response for billing evidence.

## Product decision and roadmap

Keep the gameplay/text/graph/candidate pipeline independent of this failure. Step 5 continues to prepare work; failed image experiments must not create successful generation receipts that suppress its queue. Step 7 can implement a receiver/storage contract under the existing zero-cost rules, but these two rejected images must not be uploaded as production assets.

The unresolved requirement is **a reliably brief-driven image execution path**, followed by an actual unattended artifact-delivery test. A reduced-context native-image task is a candidate to investigate; scheduled work is unproven, not categorically unsupported. Do not mark the ultimate “player only plays, images publish themselves” outcome done based on this PR.

No gameplay/RAW/Canon mutation, Supabase write, paid API, Storage creation or site rollout occurs in this stage. Keep `[skip netlify]` in the PR and squash commit. Only existing standard public-repository CI is used. Step 6 is recorded as a reviewed POC with a blocker, not an operational 6/10 green check.
