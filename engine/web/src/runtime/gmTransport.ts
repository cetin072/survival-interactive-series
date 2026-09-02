import type { GMPlayerInput, GMProvider, GMProviderResult, GMProviderTurnRequest } from './gmProvider'

const DEFAULT_GM_ENDPOINT = '/api/gm'
const DIRECT_NETLIFY_GM_ENDPOINT = '/.netlify/functions/gm'
const SAFE_UNAVAILABLE_MESSAGE = '지금은 AI GM 연결을 사용할 수 없습니다.'
const FORBIDDEN_PUBLIC_KEYS = new Set([
  'hidden_seed',
  'hidden_world_seed',
  'unrevealed_event_truth',
  'raw_transcript',
])

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type ValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; message: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function containsForbiddenPublicKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenPublicKey)
  if (!isObject(value)) return false
  return Object.entries(value).some(([key, child]) => FORBIDDEN_PUBLIC_KEYS.has(key.toLowerCase()) || containsForbiddenPublicKey(child))
}

function previewUnavailable(request: GMProviderTurnRequest, category: string, detail?: string): GMProviderResult {
  if (request.checkpoint.source_kind === 'synthetic-fixture') {
    return {
      status: 'unavailable',
      message: `AI GM transport 진단: ${category}${detail ? ` · ${detail}` : ''}`,
    }
  }
  return { status: 'unavailable', message: SAFE_UNAVAILABLE_MESSAGE }
}

function validatePlayerInput(value: unknown): value is GMPlayerInput {
  if (!isObject(value)) return false
  if (value.kind === 'numbered-choice') return Number.isInteger(value.choice_id) && Number(value.choice_id) > 0
  if (value.kind === 'free-action') return typeof value.text === 'string' && value.text.trim().length > 0 && value.text.length <= 2000
  return false
}

/**
 * Transport validation deliberately checks the public boundary rather than re-defining
 * the full engine state schema. Deep physical/state validation remains authoritative in
 * Validator/Action Queue after a proposal returns.
 */
export function validateGMTransportRequest(value: unknown): ValidationResult<GMProviderTurnRequest> {
  if (!isObject(value) || !validatePlayerInput(value.input) || !isObject(value.checkpoint)) {
    return { valid: false, message: 'Malformed GM transport request.' }
  }

  const checkpoint = value.checkpoint
  if (checkpoint.contract_version !== 1 || checkpoint.payload_visibility !== 'public') {
    return { valid: false, message: 'GM transport accepts public runtime checkpoint v1 only.' }
  }
  if (!['synthetic-fixture', 'canon-v2'].includes(String(checkpoint.source_kind))) {
    return { valid: false, message: 'Unknown public runtime checkpoint source.' }
  }
  if (typeof checkpoint.checkpoint_id !== 'string' || typeof checkpoint.season_id !== 'string' || !isObject(checkpoint.public_state)) {
    return { valid: false, message: 'Incomplete public runtime checkpoint.' }
  }
  if (!isObject(checkpoint.current_scene) || !Array.isArray(checkpoint.current_scene.choices)) {
    return { valid: false, message: 'Public runtime checkpoint has no valid current scene.' }
  }
  if (containsForbiddenPublicKey(checkpoint)) {
    return { valid: false, message: 'Hidden or archive-only fields are forbidden on GM transport.' }
  }

  return { valid: true, value: value as unknown as GMProviderTurnRequest }
}

export function validateGMTransportResponse(value: unknown): ValidationResult<GMProviderResult> {
  if (!isObject(value)) return { valid: false, message: 'Malformed GM transport response.' }
  if (value.status === 'unavailable' && typeof value.message === 'string') {
    return { valid: true, value: { status: 'unavailable', message: value.message } }
  }
  if (value.status === 'proposal' && Object.prototype.hasOwnProperty.call(value, 'proposal')) {
    return { valid: true, value: { status: 'proposal', proposal: value.proposal } }
  }
  return { valid: false, message: 'Malformed GM transport response.' }
}

export class HttpGMProvider implements GMProvider {
  constructor(
    private readonly fetcher: FetchLike = fetch,
    private readonly endpoint = DEFAULT_GM_ENDPOINT,
  ) {}

  private post(endpoint: string, request: GMProviderTurnRequest): Promise<Response> {
    return this.fetcher(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
  }

  async proposeTurn(request: GMProviderTurnRequest): Promise<GMProviderResult> {
    const requestCheck = validateGMTransportRequest(request)
    if (!requestCheck.valid) return previewUnavailable(request, 'request_validation', requestCheck.message)

    let response: Response
    try {
      response = await this.post(this.endpoint, requestCheck.value)
    } catch {
      if (this.endpoint !== DEFAULT_GM_ENDPOINT) {
        return previewUnavailable(request, 'network_error')
      }
      try {
        response = await this.post(DIRECT_NETLIFY_GM_ENDPOINT, requestCheck.value)
      } catch {
        return previewUnavailable(request, 'network_error', 'api_and_direct_function_failed')
      }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return previewUnavailable(request, 'invalid_json', `HTTP ${response.status}`)
    }

    const parsed = validateGMTransportResponse(payload)
    if (!parsed.valid) return previewUnavailable(request, 'malformed_response', parsed.message)
    if (!response.ok && parsed.value.status === 'proposal') {
      return previewUnavailable(request, 'http_rejected', `HTTP ${response.status}`)
    }
    return parsed.value
  }
}
