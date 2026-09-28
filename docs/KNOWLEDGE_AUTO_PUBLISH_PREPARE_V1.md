# Knowledge Auto-Publish Preparation V1

This stage prepares an eligible LOW-risk Knowledge BRIEF for publication without performing a merge or Production deployment.

## Purpose

The semantic worker still creates a `READY` BRIEF first. Publication preparation is a separate deterministic step.

```text
READY BRIEF
→ exact release gate
→ PUBLISHED state on branch
→ deterministic Knowledge HTML/index/sitemap generation
→ release gate again
→ CI / Deploy Preview
→ (future AUTO mode only) exact-head merge
→ exact Production SHA verification
```

## Command

From `archive/web`:

```bash
node ../scripts/knowledge-publish-prepare.mjs \
  --brief K-007 \
  --base origin/main \
  --head HEAD
```

The command refuses to proceed unless the existing release checker returns the mode-appropriate passing decision:

- `AUTO_LOW_RISK_SHADOW` → `WOULD_AUTO_PUBLISH`
- `AUTO_LOW_RISK` → `AUTO_PUBLISH_ELIGIBLE`

It also requires:

- `requires_human=false`
- content-only boundary PASS
- empty release reasons
- target BRIEF is `READY`
- LOW risk
- `AUTO_LOW_RISK`
- semantic QA PASS

The command changes the target BRIEF to `PUBLISHED` on the working branch and regenerates the static Knowledge site. It then runs the release gate again against the expanded diff.

## Important boundary

This tool does **not**:

- merge a PR
- change `publication_mode`
- set `auto_publish_enabled=true`
- deploy Production
- verify Netlify Production

Those remain separate release-authority steps.

In SHADOW mode, use this only for a non-merged rehearsal PR. A SHADOW rehearsal may generate a Deploy Preview but must not be merged into main because the generated page would become live content.
