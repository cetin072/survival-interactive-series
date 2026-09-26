import { validateGMProposal } from '../../src/runtime/gmProposal'
import type { GMProvider, GMProviderMeta } from '../../src/runtime/gmProvider'
import { validateGMTransportRequest } from '../../src/runtime/gmTransport'
import { createSyntheticMockProvider } from '../../src/runtime/syntheticPublicRuntimeFixture'
import { OpenRouterDeepSeekProvider } from './openRouterProvider'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

function serverEnvironment(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function safeMeta(meta: GMProviderMeta | undefined): GMProviderMeta | undefined {
  if (!meta) return undefined
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
  const usage = meta.usage && {
    prompt_tokens: finite(meta.usage.prompt_tokens), completion_tokens: finite(meta.usage.completion_tokens),
    total_tokens: finite(meta.usage.total_tokens), cost: finite(meta.usage.cost),
  }
  return {
    provider: typeof meta.provider === 'string' ? meta.provider : undefined,
    model: typeof meta.model === 'string' ? meta.model : undefined,
    latency_ms: finite(meta.latency_ms), retry_count: finite(meta.retry_count),
    failure_kind: typeof meta.failure_kind === 'string' ? meta.failure_kind : undefined,
    usage: usage && Object.values(usage).some((value) => value !== undefined) ? usage : undefined,
  }
}

/**
 * Testable server boundary. OPENROUTER_API_KEY is read here only, never from browser code.
 */
export async function handleGMRequest(request: Request, provider?: GMProvider, env: Record<string, string | undefined> = serverEnvironment()): Promise<Response> {
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

  // Issue #63 is synthetic-only: do not route Canon v2 or its adjacent Hidden boundary
  // to a live provider, even if the server environment has an API key configured.
  if (parsedRequest.value.checkpoint.source_kind !== 'synthetic-fixture') {
    return json(503, { status: 'unavailable', message: 'Canon AI GM activation is not enabled.' })
  }

  const selectedProvider = provider ?? (env.OPENROUTER_API_KEY
    ? new OpenRouterDeepSeekProvider(env.OPENROUTER_API_KEY)
    : createSyntheticMockProvider())
  if (!selectedProvider) return json(503, { status: 'unavailable', message: 'AI GM provider is not configured.' })

  let result
  try {
    result = await selectedProvider.proposeTurn(parsedRequest.value)
  } catch {
    return json(500, { status: 'unavailable', message: 'AI GM backend failed.' })
  }

  if (result.status === 'unavailable') return json(503, { ...result, meta: safeMeta(result.meta) })

  const proposal = validateGMProposal(result.proposal)
  if (!proposal.valid) {
    return json(502, {
      status: 'unavailable',
      message: `AI GM backend returned malformed proposal: ${proposal.message}`,
      meta: { ...safeMeta(result.meta), failure_kind: 'schema_error' },
    })
  }

  return json(200, { status: 'proposal', proposal: proposal.proposal, meta: safeMeta(result.meta) })
}

export default handleGMRequest
