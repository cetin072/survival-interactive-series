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

const browserSafeFetch: FetchLike = (input, init) => globalThis.fetch(input, init)

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
  if (value.kind === 'ordered-choices') {
    if (!Array.isArray(value.choice_ids) || value.choice_ids.length < 1 || value.choice_ids.length > 2) return false
    if (!value.choice_ids.every((id) => Number.isInteger(id) && Number(id) > 0)) return false
    return new Set(value.choice_ids.map(Number)).size === value.choice_ids.length
  }
  if (value.kind === 'free-action') return typeof value.text === 'string' && value.text.trim().length > 0 && value.text.length <= 2000
  return false
}

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

function requestFingerprint(request: GMProviderTurnRequest): string {
  return JSON.stringify({
    checkpoint_id: request.checkpoint.checkpoint_id,
    turn: request.checkpoint.committed_turn.number,
    scene_id: request.checkpoint.current_scene.id,
    input: request.input,
  })
}

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504
}

export class HttpGMProvider implements GMProvider {
  private readonly inFlight = new Map<string, Promise<GMProviderResult>>()

  constructor(
    private readonly fetcher: FetchLike = browserSafeFetch,
    private readonly endpoint = DEFAULT_GM_ENDPOINT,
  ) {}

  private post(endpoint: string, request: GMProviderTurnRequest, attempt: number): Promise<Response> {
    return this.fetcher(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gm-retry-attempt': String(attempt),
      },
      body: JSON.stringify(request),
    })
  }

  private endpointForAttempt(attempt: number): string {
    if (attempt > 0 && this.endpoint === DEFAULT_GM_ENDPOINT) return DIRECT_NETLIFY_GM_ENDPOINT
    return this.endpoint
  }

  private async performTurn(request: GMProviderTurnRequest): Promise<GMProviderResult> {
    const requestCheck = validateGMTransportRequest(request)
    if (!requestCheck.valid) return previewUnavailable(request, 'request_validation', requestCheck.message)

    let lastCategory = 'network_error'
    let lastDetail: string | undefined

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const endpoint = this.endpointForAttempt(attempt)
      let response: Response
      try {
        response = await this.post(endpoint, requestCheck.value, attempt)
      } catch {
        lastCategory = 'network_error'
        lastDetail = attempt === 0 ? 'first_request_failed' : 'retry_failed'
        continue
      }

      if (isTransientHttpStatus(response.status) && attempt === 0) {
        lastCategory = 'transient_http'
        lastDetail = `HTTP ${response.status}`
        continue
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        lastCategory = 'invalid_json'
        lastDetail = `HTTP ${response.status}`
        if (attempt === 0) continue
        return previewUnavailable(request, lastCategory, lastDetail)
      }

      const parsed = validateGMTransportResponse(payload)
      if (!parsed.valid) {
        lastCategory = 'malformed_response'
        lastDetail = parsed.message
        if (attempt === 0) continue
        return previewUnavailable(request, lastCategory, lastDetail)
      }
      if (!response.ok && parsed.value.status === 'proposal') {
        lastCategory = 'http_rejected'
        lastDetail = `HTTP ${response.status}`
        if (attempt === 0 && isTransientHttpStatus(response.status)) continue
        return previewUnavailable(request, lastCategory, lastDetail)
      }
      return parsed.value
    }

    return previewUnavailable(request, lastCategory, lastDetail)
  }

  proposeTurn(request: GMProviderTurnRequest): Promise<GMProviderResult> {
    const fingerprint = requestFingerprint(request)
    const existing = this.inFlight.get(fingerprint)
    if (existing) return existing

    const pending = this.performTurn(request).finally(() => {
      this.inFlight.delete(fingerprint)
    })
    this.inFlight.set(fingerprint, pending)
    return pending
  }
}
