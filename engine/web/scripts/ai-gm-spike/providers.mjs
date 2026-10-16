import { buildActionSchema, validateActionResponse } from './schema.mjs'

const MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models'
const CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export function requireApiKey(environment = process.env) {
  const key = environment.OPENROUTER_API_KEY?.trim()
  if (!key) throw new Error('OPENROUTER_API_KEY is required. Set it only in your local environment, then rerun npm run ai-gm:compare.')
  return key
}

export function selectModels(config, requestedIds = [], maxModels) {
  const requested = requestedIds.filter(Boolean)
  const selected = requested.length
    ? config.models.filter((model) => requested.includes(model.id))
    : config.models
  const unknown = requested.filter((id) => !selected.some((model) => model.id === id))
  if (unknown.length) throw new Error(`Unknown configured model: ${unknown.join(', ')}`)
  return maxModels === undefined ? selected : selected.slice(0, maxModels)
}

export async function verifyModels(models, fetchImpl = fetch) {
  const response = await fetchImpl(MODELS_ENDPOINT)
  if (!response.ok) throw new Error(`OpenRouter model catalog failed: HTTP ${response.status}`)
  const payload = await response.json()
  const catalog = new Map((payload.data ?? []).map((model) => [model.id, model]))
  return models.map((model) => {
    const metadata = catalog.get(model.id)
    const supported = metadata?.supported_parameters ?? []
    const structuredOutputSupported = supported.includes('structured_outputs')
    return {
      ...model,
      available: Boolean(metadata),
      structuredOutputSupported,
      limitation: !metadata
        ? 'Model ID was not found in the live OpenRouter catalog.'
        : !structuredOutputSupported
          ? 'Live OpenRouter metadata does not advertise structured JSON Schema output; benchmark is recorded as failed without weakening the schema.'
          : null,
    }
  })
}

function transientStatus(status) {
  return status === 408 || status === 429 || status >= 500
}

export function extractProviderContent(payload) {
  const choices = payload?.choices
  if (!Array.isArray(choices)) {
    return { valid: false, responseShape: 'choices:not_array', error: 'Unsupported OpenRouter chat completion response shape: choices is not an array.' }
  }
  if (!choices[0] || typeof choices[0] !== 'object') {
    return { valid: false, responseShape: 'choices[0]:missing_or_non_object', error: 'Unsupported OpenRouter chat completion response shape: choices[0] is missing or not an object.' }
  }
  const message = choices[0].message
  if (!message || typeof message !== 'object') {
    return { valid: false, responseShape: 'choices[0].message:missing_or_non_object', error: 'Unsupported OpenRouter chat completion response shape: choices[0].message is missing or not an object.' }
  }
  if (!Object.hasOwn(message, 'content')) {
    return { valid: false, responseShape: 'choices[0].message.content:missing', error: 'Unsupported OpenRouter chat completion response shape: choices[0].message.content is missing.' }
  }
  if (typeof message.content === 'string') {
    return { valid: true, responseShape: 'choices[0].message.content:string', content: message.content }
  }
  const type = Array.isArray(message.content) ? 'array' : message.content === null ? 'null' : typeof message.content
  return { valid: false, responseShape: `choices[0].message.content:${type}`, error: `Unsupported OpenRouter chat completion response shape: choices[0].message.content is ${type}, but this non-streaming Chat Completions benchmark supports only a string.` }
}

function asSafeString(value) {
  return typeof value === 'string' ? value : null
}

export function extractRoutingMetadata(payload) {
  const metadata = payload?.openrouter_metadata
  if (!metadata || typeof metadata !== 'object') {
    return { status: 'not_provided', upstreamProvider: null, upstreamModel: null, strategy: null, routerAttempt: null, attempts: [] }
  }
  const attempts = Array.isArray(metadata.attempts)
    ? metadata.attempts.map((attempt) => ({ provider: asSafeString(attempt?.provider), model: asSafeString(attempt?.model), status: typeof attempt?.status === 'number' ? attempt.status : null }))
    : []
  const selected = Array.isArray(metadata.endpoints?.available)
    ? metadata.endpoints.available.find((endpoint) => endpoint?.selected === true)
    : null
  const lastAttempt = attempts.at(-1) ?? null
  return {
    status: 'provided',
    upstreamProvider: lastAttempt?.provider ?? asSafeString(selected?.provider),
    upstreamModel: lastAttempt?.model ?? asSafeString(selected?.model),
    strategy: asSafeString(metadata.strategy),
    routerAttempt: typeof metadata.attempt === 'number' ? metadata.attempt : null,
    attempts,
  }
}

async function parseResponsePayload(response) {
  const text = await response.text()
  if (!text) return { payload: null, text: '' }
  try { return { payload: JSON.parse(text), text } } catch { return { payload: null, text } }
}

export function parseProviderContent(content, benchmarkCase) {
  let parsed
  try { parsed = JSON.parse(content) } catch { return { valid: false, error: 'Provider content was not valid JSON.' } }
  const validation = validateActionResponse(parsed, benchmarkCase)
  return validation.valid
    ? { valid: true, value: parsed }
    : { valid: false, error: validation.errors.join('; ') }
}

export async function requestStructuredAction({ apiKey, model, benchmarkCase, prompt, timeoutMs, providerId, fetchImpl = fetch }) {
  const request = {
    model: model.id,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 700,
    stream: false,
    response_format: { type: 'json_schema', json_schema: buildActionSchema(benchmarkCase) },
    provider: {
      require_parameters: true,
      ...(providerId ? { only: [providerId], allow_fallbacks: false } : {}),
    },
  }
  const startedAt = performance.now()
  const attempts = []
  let lastFailure
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const attemptStartedAt = performance.now()
    try {
      const response = await fetchImpl(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-OpenRouter-Metadata': 'enabled' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
      const latencyMs = Math.round(performance.now() - attemptStartedAt)
      const { payload, text } = await parseResponsePayload(response)
      const routing = extractRoutingMetadata(payload)
      if (!response.ok) {
        const detail = text.slice(0, 500)
        lastFailure = { error: `OpenRouter request failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`, latencyMs, retryable: transientStatus(response.status), rawContent: null, responseShape: 'not_available_http_error', failureKind: 'http_error', routing }
      } else {
        if (!payload) {
          lastFailure = { error: 'OpenRouter response was not valid JSON.', latencyMs, retryable: true, rawContent: null, responseShape: 'not_available_invalid_json', failureKind: 'invalid_response_payload', routing }
        } else {
        const extracted = extractProviderContent(payload)
        if (!extracted.valid) {
          lastFailure = { error: extracted.error, latencyMs, retryable: true, rawContent: null, responseShape: extracted.responseShape, failureKind: 'unsupported_response_shape', routing }
        } else {
          const parsed = parseProviderContent(extracted.content, benchmarkCase)
          if (parsed.valid) {
            attempts.push({ attempt: attempt + 1, outcome: 'success', latencyMs, responseShape: extracted.responseShape, error: null, routing })
            return {
              ok: true,
              value: parsed.value,
              rawContent: extracted.content,
              latencyMs,
              wallClockMs: Math.round(performance.now() - startedAt),
              attempts,
              routing,
              usage: payload.usage ?? {},
              retryCount: attempt,
            }
          }
          lastFailure = { error: parsed.error, latencyMs, retryable: true, rawContent: extracted.content, usage: payload.usage ?? {}, responseShape: extracted.responseShape, failureKind: 'invalid_provider_content', routing }
        }
        }
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      lastFailure = { error: error instanceof Error ? error.message : String(error), latencyMs: Math.round(performance.now() - attemptStartedAt), retryable: true, rawContent: null, responseShape: 'not_available_transport_error', failureKind: aborted ? 'timeout' : 'transport_or_payload_error', routing: { status: 'not_available', upstreamProvider: null, upstreamModel: null, strategy: null, routerAttempt: null, attempts: [] } }
    } finally {
      clearTimeout(timeout)
    }
    attempts.push({ attempt: attempt + 1, outcome: lastFailure.failureKind, latencyMs: lastFailure.latencyMs, responseShape: lastFailure.responseShape, error: lastFailure.error, routing: lastFailure.routing })
    if (!lastFailure.retryable || attempt === 1) break
  }
  return { ok: false, ...lastFailure, wallClockMs: Math.round(performance.now() - startedAt), attempts, retryCount: attempts.length - 1 }
}
