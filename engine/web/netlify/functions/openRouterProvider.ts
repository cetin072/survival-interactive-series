import type { GMProvider, GMProviderResult, GMProviderTurnRequest } from '../../src/runtime/gmProvider'

export const OPENROUTER_DEEPSEEK_MODEL = 'deepseek/deepseek-v4-flash-0731'
const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_TIMEOUT_MS = 8_000

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type GMProviderObservability = {
  provider: 'openrouter'
  model: string
  latency_ms: number
  retry_count: 0
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number }
}

type FailureKind = 'unavailable' | 'timeout' | 'malformed_json' | 'unsupported_response_shape' | 'schema_error'

function failure(kind: FailureKind, message: string, meta: GMProviderObservability): GMProviderResult {
  return { status: 'unavailable', message, meta: { ...meta, failure_kind: kind } }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function usageFrom(value: unknown): GMProviderObservability['usage'] | undefined {
  const usage = asRecord(value)
  if (!usage) return undefined
  const result = {
    prompt_tokens: finiteNumber(usage.prompt_tokens),
    completion_tokens: finiteNumber(usage.completion_tokens),
    total_tokens: finiteNumber(usage.total_tokens),
    cost: finiteNumber(usage.cost),
  }
  return Object.values(result).some((item) => item !== undefined) ? result : undefined
}

function proposalSchema() {
  // This is a transport shape contract only. Validator/Action Queue remain authoritative.
  return {
    type: 'object', additionalProperties: false,
    required: ['actions', 'narrative', 'next_choices', 'presentation_blocks'],
    properties: {
      actions: { type: 'array', items: { type: 'object' } },
      narrative: { type: 'string' },
      next_choices: { type: 'array', items: { type: 'object' } },
      presentation_blocks: { type: 'array', items: { type: 'object' } },
      visible_reaction: { type: 'string' },
      ambiguity: {
        type: 'object', additionalProperties: false, required: ['kind', 'message'],
        properties: { kind: { type: 'string', enum: ['linguistic', 'deferred'] }, message: { type: 'string' } },
      },
    },
  }
}

function requestBody(request: GMProviderTurnRequest): string {
  return JSON.stringify({
    model: OPENROUTER_DEEPSEEK_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Return exactly one GMProposal JSON object. Propose only. Never claim to commit state; the engine validates and commits actions.',
      },
      { role: 'user', content: JSON.stringify(request) },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'gm_proposal', strict: true, schema: proposalSchema() } },
    temperature: 0.2,
  })
}

/** Server-only OpenRouter adapter. It makes exactly one bounded request per turn and never logs request content or credentials. */
export class OpenRouterDeepSeekProvider implements GMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: FetchLike = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async proposeTurn(request: GMProviderTurnRequest): Promise<GMProviderResult> {
    const startedAt = Date.now()
    const meta = (): GMProviderObservability => ({ provider: 'openrouter', model: OPENROUTER_DEEPSEEK_MODEL, latency_ms: Date.now() - startedAt, retry_count: 0 })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetcher(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: 'POST', signal: controller.signal,
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: requestBody(request),
      })
    } catch (error) {
      clearTimeout(timer)
      return failure((error as { name?: string }).name === 'AbortError' ? 'timeout' : 'unavailable', 'OpenRouter provider is unavailable.', meta())
    }
    clearTimeout(timer)

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return failure('malformed_json', 'OpenRouter returned invalid JSON.', meta())
    }
    const responseMeta = { ...meta(), usage: usageFrom(asRecord(payload)?.usage) }
    if (!response.ok) return failure('unavailable', 'OpenRouter provider is unavailable.', responseMeta)

    const choices = asRecord(payload)?.choices
    const choice = Array.isArray(choices) ? choices[0] : undefined
    const message = asRecord(choice)?.message
    const content = asRecord(message)?.content
    if (typeof content !== 'string') return failure('unsupported_response_shape', 'OpenRouter returned an unsupported response shape.', responseMeta)

    try {
      return { status: 'proposal', proposal: JSON.parse(content), meta: responseMeta }
    } catch {
      return failure('schema_error', 'OpenRouter returned malformed structured output.', responseMeta)
    }
  }
}
