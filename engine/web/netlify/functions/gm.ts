import { validateGMProposal } from '../../src/runtime/gmProposal'
import type { GMProvider } from '../../src/runtime/gmProvider'
import { validateGMTransportRequest } from '../../src/runtime/gmTransport'
import { OpenRouterStoryProvider } from '../../src/server/openRouterStoryProvider'
import { OpenRouterFastFallbackProvider } from '../../src/server/openRouterFastFallbackProvider'
import { addChoiceReferenceContext } from '../../src/server/playerActionContext'
import { selectStoryProviderTier } from '../../src/server/previewProviderRouting'
import { stabilizeStoryProposal } from '../../src/server/storyProposalGuard'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const PREVIEW_PRIMARY_MODEL = 'deepseek/deepseek-v4-pro-0813:nitro'
const PREVIEW_PRIMARY_TIMEOUT_MS = 25_000
const PREVIEW_FALLBACK_TIMEOUT_MS = 22_000
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

    const existingProvider = typeof body.provider === 'object' && body.provider !== null
      ? body.provider as Record<string, unknown>
      : {}
    const requestInit: RequestInit = {
      ...init,
      body: JSON.stringify({
        ...body,
        model,
        provider: {
          ...existingProvider,
          allow_fallbacks: true,
        },
      }),
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

function createPrimaryStoryProvider(): GMProvider {
  const environment = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return new ChoiceReferenceAwareProvider(new OpenRouterStoryProvider(
    environment?.OPENROUTER_API_KEY,
    modelOverrideFetch(PREVIEW_PRIMARY_MODEL),
    PREVIEW_PRIMARY_TIMEOUT_MS,
  ))
}

function createFastFallbackProvider(): GMProvider {
  const environment = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return new ChoiceReferenceAwareProvider(new OpenRouterFastFallbackProvider(
    environment?.OPENROUTER_API_KEY,
    modelOverrideFetch('deepseek/deepseek-v4-flash-0731:nitro'),
    PREVIEW_FALLBACK_TIMEOUT_MS,
  ))
}

function createOpenRouterStoryProviderFromEnvironment(deployContext?: string, retryAttempt = 0): GMProvider {
  const environment = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const tier = selectStoryProviderTier(deployContext, retryAttempt)

  if (tier === 'preview-primary') return createPrimaryStoryProvider()
  if (tier === 'preview-fallback') return createFastFallbackProvider()
  return new ChoiceReferenceAwareProvider(new OpenRouterStoryProvider(environment?.OPENROUTER_API_KEY))
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
    const category = diagnostic?.failure_category
    const message = category ? `${result.message} [${category}]` : result.message
    return json(503, diagnostic ? { status: result.status, message, diagnostic } : { status: result.status, message })
  }

  const proposal = validateGMProposal(result.proposal)
  if (!proposal.valid) {
    return json(502, { status: 'unavailable', message: `AI GM backend returned malformed proposal: ${proposal.message}` })
  }

  const stabilized = stabilizeStoryProposal(parsedRequest.value.checkpoint, proposal.proposal)
  const stabilizedProposal = validateGMProposal(stabilized)
  if (!stabilizedProposal.valid) {
    return json(502, { status: 'unavailable', message: `AI GM story guard produced malformed proposal: ${stabilizedProposal.message}` })
  }

  return json(200, diagnostic
    ? { status: 'proposal', proposal: stabilizedProposal.proposal, diagnostic }
    : { status: 'proposal', proposal: stabilizedProposal.proposal })
}

export default function gm(request: Request, context: NetlifyRequestContext): Promise<Response> {
  const retryAttempt = Number(request.headers.get('x-gm-retry-attempt') ?? '0')
  return handleGMRequest(
    request,
    createOpenRouterStoryProviderFromEnvironment(context.deploy?.context, Number.isFinite(retryAttempt) ? retryAttempt : 0),
    context.deploy?.context,
  )
}
