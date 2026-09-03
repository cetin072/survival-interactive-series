import { validateGMProposal } from '../../src/runtime/gmProposal'
import type { GMProvider } from '../../src/runtime/gmProvider'
import { validateGMTransportRequest } from '../../src/runtime/gmTransport'
import { OpenRouterStoryProvider } from '../../src/server/openRouterStoryProvider'
import { addChoiceReferenceContext } from '../../src/server/playerActionContext'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const PREVIEW_STORY_MODEL = 'deepseek/deepseek-v4-pro-0813:nitro'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type NetlifyRequestContext = { deploy?: { context?: string } }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
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

    return fetch(input, {
      ...init,
      body: JSON.stringify({ ...body, model }),
    })
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
  const fetchImpl = deployContext === 'deploy-preview'
    ? modelOverrideFetch(PREVIEW_STORY_MODEL)
    : fetch

  return new ChoiceReferenceAwareProvider(
    new OpenRouterStoryProvider(environment?.OPENROUTER_API_KEY, fetchImpl),
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
