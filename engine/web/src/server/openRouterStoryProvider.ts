import type { GMProvider, GMProviderResult, GMProviderTurnRequest } from '../runtime/gmProvider'
import { validateGMProposal } from '../runtime/gmProposal'

const MODEL = 'deepseek/deepseek-v4-flash-0731:nitro'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const TIMEOUT_MS = 14_000
const FORBIDDEN_KEYS = new Set(['hidden_seed', 'hidden_world_seed', 'unrevealed_event_truth', 'raw_transcript'])

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const GM_PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['actions', 'narrative', 'next_choices', 'presentation_blocks', 'family_reactions'],
  properties: {
    actions: { type: 'array', maxItems: 4, items: { $ref: '#/$defs/action' } },
    narrative: { type: 'string' },
    next_choices: {
      type: 'array', minItems: 2, maxItems: 4,
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'label'],
        properties: { id: { type: 'integer', minimum: 1, maximum: 4 }, label: { type: 'string' } },
      },
    },
    presentation_blocks: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object', additionalProperties: false, required: ['type', 'message'],
        properties: { type: { enum: ['EVENT', 'AUTO', 'PHASE CHANGE'] }, message: { type: 'string' } },
      },
    },
    family_reactions: {
      type: 'array', maxItems: 3,
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
      type: 'object', additionalProperties: false,
      required: ['id', 'label', 'actors', 'exclusive_resources', 'proposal'],
      properties: {
        id: { type: 'string' },
        label: { type: 'string' },
        actors: { type: 'array', items: { enum: ['player', 'wife', 'son', 'father'] } },
        exclusive_resources: { type: 'array', items: { type: 'string' } },
        proposal: {
          type: 'object', additionalProperties: false,
          required: ['time_delta_min', 'moves', 'resource_changes', 'base_capability_changes', 'world_changes'],
          properties: {
            time_delta_min: { type: 'integer', minimum: 0, maximum: 240 },
            moves: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false,
                required: ['entity_type', 'entity_id', 'from', 'to'],
                properties: {
                  entity_type: { enum: ['party', 'vehicle'] }, entity_id: { type: 'string' },
                  from: { type: 'string' }, to: { type: 'string' },
                },
              },
            },
            resource_changes: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false,
                required: ['resource_id', 'from', 'to'],
                properties: { resource_id: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } },
              },
            },
            base_capability_changes: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false,
                required: ['base_id', 'add'],
                properties: { base_id: { type: 'string' }, add: { type: 'string' } },
              },
            },
            world_changes: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false,
                required: ['key', 'to'],
                properties: { key: { type: 'string' }, from: {}, to: {} },
              },
            },
          },
        },
      },
    },
  },
} as const

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !FORBIDDEN_KEYS.has(key.toLowerCase()))
    .map(([key, child]) => [key, scrub(child)]))
}

function publicContext(request: GMProviderTurnRequest) {
  const checkpoint = request.checkpoint
  const input = request.input
  const choiceId = input.kind === 'numbered-choice' ? input.choice_id : undefined
  const selected = choiceId !== undefined
    ? checkpoint.current_scene.choices.find((choice) => choice.id === choiceId)
    : undefined
  const nextTurn = checkpoint.committed_turn.number + 1

  return {
    session: 'WEB_MVP_TEST_SESSION / NON-CANONICAL',
    turn_number: nextTurn,
    player_action: input.kind === 'free-action'
      ? { kind: 'free-action', text: input.text }
      : { kind: 'numbered-choice', choice_id: choiceId, label: selected?.label ?? null },
    current_scene: {
      id: checkpoint.current_scene.id,
      narrative: checkpoint.current_scene.narrative,
      choices: checkpoint.current_scene.choices.map((choice) => ({ id: choice.id, label: choice.label })),
    },
    recent_history: checkpoint.committed_turn.log.slice(-12).map((entry) => ({ kind: entry.kind, text: entry.text })),
    visible_state: {
      date: checkpoint.date,
      time: checkpoint.time,
      player_location: checkpoint.player_location,
      family: checkpoint.family,
      resources: checkpoint.resources,
      base_capabilities: checkpoint.base_capabilities,
      pressure: checkpoint.active_visible_pressure,
      recent_visible_change: checkpoint.recent_visible_change,
      public_world: scrub(checkpoint.public_state.public_world),
    },
    engine_contract: {
      authoritative_engine: true,
      action_id_prefix: `t${nextTurn}_`,
      actions_mean: 'only immediate state changes caused by the action selected on this turn',
      next_choices_mean: '2-4 future options as id+label only; never precompute their state changes',
      forbidden: ['direct state mutation', 'Canon changes', 'Hidden World Seed', 'raw transcript'],
    },
  }
}

const SYSTEM_PROMPT = `You are the narrative GM for a Korean survival RPG.
Every turn, whether the player clicked a numbered choice or typed a free action, continue the story as immersive serialized fiction in Korean.
The narrative must make clear what happened because of the player's action, how the family/world reacted, and why the next decision matters.
Do not sound like a checklist, simulator test, or macro. Do not mention test plumbing inside the narrative. Never call family members NPCs.
Keep momentum: crisis -> adaptation -> visible growth/reward -> new pressure. Compress uneventful waiting instead of narrating repeated observation turns.
Family members have independent judgment: they may agree, amend, defer, decline, or act independently.
Return only the GMProposal JSON required by the schema.
The actions array contains only immediate state-change proposals for THIS turn. The engine validates and commits them; never assume a proposed change succeeded unless it is supported by the supplied visible state.
Each action id must begin with the supplied action_id_prefix and be unique.
next_choices are only 2-4 concise future choices with id and label. Do not attach actions to future choices.
Never invent hidden facts, hidden seeds, Canon changes, or archive-only information.`

export class OpenRouterStoryProvider implements GMProvider {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = TIMEOUT_MS,
  ) {}

  async proposeTurn(request: GMProviderTurnRequest): Promise<GMProviderResult> {
    if (!this.apiKey) return { status: 'unavailable', message: 'AI GM 서버 키를 사용할 수 없습니다.', diagnostic: { key_present: false, failure_category: 'missing_key' } }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.35,
          max_tokens: 900,
          reasoning: { effort: 'none' },
          provider: { require_parameters: true },
          response_format: { type: 'json_schema', json_schema: { name: 'story_gm_proposal', strict: true, schema: GM_PROPOSAL_SCHEMA } },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(publicContext(request)) },
          ],
        }),
      })

      if (!response.ok) {
        const failure = response.status === 401 || response.status === 403 ? 'auth_or_config'
          : response.status === 429 ? 'route_unavailable'
            : response.status >= 500 ? 'upstream_5xx' : 'provider_error'
        return { status: 'unavailable', message: 'AI GM 응답을 받지 못했습니다. 다시 시도해 주세요.', diagnostic: { key_present: true, failure_category: failure } }
      }

      const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> }
      const content = payload.choices?.[0]?.message?.content
      if (typeof content !== 'string') return { status: 'unavailable', message: 'AI GM 응답 형식이 올바르지 않습니다.', diagnostic: { key_present: true, failure_category: 'unsupported_response_shape' } }

      let candidate: unknown
      try {
        candidate = JSON.parse(content)
      } catch {
        return { status: 'unavailable', message: 'AI GM 응답을 해석하지 못했습니다.', diagnostic: { key_present: true, failure_category: 'malformed_json' } }
      }

      const proposal = validateGMProposal(candidate)
      if (!proposal.valid) return { status: 'unavailable', message: `AI GM 제안 형식 오류: ${proposal.message}`, diagnostic: { key_present: true, failure_category: 'schema_mismatch' } }
      return { status: 'proposal', proposal: proposal.proposal, diagnostic: { key_present: true } }
    } catch (error) {
      const timedOut = controller.signal.aborted
      return { status: 'unavailable', message: timedOut ? 'AI GM 응답 시간이 초과되었습니다. 다시 시도해 주세요.' : 'AI GM 연결에 실패했습니다. 다시 시도해 주세요.', diagnostic: { key_present: true, failure_category: timedOut ? 'timeout' : 'network' } }
    } finally {
      clearTimeout(timer)
    }
  }
}

export function createOpenRouterStoryProviderFromEnvironment(): GMProvider {
  const environment = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return new OpenRouterStoryProvider(environment?.OPENROUTER_API_KEY)
}
