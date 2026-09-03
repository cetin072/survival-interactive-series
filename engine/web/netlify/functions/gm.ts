import { validateGMProposal } from '../../src/runtime/gmProposal'
import type { GMProvider } from '../../src/runtime/gmProvider'
import { validateGMTransportRequest } from '../../src/runtime/gmTransport'
import { OpenRouterStoryProvider } from '../../src/server/openRouterStoryProvider'
import { addChoiceReferenceContext } from '../../src/server/playerActionContext'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const PREVIEW_STORY_MODEL = 'deepseek/deepseek-v4-pro-0813:nitro'
const PREVIEW_TIMEOUT_MS = 45_000
const PREVIEW_TRANSIENT_RETRY_DELAY_MS = 250

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type NetlifyRequestContext = { deploy?: { context?: string } }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientUpstreamStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function modelOverrideFetch(model: string): FetchLike {
  return async (input, init) => {
    if (typeof init?.body !== 'string') return fetch(input, init)

    let body: Record<string, unknown>
    try {
      body = JSON.parse(init.body) as Record<string, unknown>
    } catch {
      return fetch(input, init)
    }

    const requestInit: RequestInit = {
      ...init,
      body: JSON.stringify({ ...body, model }),
    }
    const requestOnce = () => fetch(input, requestInit)

    let response: Response
    try {
      response = await requestOnce()
    } catch (error) {
      if (init.signal?.aborted) throw error
      await sleep(PREVIEW_TRANSIENT_RETRY_DELAY_MS)
      return requestOnce()
    }

    if (isTransientUpstreamStatus(response.status) && !init.signal?.aborted) {
      await sleep(PREVIEW_TRANSIENT_RETRY_DELAY_MS)
      return requestOnce()
    }

    return response
  }
}

class ChoiceReferenceAwareProvider implements GMProvider {
  constructor(private readonly delegate: GMProvider) {}

  proposeTurn(request: Parameters<GMProvider['proposeTurn']>[0]) {
    return this.delegate.proposeTurn(addChoiceReferenceContext(request))
  }
}

function createOpenRouterStoryProviderFromEnvironment(deployContext?: string): GMProvider {
  const environment = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const isPreview = deployContext === 'deploy-preview'
  const fetchImpl = isPreview
    ? modelOverrideFetch(PREVIEW_STORY_MODEL)
    : fetch

  return new ChoiceReferenceAwareProvider(
    new OpenRouterStoryProvider(environment?.OPENROUTER_API_KEY, fetchImpl, isPreview ? PREVIEW_TIMEOUT_MS : undefined),
  )
}

function previewDiagnostic(
  sourceKind: string,
  deployContext: string | undefined,
  result: Awaited<ReturnType<GMProvider['proposeTurn']>>,
) {
  if (sourceKind !== 'synthetic-fixture' || deployContext !== 'deploy-preview') return undefined
  return result.diagnostic
}

/** Server boundary: AI proposes a story turn; browser engine remains authoritative. */
export async function handleGMRequest(
  request: Request,
  provider: GMProvider = createOpenRouterStoryProviderFromEnvironment(),
  deployContext?: string,
): Promise<Response> {
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

  // The live MVP endpoint remains intentionally limited to the non-canonical test session.
  if (parsedRequest.value.checkpoint.source_kind !== 'synthetic-fixture') {
    return json(503, { status: 'unavailable', message: 'Real Canon AI GM backend is not enabled.' })
  }

  let result
  try {
    result = await provider.proposeTurn(parsedRequest.value)
  } catch {
    return json(500, { status: 'unavailable', message: 'AI GM backend failed.' })
  }

  const diagnostic = previewDiagnostic(parsedRequest.value.checkpoint.source_kind, deployContext, result)
  if (result.status === 'unavailable') {
    return json(503, diagnostic ? { status: result.status, message: result.message, diagnostic } : { status: result.status, message: result.message })
  }

  const proposal = validateGMProposal(result.proposal)
  if (!proposal.valid) {
    return json(502, { status: 'unavailable', message: `AI GM backend returned malformed proposal: ${proposal.message}` })
  }

  return json(200, diagnostic ? { status: 'proposal', proposal: proposal.proposal, diagnostic } : { status: 'proposal', proposal: proposal.proposal })
}

export default function gm(request: Request, context: NetlifyRequestContext): Promise<Response> {
  return handleGMRequest(request, createOpenRouterStoryProviderFromEnvironment(context.deploy?.context), context.deploy?.context)
}
