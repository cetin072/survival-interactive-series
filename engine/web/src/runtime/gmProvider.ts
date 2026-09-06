import type { PublicRuntimeCheckpoint } from './publicRuntimeCheckpoint'

export type GMPlayerInput =
  | { kind: 'numbered-choice'; choice_id: number }
  | { kind: 'free-action'; text: string }

export type GMProviderTurnRequest = {
  input: GMPlayerInput
  checkpoint: PublicRuntimeCheckpoint
}

/** Provider output is deliberately untrusted until the GM runtime validates its proposal shape. */
export type GMProviderResult =
  | { status: 'proposal'; proposal: unknown; meta?: GMProviderMeta }
  | { status: 'unavailable'; message: string; meta?: GMProviderMeta }

/** Safe request diagnostics only: never include credentials or raw player/provider content. */
export type GMProviderMeta = {
  provider?: string
  model?: string
  latency_ms?: number
  retry_count?: number
  failure_kind?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number }
}

export interface GMProvider {
  proposeTurn(request: GMProviderTurnRequest): Promise<GMProviderResult>
}

export class MockProvider implements GMProvider {
  constructor(private readonly handler: (request: GMProviderTurnRequest) => GMProviderResult | Promise<GMProviderResult>) {}

  proposeTurn(request: GMProviderTurnRequest): Promise<GMProviderResult> {
    return Promise.resolve(this.handler(request))
  }
}

export class NullProvider implements GMProvider {
  constructor(private readonly message = 'AI GM provider is unavailable. No state was changed.') {}

  proposeTurn(): Promise<GMProviderResult> {
    return Promise.resolve({ status: 'unavailable', message: this.message })
  }
}
