const fail = (condition, message) => { if (!condition) throw new Error(`KNOWLEDGE_WORKER_CONFIG: ${message}`) }

export const SUPPORTED_PROVIDERS = Object.freeze(['CHATGPT_SCHEDULED', 'OPENAI_API', 'OTHER_LLM_API'])

export function validateWorkerPolicy(policy) {
  fail(policy?.version === 2, 'worker policy version')
  fail(policy.worker_enabled === true, 'worker must be enabled')
  const d = policy.dispatcher
  fail(d?.trigger_interval_hours === 12, 'dispatcher trigger interval must be 12 hours')
  fail(d.timezone === 'Asia/Seoul', 'dispatcher timezone')
  fail(d.fresh_priority === true, 'fresh priority must be enabled')
  fail(d.max_sources_per_run === 1, 'max sources per run')
  fail(d.open_worker_pr_guard === true, 'open PR guard must be enabled')
  fail(d.backfill?.enabled === true, 'backfill must be enabled')
  fail(d.backfill.only_when_no_fresh === true, 'backfill must yield to fresh')
  fail(d.backfill.cadence_hours === 24, 'backfill cadence must be 24 hours')
  fail(Number.isInteger(d.backfill.preferred_hour_local) && d.backfill.preferred_hour_local >= 0 && d.backfill.preferred_hour_local <= 23, 'backfill preferred hour')
  fail(d.backfill.allow_late_retry === true, 'backfill late retry must be enabled')
  fail(d.backfill.bootstrap_only_at_preferred_hour === true, 'backfill bootstrap hour guard')
  fail(d.backfill.max_new_briefs_per_run === 1, 'backfill max briefs')
  fail(typeof policy.provider_config_ref === 'string' && policy.provider_config_ref === 'knowledge/automation/provider-config.json', 'provider config ref')
  fail(policy.editorial_spec_ref === 'docs/KNOWLEDGE_BRIEF_EDITORIAL_SPEC_V1.md', 'editorial spec ref')
  fail(Number.isInteger(policy.research_policy?.minimum_authoritative_sources_per_brief) && policy.research_policy.minimum_authoritative_sources_per_brief >= 2, 'minimum authoritative sources')
  fail(Number.isInteger(policy.research_policy?.preferred_authoritative_sources_per_brief) && policy.research_policy.preferred_authoritative_sources_per_brief >= policy.research_policy.minimum_authoritative_sources_per_brief, 'preferred authoritative sources')
  const runtime = policy.runtime
  fail(runtime?.scheduler_provider === 'CHATGPT_SCHEDULED', 'runtime scheduler provider')
  fail(runtime.worker_pr_branch_prefix === 'knowledge/worker/', 'worker PR branch prefix')
  fail(runtime.state_pr_branch_prefix === 'knowledge/worker/state-', 'state PR branch prefix')
  fail(runtime.publication_label === 'knowledge-publish-prepare', 'publication label')
  fail(Number.isInteger(runtime.stalled_after_hours) && runtime.stalled_after_hours >= 1 && runtime.stalled_after_hours <= 48, 'stalled timeout')
  fail(runtime.notification_marker_prefix === 'knowledge-worker-notify-v1', 'notification marker prefix')
  fail(runtime.external_text_is_untrusted_data === true, 'untrusted external text boundary')
  fail(runtime.require_actual_check_evidence === true, 'actual check evidence required')
  fail(runtime.state_only_auto_merge === true, 'state-only auto merge')
  fail(Array.isArray(runtime.run_result_codes) && runtime.run_result_codes.includes('NOOP') && runtime.run_result_codes.includes('BLOCKED_CONTRACT'), 'run result codes')
  const publication = policy.publication_policy
  fail(['AUTO_LOW_RISK_SHADOW', 'AUTO_LOW_RISK'].includes(publication?.required_repository_mode), 'publication mode')
  const live = publication.required_repository_mode === 'AUTO_LOW_RISK'
  fail(publication.required_auto_publish_enabled === live, 'publication enabled flag')
  fail(publication.create_knowledge_pr === true, 'Knowledge PR creation must stay enabled')
  fail(publication.auto_merge === live, 'auto merge must match publication mode')
  fail(publication.production_publish === live, 'Production publish must match publication mode')
  if (live) {
    fail(publication.exact_head_validation_required === true, 'exact-head validation required')
    fail(publication.production_exact_sha_required === true, 'Production exact-SHA verification required')
  }
  return true
}

export function validateProviderConfig(config) {
  fail(config?.version === 1, 'provider config version')
  fail(SUPPORTED_PROVIDERS.includes(config.active_provider), 'unsupported active provider')
  fail(config.providers && typeof config.providers === 'object', 'providers map')
  const active = config.providers[config.active_provider]
  fail(active?.enabled === true, 'active provider must be enabled')
  for (const name of SUPPORTED_PROVIDERS) {
    const p = config.providers[name]
    fail(p && typeof p.kind === 'string' && typeof p.enabled === 'boolean' && typeof p.requires_secret === 'boolean', `invalid provider ${name}`)
    if (p.requires_secret) {
      fail(typeof p.secret_env === 'string' && /^[A-Z][A-Z0-9_]+$/.test(p.secret_env), `invalid secret env ${name}`)
      fail(!('secret' in p) && !('api_key' in p) && !('token' in p), `checked-in secret forbidden ${name}`)
    }
  }
  fail(config.contracts?.job === 'KNOWLEDGE_WORKER_JOB_V1', 'job contract')
  fail(config.contracts?.result === 'KNOWLEDGE_WORKER_RESULT_V1', 'result contract')
  fail(config.contracts.provider_must_not_bypass_repository_gate === true, 'provider gate boundary')
  return true
}

export function planWorkerRun({ policy, providerConfig, pendingSources = [], openWorkerPr = false, localHour }) {
  validateWorkerPolicy(policy)
  validateProviderConfig(providerConfig)
  fail(Number.isInteger(localHour) && localHour >= 0 && localHour <= 23, 'local hour')
  if (openWorkerPr) return { decision: 'NOOP_OPEN_WORKER_PR', provider: providerConfig.active_provider }
  if (pendingSources.length) return {
    decision: 'FRESH',
    provider: providerConfig.active_provider,
    source: pendingSources[0],
    max_sources: 1,
  }
  if (localHour === policy.dispatcher.backfill.preferred_hour_local) return {
    decision: 'BACKFILL',
    provider: providerConfig.active_provider,
    max_new_briefs: 1,
  }
  return { decision: 'NOOP_WAIT', provider: providerConfig.active_provider }
}
