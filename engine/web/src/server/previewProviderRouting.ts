export type StoryProviderTier = 'default' | 'preview-primary' | 'preview-fallback'

/**
 * Pure routing decision for the web GM provider tier.
 *
 * attempt 0 is always the quality baseline on Deploy Preview.
 * attempt 1+ is only reached after the client transport failed to receive a usable
 * primary response for the exact same checkpoint + player input.
 */
export function selectStoryProviderTier(deployContext: string | undefined, retryAttempt: number): StoryProviderTier {
  if (deployContext !== 'deploy-preview') return 'default'
  if (Number.isFinite(retryAttempt) && retryAttempt > 0) return 'preview-fallback'
  return 'preview-primary'
}
