import test from 'node:test'
import assert from 'node:assert/strict'
import { compileIllustrationImagePrompt } from './illustration-image-prompt.mjs'
import {
  createGenerationProvider,
  normalizedGenerationResult,
  resolveGenerationProvider,
  validateGenerationProviderConfig,
} from './illustration-generation-provider.mjs'

const config = {
  version: 'illustration-generation-provider-v1',
  active_provider: 'native_chatgpt',
  fallback_provider: null,
  providers: {
    native_chatgpt: {
      enabled: true,
      execution_surface: 'CHATGPT_SCHEDULED_TASK',
      paid: false,
      requires_explicit_paid_approval: false,
    },
    api_openai: {
      enabled: false,
      execution_surface: 'EXTERNAL_API',
      paid: true,
      requires_explicit_paid_approval: true,
    },
    manual_import: {
      enabled: true,
      execution_surface: 'MANUAL_IMPORT',
      paid: false,
      requires_explicit_paid_approval: false,
    },
  },
}

const request = {
  point_id: `point-${'a'.repeat(64)}`,
  generation_key: `generation-${'b'.repeat(64)}`,
  subject_id: 'char-test',
}
const imagePrompt = compileIllustrationImagePrompt({
  ...request,
  brief: {
    version: 'visual-brief-v1',
    point_type: 'CHARACTER',
    subject: { label: 'Test subject', node_id: request.subject_id },
    canon_facts: { appearance: { description: 'source fact' } },
    art_direction: {
      composition: 'single-subject master portrait; simple non-identifying background',
      mood: 'QUIET_DECAY',
      mood_rules: ['cool blue-gray'],
      rendering: ['non-photorealistic painterly illustration'],
      avoid: ['embedded typography'],
      style_version: 'AFTERFALL_ARCHIVE_V1',
      theme: 'Quiet survival.',
    },
    safeguards: ['Do not invent facts.'],
  },
})

test('defaults to native ChatGPT with no fallback', () => {
  const valid = validateGenerationProviderConfig(structuredClone(config))
  assert.equal(valid.active_provider, 'native_chatgpt')
  assert.equal(resolveGenerationProvider(valid).provider, 'native_chatgpt')
})

test('provider selection is explicit and never silently falls back', () => {
  assert.throws(
    () => validateGenerationProviderConfig({ ...structuredClone(config), fallback_provider: 'manual_import' }),
    /ILLUSTRATION_GENERATION_FALLBACK_FORBIDDEN/,
  )
  assert.throws(
    () => resolveGenerationProvider(config, 'api_openai'),
    /ILLUSTRATION_GENERATION_PROVIDER_DISABLED/,
  )
})

test('paid provider stays fail-closed until separately approved and enabled', () => {
  const enabledPaid = structuredClone(config)
  enabledPaid.providers.api_openai.enabled = true
  assert.throws(
    () => resolveGenerationProvider(enabledPaid, 'api_openai'),
    /PAID_ILLUSTRATION_PROVIDER_REQUIRES_EXPLICIT_APPROVAL/,
  )
})

test('all providers return the same normalized generation result contract', async () => {
  const native = await createGenerationProvider('native_chatgpt').generateIllustration(imagePrompt)
  assert.equal(native.contract_version, 'illustration-generation-result-v1')
  assert.equal(native.provider, 'native_chatgpt')
  assert.equal(native.subject_id, 'char-test')
  assert.equal(native.status, 'STUBBED')

  const imported = await createGenerationProvider('manual_import').generateIllustration({
    ...imagePrompt,
  }, {
    imported_result: {
      original_ref: 'private/original.png',
      width: 1024,
      height: 1024,
      mime_type: 'image/png',
      sha256: 'c'.repeat(64),
    },
  })
  assert.equal(imported.contract_version, native.contract_version)
  assert.equal(imported.status, 'IMPORTED')
  assert.equal(imported.sha256, 'c'.repeat(64))
})

test('every provider consumes the same prompt contract without operational request fields', async () => {
  const original = JSON.stringify(imagePrompt)
  for (const providerId of ['native_chatgpt', 'api_openai', 'manual_import']) {
    const provider = createGenerationProvider(providerId)
    const context = providerId === 'manual_import'
      ? { imported_result: { original_ref: 'private/original.png', width: 512, height: 512, mime_type: 'image/png', sha256: 'e'.repeat(64) } }
      : {}
    const result = await provider.generateIllustration(imagePrompt, context)
    assert.equal(result.point_id, imagePrompt.point_id)
    assert.equal(result.generation_key, imagePrompt.generation_key)
    assert.equal(JSON.stringify(imagePrompt), original)
  }
  await assert.rejects(() => createGenerationProvider('native_chatgpt').generateIllustration({
    ...imagePrompt,
    execution_surface: 'CHATGPT_SCHEDULED_TASK',
  }), /INVALID_ILLUSTRATION_IMAGE_PROMPT/)
  await assert.rejects(() => createGenerationProvider('native_chatgpt').generateIllustration(imagePrompt, {
    workflow: 'daily',
  }), /ILLUSTRATION_GENERATION_REQUEST_INVALID/)
})

test('successful results require transferable PNG identity', () => {
  assert.throws(() => normalizedGenerationResult({
    provider: 'native_chatgpt',
    request,
    status: 'SUCCEEDED',
  }), /ILLUSTRATION_GENERATION_RESULT_INVALID/)

  const result = normalizedGenerationResult({
    provider: 'native_chatgpt',
    request,
    status: 'SUCCEEDED',
    originalRef: 'generated-asset-ref',
    width: 1536,
    height: 1024,
    mimeType: 'image/png',
    sha256: 'd'.repeat(64),
    providerAssetId: 'asset-1',
  })
  assert.equal(result.status, 'SUCCEEDED')
  assert.equal(result.provider_asset_id, 'asset-1')
})
