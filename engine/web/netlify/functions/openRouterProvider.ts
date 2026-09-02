import { validateGMProposal } from '../../src/runtime/gmProposal'
import { NullProvider, type GMProvider, type GMProviderResult, type GMProviderTurnRequest } from '../../src/runtime/gmProvider'

export const OPENROUTER_DEEPSEEK_MODEL = 'deepseek/deepseek-v4-flash-0731'
export const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const OPENROUTER_TIMEOUT_MS = 12_000
export const OPENROUTER_MAX_ATTEMPTS = 2

type FailureCategory = 'missing_key' | 'timeout' | 'network' | 'auth_or_config' | 'route_unavailable' | 'upstream_5xx' | 'malformed_json' | 'unsupported_response_shape' | 'schema_mismatch'

export type OpenRouterObservabilityEvent = {
  request_id: string
  model: string
  upstream_provider?: string
  latency_ms: number
  retry_count: number
  success: boolean
  failure_category?: FailureCategory
  schema_validation: 'passed' | 'failed' | 'not_run'
  usage?: Record<string, number>
  cost?: number
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type OpenRouterProviderOptions = {
  apiKey?: string
  fetchImpl?: FetchLike
  timeoutMs?: number
  observe?: (event: OpenRouterObservabilityEvent) => void
}

class ProviderFailure extends Error {
  constructor(readonly category: FailureCategory) {
    super(category)
  }
}

function createRequestId() {
  return `gm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function safeUsage(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value).filter(([, item]) => typeof item === 'number' && Number.isFinite(item))
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function publicGMContext(request: GMProviderTurnRequest) {
  const checkpoint = request.checkpoint
  return {
    test_session: 'WEB_MVP_TEST_SESSION / NON-CANONICAL',
    player_free_action: request.input.kind === 'free-action' ? request.input.text : `numbered choice ${request.input.choice_id}`,
    current_scene: {
      id: checkpoint.current_scene.id,
      narrative: checkpoint.current_scene.narrative,
      numbered_choices: checkpoint.current_scene.choices.map((choice) => ({ id: choice.id, label: choice.label })),
    },
    visible_state: {
      date: checkpoint.date,
      time: checkpoint.time,
      player_location: checkpoint.player_location,
      family: checkpoint.family,
      resources: checkpoint.resources,
      base_capabilities: checkpoint.base_capabilities,
      pressure: checkpoint.active_visible_pressure,
    },
    action_contract: {
      action_order: 'actions are processed in array order by the engine',
      actors: ['player', 'wife', 'son', 'father'],
      engine_is_authoritative: true,
      rule: 'Preserve clear but impossible intent in an action proposal. Do not mark it ambiguous merely because validation may reject it.',
      forbidden: ['direct state mutation', 'Canon changes', 'Hidden World Seed', 'raw transcript'],
    },
  }
}

const GM_PROPOSAL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['actions', 'narrative', 'next_choices', 'presentation_blocks', 'family_reactions'],
  properties: {
    actions: { type: 'array', items: { $ref: '#/$defs/action' } },
    narrative: { type: 'string' },
    next_choices: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'label', 'action'],
        properties: { id: { type: 'integer' }, label: { type: 'string' }, action: { $ref: '#/$defs/action' } },
      },
    },
    presentation_blocks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['type', 'message'],
        properties: { type: { enum: ['EVENT', 'AUTO', 'PHASE CHANGE'] }, message: { type: 'string' } },
      },
    },
    family_reactions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['member', 'disposition', 'message'],
        properties: {
          member: { enum: ['wife', 'son', 'father'] },
          disposition: { enum: ['agree', 'amend', 'defer', 'decline', 'independent_action'] },
          message: { type: 'string' },
        },
      },
    },
  },
  $defs: {
    action: {
      type: 'object', additionalProperties: false, required: ['id', 'label', 'actors', 'exclusive_resources', 'proposal'],
      properties: {
        id: { type: 'string' }, label: { type: 'string' }, actors: { type: 'array', items: { enum: ['player', 'wife', 'son', 'father'] } },
        exclusive_resources: { type: 'array', items: { type: 'string' } },
        proposal: {
          type: 'object', additionalProperties: false, required: ['time_delta_min', 'moves', 'resource_changes', 'base_capability_changes', 'world_changes'],
          properties: {
            time_delta_min: { type: 'integer', minimum: 0 },
            moves: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['entity_type', 'entity_id', 'from', 'to'], properties: { entity_type: { enum: ['party', 'vehicle'] }, entity_id: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } } },
            resource_changes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['resource_id', 'from', 'to'], properties: { resource_id: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } } },
            base_capability_changes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['base_id', 'add'], properties: { base_id: { type: 'string' }, add: { type: 'string' } } } },
            world_changes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'to'], properties: { key: { type: 'string' }, from: {}, to: {} } } },
          },
        },
      },
    },
  },
} as const

function messageFor(category: FailureCategory): string {
  if (category === 'missing_key' || category === 'auth_or_config') return '지금은 자유행동 해석을 사용할 수 없습니다. 숫자 선택지는 계속 사용할 수 있습니다.'
  return '자유행동 해석에 잠시 문제가 있습니다. 숫자 선택지는 계속 사용할 수 있습니다.'
}

function shouldRetry(category: FailureCategory): boolean {
  return category === 'timeout' || category === 'upstream_5xx' || category === 'route_unavailable' || category === 'network'
}

async function fetchWithTimeout(fetchImpl: FetchLike, body: unknown, apiKey: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal,
    })
  } catch {
    throw new ProviderFailure(controller.signal.aborted ? 'timeout' : 'network')
  } finally {
    clearTimeout(timer)
  }
}

/** Server-only OpenRouter adapter. It produces untrusted proposals; the browser engine remains the only commit path. */
export class OpenRouterProvider implements GMProvider {
  private readonly apiKey: string | undefined
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number
  private readonly observe: (event: OpenRouterObservabilityEvent) => void

  constructor(options: OpenRouterProviderOptions = {}) {
    this.apiKey = options.apiKey
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? OPENROUTER_TIMEOUT_MS
    this.observe = options.observe ?? ((event) => console.info('gm_openrouter', event))
  }

  async proposeTurn(request: GMProviderTurnRequest): Promise<GMProviderResult> {
    const requestId = createRequestId()
    const startedAt = Date.now()
    if (!this.apiKey) {
      this.observe({ request_id: requestId, model: OPENROUTER_DEEPSEEK_MODEL, latency_ms: 0, retry_count: 0, success: false, failure_category: 'missing_key', schema_validation: 'not_run' })
      return { status: 'unavailable', message: messageFor('missing_key') }
    }

    const body = {
      model: OPENROUTER_DEEPSEEK_MODEL,
      temperature: 0.2,
      max_tokens: 1400,
      response_format: { type: 'json_schema', json_schema: { name: 'gm_proposal', strict: true, schema: GM_PROPOSAL_JSON_SCHEMA } },
      messages: [
        { role: 'system', content: 'You are a non-canonical web MVP game master. Return only a GMProposal JSON object that matches the supplied schema. AI proposes; the engine validates and commits. Never invent hidden facts or mutate state.' },
        { role: 'user', content: JSON.stringify(publicGMContext(request)) },
      ],
    }

    let retryCount = 0
    let lastFailure: FailureCategory = 'network'
    for (let attempt = 0; attempt < OPENROUTER_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetchWithTimeout(this.fetchImpl, body, this.apiKey, this.timeoutMs)
        if (!response.ok) {
          const category: FailureCategory = response.status === 401 || response.status === 403 || response.status === 400
            ? 'auth_or_config'
            : response.status === 404 || response.status === 429 ? 'route_unavailable'
              : response.status >= 500 ? 'upstream_5xx' : 'unsupported_response_shape'
          throw new ProviderFailure(category)
        }
        let payload: unknown
        try {
          payload = await response.json()
        } catch {
          throw new ProviderFailure('malformed_json')
        }
        const content = payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content
          : undefined
        if (typeof content !== 'string') throw new ProviderFailure('unsupported_response_shape')
        let proposal: unknown
        try {
          proposal = JSON.parse(content)
        } catch {
          throw new ProviderFailure('malformed_json')
        }
        const schema = validateGMProposal(proposal)
        const metadata = payload as { usage?: unknown; provider?: unknown; model?: unknown }
        const upstream = response.headers.get('x-openrouter-provider') ?? (typeof metadata.provider === 'string' ? metadata.provider : undefined)
        const usage = safeUsage(metadata.usage)
        const cost = usage?.cost
        if (!schema.valid) {
          this.observe({ request_id: requestId, model: OPENROUTER_DEEPSEEK_MODEL, upstream_provider: upstream, latency_ms: Date.now() - startedAt, retry_count: retryCount, success: false, failure_category: 'schema_mismatch', schema_validation: 'failed', usage, cost })
          return { status: 'unavailable', message: messageFor('schema_mismatch') }
        }
        this.observe({ request_id: requestId, model: OPENROUTER_DEEPSEEK_MODEL, upstream_provider: upstream, latency_ms: Date.now() - startedAt, retry_count: retryCount, success: true, schema_validation: 'passed', usage, cost })
        return { status: 'proposal', proposal: schema.proposal }
      } catch (error) {
        lastFailure = error instanceof ProviderFailure ? error.category : 'network'
        if (!shouldRetry(lastFailure) || attempt + 1 >= OPENROUTER_MAX_ATTEMPTS) break
        retryCount += 1
      }
    }
    this.observe({ request_id: requestId, model: OPENROUTER_DEEPSEEK_MODEL, latency_ms: Date.now() - startedAt, retry_count: retryCount, success: false, failure_category: lastFailure, schema_validation: 'not_run' })
    return { status: 'unavailable', message: messageFor(lastFailure) }
  }
}

export function createOpenRouterProviderFromEnvironment(): GMProvider {
  const environment = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const apiKey = environment?.OPENROUTER_API_KEY
  return apiKey ? new OpenRouterProvider({ apiKey }) : new NullProvider(messageFor('missing_key'))
}
