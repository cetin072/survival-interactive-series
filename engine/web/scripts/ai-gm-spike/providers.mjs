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

function extractContent(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('Provider response did not contain choices[0].message.content text.')
  return content
}

export function parseProviderContent(content, benchmarkCase) {
  let parsed
  try { parsed = JSON.parse(content) } catch { return { valid: false, error: 'Provider content was not valid JSON.' } }
  const validation = validateActionResponse(parsed, benchmarkCase)
  return validation.valid
    ? { valid: true, value: parsed }
    : { valid: false, error: validation.errors.join('; ') }
}

export async function requestStructuredAction({ apiKey, model, benchmarkCase, prompt, timeoutMs, fetchImpl = fetch }) {
  const request = {
    model: model.id,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 700,
    stream: false,
    response_format: { type: 'json_schema', json_schema: buildActionSchema(benchmarkCase) },
    provider: { require_parameters: true },
  }
  let lastFailure
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const startedAt = performance.now()
    try {
      const response = await fetchImpl(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
      const latencyMs = Math.round(performance.now() - startedAt)
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500)
        lastFailure = { error: `OpenRouter request failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`, latencyMs, retryable: transientStatus(response.status), rawContent: null }
      } else {
        const payload = await response.json()
        const rawContent = extractContent(payload)
        const parsed = parseProviderContent(rawContent, benchmarkCase)
        if (parsed.valid) {
          return {
            ok: true,
            value: parsed.value,
            rawContent,
            latencyMs,
            usage: payload.usage ?? {},
            retryCount: attempt,
          }
        }
        lastFailure = { error: parsed.error, latencyMs, retryable: true, rawContent, usage: payload.usage ?? {} }
      }
    } catch (error) {
      lastFailure = { error: error instanceof Error ? error.message : String(error), latencyMs: Math.round(performance.now() - startedAt), retryable: true, rawContent: null }
    } finally {
      clearTimeout(timeout)
    }
    if (!lastFailure.retryable || attempt === 1) break
  }
  return { ok: false, ...lastFailure, retryCount: 1 }
}
