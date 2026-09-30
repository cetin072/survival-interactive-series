import { describe, expect, it } from 'vitest'
import {
  OPERATOR_PRODUCTION_URL,
  googleOAuthErrorMessage,
  oauthRedirectError,
  operatorOAuthRedirectUrl,
} from './operatorAuth'

describe('Operator Google OAuth helpers', () => {
  it('uses the exact production Operator URL outside local development', () => {
    expect(operatorOAuthRedirectUrl('https://deploy-preview-999--survival-diary-archive.netlify.app')).toBe(OPERATOR_PRODUCTION_URL)
    expect(OPERATOR_PRODUCTION_URL).toBe('https://survival-diary-archive.netlify.app/operator/')
  })

  it('keeps local development on the current localhost origin', () => {
    expect(operatorOAuthRedirectUrl('http://localhost:5173')).toBe('http://localhost:5173/operator/')
    expect(operatorOAuthRedirectUrl('http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173/operator/')
  })

  it('maps OAuth redirect errors to safe operator-facing guidance', () => {
    expect(googleOAuthErrorMessage('provider is not enabled')).toContain('활성화')
    expect(googleOAuthErrorMessage('redirect URI is not allowed')).toContain('Redirect URL')
    expect(oauthRedirectError({ search: '', hash: '#error=access_denied&error_description=provider%20is%20not%20enabled' } as Location)).toContain('활성화')
  })
})
