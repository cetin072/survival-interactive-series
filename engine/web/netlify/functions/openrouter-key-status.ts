type NetlifyContext = { deploy?: { context?: string } }

declare const Netlify: {
  env: {
    get(key: string): string | undefined
  }
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

export default async function openrouterKeyStatus(_request: Request, context: NetlifyContext): Promise<Response> {
  if (context.deploy?.context !== 'deploy-preview') return json(404, { status: 'disabled' })

  const apiKey = Netlify.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return json(200, { status: 'missing_key' })

  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
  } catch {
    return json(200, { status: 'network_error' })
  }

  if (response.status === 401) return json(200, { status: 'invalid_key' })
  if (response.status === 403) return json(200, { status: 'forbidden_key_status' })
  if (!response.ok) return json(200, { status: 'upstream_error', http_status: response.status })

  try {
    const payload = await response.json() as { data?: { limit?: number | null; limit_remaining?: number | null } }
    const limit = payload.data?.limit
    const remaining = payload.data?.limit_remaining
    const hasLimit = typeof limit === 'number'
    const exhausted = hasLimit && typeof remaining === 'number' && remaining <= 0
    return json(200, {
      status: 'valid_key',
      has_spending_limit: hasLimit,
      spending_limit_exhausted: exhausted,
    })
  } catch {
    return json(200, { status: 'valid_key_unreadable_metadata' })
  }
}
