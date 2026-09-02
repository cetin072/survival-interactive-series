import { validateGMProposal } from '../../src/runtime/gmProposal'
import type { GMProvider } from '../../src/runtime/gmProvider'
import { validateGMTransportRequest } from '../../src/runtime/gmTransport'
import { createOpenRouterProviderFromEnvironment } from './openRouterProvider'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/**
 * Testable server boundary. Production/default execution uses only the deterministic
 * OpenRouter is selected only inside this server function when its server environment has a key.
 */
export async function handleGMRequest(request: Request, provider: GMProvider = createOpenRouterProviderFromEnvironment()): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, { status: 'unavailable', message: 'POST /api/gm only.' })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return json(400, { status: 'unavailable', message: 'Malformed JSON request.' })
  }

  const parsedRequest = validateGMTransportRequest(payload)
  if (!parsedRequest.valid) return json(400, { status: 'unavailable', message: parsedRequest.message })

  // This Phase 3 endpoint is intentionally limited to the non-canonical test fixture.
  if (parsedRequest.value.checkpoint.source_kind !== 'synthetic-fixture') {
    return json(503, { status: 'unavailable', message: 'Real Canon AI GM backend is not enabled.' })
  }

  let result
  try {
    result = await provider.proposeTurn(parsedRequest.value)
  } catch {
    return json(500, { status: 'unavailable', message: 'AI GM backend failed.' })
  }

  if (result.status === 'unavailable') return json(503, result)

  const proposal = validateGMProposal(result.proposal)
  if (!proposal.valid) {
    return json(502, { status: 'unavailable', message: `AI GM backend returned malformed proposal: ${proposal.message}` })
  }

  return json(200, { status: 'proposal', proposal: proposal.proposal })
}

export default handleGMRequest
