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
  | { status: 'proposal'; proposal: unknown; diagnostic?: GMProviderDiagnostic }
  | { status: 'unavailable'; message: string; diagnostic?: GMProviderDiagnostic }

/**
 * Server-generated, non-secret diagnostics. These are intentionally optional so
 * browser/runtime callers do not depend on provider implementation details.
 */
export type GMProviderDiagnostic = {
  key_present: boolean
  failure_category?: string
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
