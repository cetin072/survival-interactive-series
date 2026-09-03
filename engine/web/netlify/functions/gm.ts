import { validateGMProposal } from '../../src/runtime/gmProposal'
import type { GMProvider, GMProviderResult } from '../../src/runtime/gmProvider'
import { validateGMTransportRequest } from '../../src/runtime/gmTransport'
import { OpenRouterStoryProvider } from '../../src/server/openRouterStoryProvider'
import { OpenRouterFastFallbackProvider } from '../../src/server/openRouterFastFallbackProvider'
import { addChoiceReferenceContext } from '../../src/server/playerActionContext'
import { stabilizeStoryProposal } from '../../src/server/storyProposalGuard'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const PREVIEW_PRIMARY_MODEL = 'deepseek/deepseek-v4-pro-0813:nitro'
const PREVIEW_PRIMARY_TIMEOUT_MS = 26_000
const PREVIEW_FALLBACK_TIMEOUT_MS = 22_000
const PREVIEW_PRIMARY_PREFERENCE_MS = 20_000
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

function rejectedProviderResult(message: string): GMProviderResult {
  return {
    status: 'unavailable',
    message,
    diagnostic: { key_present: true, failure_category: 'network' },
  }
}

function withFallbackDiagnostic(result: GMProviderResult, primaryFailure: string): GMProviderResult {
  if (result.status === 'unavailable') return result
  return {
    ...result,
    diagnostic: {
      ...result.diagnostic,
      key_present: result.diagnostic?.key_present ?? true,
      response_fingerprint: {
        ...(result.diagnostic?.response_fingerprint ?? {}),
        fallback_used: true,
        primary_failure: primaryFailure,
      },
    },
  }
}

class PreviewResilientProvider implements GMProvider {
  constructor(
    private readonly primary: GMProvider,
    private readonly fallback: GMProvider,
  ) {}

  async proposeTurn(request: Parameters<GMProvider['proposeTurn']>[0]): Promise<GMProviderResult> {
    // Start both providers together. The live Deploy Preview shows an HTTP 504
    // edge at roughly 30 seconds, so sequential fallback is not reliable.
    const primaryPromise = this.primary.proposeTurn(request)
      .catch(() => rejectedProviderResult('Preview primary model failed.'))
    const fallbackPromise = this.fallback.proposeTurn(request)
      .catch(() => rejectedProviderResult('Preview fallback model failed.'))

    const preferred = await Promise.race([
      primaryPromise.then((result) => ({ kind: 'primary' as const, result })),
      sleep(PREVIEW_PRIMARY_PREFERENCE_MS).then(() => ({ kind: 'preference-timeout' as const })),
    ])

    if (preferred.kind === 'primary') {
      if (preferred.result.status === 'proposal') return preferred.result
      if (preferred.result.diagnostic?.failure_category === 'auth_or_config') return preferred.result

      const fallbackResult = await fallbackPromise
      if (fallbackResult.status === 'proposal') {
        return withFallbackDiagnostic(fallbackResult, preferred.result.diagnostic?.failure_category ?? 'primary_unavailable')
      }
      return {
        ...fallbackResult,
        message: `${preferred.result.message} / 안전 폴백도 완료하지 못했습니다: ${fallbackResult.message}`,
        diagnostic: {
          key_present: preferred.result.diagnostic?.key_present ?? fallbackResult.diagnostic?.key_present ?? true,
          failure_category: fallbackResult.diagnostic?.failure_category ?? preferred.result.diagnostic?.failure_category ?? 'preview_fallback_failed',
          response_fingerprint: {
            fallback_used: true,
            primary_failure: preferred.result.diagnostic?.failure_category ?? 'primary_unavailable',
            fallback_failure: fallbackResult.diagnostic?.failure_category ?? 'unknown',
          },
        },
      }
    }

    // Pro is still running after the preference window. The fast Flash fallback
    // has already been running in parallel and never blocks on narrative quality
    // heuristics, so it can keep the game alive inside the gateway budget.
    const fallbackResult = await fallbackPromise
    if (fallbackResult.status === 'proposal') return withFallbackDiagnostic(fallbackResult, 'primary_slow')

    const primaryResult = await primaryPromise
    if (primaryResult.status === 'proposal') return primaryResult

    return {
      ...fallbackResult,
      message: `${primaryResult.message} / 안전 폴백도 완료하지 못했습니다: ${fallbackResult.message}`,
      diagnostic: {
        key_present: primaryResult.diagnostic?.key_present ?? fallbackResult.diagnostic?.key_present ?? true,
        failure_category: fallbackResult.diagnostic?.failure_category ?? primaryResult.diagnostic?.failure_category ?? 'preview_fallback_failed',
        response_fingerprint: {
          fallback_used: true,
          primary_failure: primaryResult.diagnostic?.failure_category ?? 'primary_slow',
          fallback_failure: fallbackResult.diagnostic?.failure_category ?? 'unknown',
        },
      },
    }
  }
}

function createPrimaryStoryProvider(): GMProvider {
  const environment = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return new OpenRouterStoryProvider(
    environment?.OPENROUTER_API_KEY,
    modelOverrideFetch(PREVIEW_PRIMARY_MODEL),
    PREVIEW_PRIMARY_TIMEOUT_MS,
  )
}

function createFastFallbackProvider(): GMProvider {
  const environment = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return new OpenRouterFastFallbackProvider(
    environment?.OPENROUTER_API_KEY,
    fetch,
    PREVIEW_FALLBACK_TIMEOUT_MS,
  )
}

function createOpenRouterStoryProviderFromEnvironment(deployContext?: string): GMProvider {
  const environment = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const isPreview = deployContext === 'deploy-preview'

  if (!isPreview) {
    return new ChoiceReferenceAwareProvider(new OpenRouterStoryProvider(environment?.OPENROUTER_API_KEY))
  }

  return new ChoiceReferenceAwareProvider(new PreviewResilientProvider(
    createPrimaryStoryProvider(),
    createFastFallbackProvider(),
  ))
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
  return handleGMRequest(request, createOpenRouterStoryProviderFromEnvironment(context.deploy?.context), context.deploy?.context)
}
