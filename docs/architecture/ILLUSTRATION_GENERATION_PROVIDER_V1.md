# AFTERFALL Illustration Generation Provider v1

Status: provider boundary implemented; active provider remains ChatGPT scheduled native generation.

## Goal

Keep "who generates the image" replaceable without changing:

- Visual READY selection
- Visual Brief / Canon quality gates
- retry and daily-cap rules
- trusted Draft Release handoff
- private original storage
- visual registry
- deterministic site derivatives
- SITE_ASSETS / Netlify publication

The generation engine is an adapter, not an Automation B domain rule.

## Current selection

Configuration:

`archive/automation/illustration-generation-provider.json`

Current active provider:

```text
active_provider = native_chatgpt
execution_surface = CHATGPT_SCHEDULED_TASK
```

No fallback provider is allowed. A provider failure must surface explicitly rather than silently switching vendors.

## Provider boundary

`archive/scripts/lib/illustration-generation-provider.mjs`

Supported provider IDs:

- `native_chatgpt` — current scheduled ChatGPT worker
- `api_openai` — reserved external API adapter; disabled while the zero-cost policy is active
- `manual_import` — explicit manual/import fallback for operator recovery, not an automatic vendor fallback

Every provider must normalize its output to the same contract:

```text
illustration-generation-result-v1
├─ point_id
├─ generation_key
├─ subject_id
├─ provider
├─ provider_model
├─ provider_asset_id
├─ status
├─ original_ref
├─ width
├─ height
├─ mime_type
├─ sha256
└─ metadata
```

A successful result is not accepted unless it carries a transferable PNG identity:

- original reference
- width / height
- `image/png`
- exact SHA-256

## Scheduler separation

The scheduler is only a trigger.

```text
Scheduler
→ read active_provider
→ invoke selected Generation Provider
→ normalized result
→ common Quality Gate
→ common trusted handoff
→ common Storage / Registry / Publication
```

Therefore changing the scheduler does not require changing the generation adapter, and changing the generation vendor does not require changing the downstream pipeline.

Current trigger:

```text
ChatGPT Scheduled Task
```

Future triggers may include:

- GitHub Actions
- an external worker/queue
- a server/edge scheduler
- another orchestration service

The trigger must still call the same provider contract.

## Future external API switch

A future API switch should be limited to:

1. implement the provider adapter;
2. add offline contract tests;
3. explicitly approve paid usage if applicable;
4. enable that provider in the config;
5. change `active_provider`;
6. prove one real E2E asset before routine use.

Do not rewrite selection, quality, handoff, Storage, registry, derivative, or publication code.

## Cost guard

`api_openai` is currently configured as:

```text
enabled = false
paid = true
requires_explicit_paid_approval = true
```

The provider resolver fails closed while this is true.

No automatic paid-provider fallback is allowed.

## Current ChatGPT scheduled-provider responsibility

The scheduled ChatGPT worker should:

1. load latest repository state;
2. read the active generation-provider config;
3. choose the eligible READY candidate;
4. invoke the active provider;
5. apply the existing AFTERFALL Visual Brief / Canon review;
6. produce normalized provenance and exact source identity;
7. pass the accepted original into the common trusted handoff path.

The scheduled prompt must not hardcode ChatGPT as a permanent architectural dependency. It is only the currently selected provider.

## Non-negotiable invariants

- provider choice does not create Canon
- no silent provider fallback
- no paid provider without explicit approval
- exact source SHA before trusted handoff
- private original remains private
- generation provider cannot bypass quality review
- generation provider cannot directly weaken Storage or registry security
- downstream publication remains provider-agnostic
