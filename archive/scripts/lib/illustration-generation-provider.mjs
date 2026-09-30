import { validateIllustrationImagePrompt } from './illustration-image-prompt.mjs'

export const GENERATION_PROVIDER_CONFIG_VERSION = 'illustration-generation-provider-v1'
export const GENERATION_PROVIDER_IDS = ['native_chatgpt', 'api_openai', 'manual_import']
export const GENERATION_RESULT_VERSION = 'illustration-generation-result-v1'

const sha256OrNull = (value) => value === null || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))

export function validateGenerationProviderConfig(config) {
  if (!config || config.version !== GENERATION_PROVIDER_CONFIG_VERSION
    || !GENERATION_PROVIDER_IDS.includes(config.active_provider)
    || !(config.fallback_provider === null || GENERATION_PROVIDER_IDS.includes(config.fallback_provider))
    || !config.providers || typeof config.providers !== 'object' || Array.isArray(config.providers)) {
    throw new Error('INVALID_ILLUSTRATION_GENERATION_PROVIDER_CONFIG')
  }
  for (const provider of GENERATION_PROVIDER_IDS) {
    const entry = config.providers[provider]
    if (!entry || typeof entry.enabled !== 'boolean' || typeof entry.execution_surface !== 'string'
      || typeof entry.paid !== 'boolean' || typeof entry.requires_explicit_paid_approval !== 'boolean') {
      throw new Error('INVALID_ILLUSTRATION_GENERATION_PROVIDER_CONFIG')
    }
  }
  if (config.fallback_provider !== null) {
    throw new Error('ILLUSTRATION_GENERATION_FALLBACK_FORBIDDEN')
  }
  return config
}

export function resolveGenerationProvider(config, requestedProvider = null) {
  validateGenerationProviderConfig(config)
  const provider = requestedProvider ?? config.active_provider
  if (!GENERATION_PROVIDER_IDS.includes(provider)) throw new Error('ILLUSTRATION_GENERATION_PROVIDER_UNSUPPORTED')
  const entry = config.providers[provider]
  if (!entry.enabled) throw new Error('ILLUSTRATION_GENERATION_PROVIDER_DISABLED')
  if (entry.paid && entry.requires_explicit_paid_approval) {
    throw new Error('PAID_ILLUSTRATION_PROVIDER_REQUIRES_EXPLICIT_APPROVAL')
  }
  return { provider, ...entry }
}

export function normalizedGenerationResult({
  provider,
  request,
  status,
  originalRef = null,
  width = null,
  height = null,
  mimeType = null,
  sha256 = null,
  providerAssetId = null,
  providerModel = null,
  metadata = {},
}) {
  if (!GENERATION_PROVIDER_IDS.includes(provider)) throw new Error('ILLUSTRATION_GENERATION_PROVIDER_UNSUPPORTED')
  if (!request || typeof request.point_id !== 'string' || typeof request.generation_key !== 'string'
    || typeof request.subject_id !== 'string') {
    throw new Error('ILLUSTRATION_GENERATION_REQUEST_INVALID')
  }
  if (!['STUBBED', 'LIVE_DISABLED', 'AWAITING_IMPORT', 'IMPORTED', 'SUCCEEDED', 'FAILED'].includes(status)
    || !(originalRef === null || typeof originalRef === 'string')
    || !(width === null || Number.isInteger(width))
    || !(height === null || Number.isInteger(height))
    || !(mimeType === null || mimeType === 'image/png')
    || !sha256OrNull(sha256)
    || !(providerAssetId === null || typeof providerAssetId === 'string')
    || !(providerModel === null || typeof providerModel === 'string')) {
    throw new Error('ILLUSTRATION_GENERATION_RESULT_INVALID')
  }
  if (['IMPORTED', 'SUCCEEDED'].includes(status)
    && (typeof originalRef !== 'string' || !Number.isInteger(width) || !Number.isInteger(height)
      || mimeType !== 'image/png' || !/^[a-f0-9]{64}$/.test(sha256 ?? ''))) {
    throw new Error('ILLUSTRATION_GENERATION_RESULT_INVALID')
  }
  return {
    contract_version: GENERATION_RESULT_VERSION,
    point_id: request.point_id,
    generation_key: request.generation_key,
    subject_id: request.subject_id,
    provider,
    provider_model: providerModel,
    provider_asset_id: providerAssetId,
    status,
    original_ref: originalRef,
    width,
    height,
    mime_type: mimeType,
    sha256,
    metadata: { ...metadata },
  }
}

export function createGenerationProvider(provider) {
  if (!GENERATION_PROVIDER_IDS.includes(provider)) throw new Error('ILLUSTRATION_GENERATION_PROVIDER_UNSUPPORTED')
  return {
    name: provider,
    async generateIllustration(imagePrompt, context = {}) {
      validateIllustrationImagePrompt(imagePrompt)
      if (!context || typeof context !== 'object' || Array.isArray(context)
        || Object.keys(context).some((key) => key !== 'imported_result')) {
        throw new Error('ILLUSTRATION_GENERATION_REQUEST_INVALID')
      }
      const request = imagePrompt
      if (provider === 'native_chatgpt') {
        return normalizedGenerationResult({
          provider,
          request,
          status: 'STUBBED',
          metadata: {
            support: 'SCHEDULED_CHATGPT_PROVIDER_BOUNDARY_READY',
            calls_made: 0,
            counts_toward_daily_generation_cap: false,
          },
        })
      }
      if (provider === 'api_openai') {
        return normalizedGenerationResult({
          provider,
          request,
          status: 'LIVE_DISABLED',
          metadata: {
            reason: 'PAID_API_DISABLED_BY_ZERO_COST_POLICY',
            calls_made: 0,
            counts_toward_daily_generation_cap: false,
          },
        })
      }
      const imported = context.imported_result
      if (!imported || typeof imported.original_ref !== 'string' || !Number.isInteger(imported.width)
        || !Number.isInteger(imported.height) || imported.mime_type !== 'image/png'
        || !/^[a-f0-9]{64}$/.test(imported.sha256 ?? '')) {
        return normalizedGenerationResult({
          provider,
          request,
          status: 'AWAITING_IMPORT',
          metadata: { calls_made: 0, counts_toward_daily_generation_cap: false },
        })
      }
      return normalizedGenerationResult({
        provider,
        request,
        status: 'IMPORTED',
        originalRef: imported.original_ref,
        width: imported.width,
        height: imported.height,
        mimeType: imported.mime_type,
        sha256: imported.sha256,
        providerAssetId: imported.provider_asset_id ?? null,
        providerModel: imported.provider_model ?? null,
        metadata: { calls_made: 0, counts_toward_daily_generation_cap: false },
      })
    },
  }
}
