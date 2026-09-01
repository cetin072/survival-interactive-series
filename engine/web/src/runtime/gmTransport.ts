import type { GMPlayerInput, GMProvider, GMProviderResult, GMProviderTurnRequest } from './gmProvider'

const DEFAULT_GM_ENDPOINT = '/api/gm'
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

  async proposeTurn(request: GMProviderTurnRequest): Promise<GMProviderResult> {
    const requestCheck = validateGMTransportRequest(request)
    if (!requestCheck.valid) return { status: 'unavailable', message: requestCheck.message }

    let response: Response
    try {
      response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestCheck.value),
      })
    } catch {
      return { status: 'unavailable', message: 'AI GM transport request failed.' }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return { status: 'unavailable', message: `AI GM transport returned invalid JSON (${response.status}).` }
    }

    const parsed = validateGMTransportResponse(payload)
    if (!parsed.valid) return { status: 'unavailable', message: parsed.message }
    if (!response.ok && parsed.value.status === 'proposal') {
      return { status: 'unavailable', message: `AI GM transport rejected the proposal (${response.status}).` }
    }
    return parsed.value
  }
}
