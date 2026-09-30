import { describe, expect, it } from 'vitest'
import {
  OPERATOR_PASSWORD_PRODUCTION_URL,
  operatorPasswordRedirectUrl,
  passwordUpdateErrorMessage,
  validatePasswordChange,
} from './operatorPassword'

describe('Operator password self service', () => {
  it('uses exact production recovery URL outside localhost', () => {
    expect(operatorPasswordRedirectUrl('https://deploy-preview-999--survival-diary-archive.netlify.app')).toBe(OPERATOR_PASSWORD_PRODUCTION_URL)
    expect(OPERATOR_PASSWORD_PRODUCTION_URL).toBe('https://survival-diary-archive.netlify.app/operator/')
  })

  it('keeps local password recovery on localhost', () => {
    expect(operatorPasswordRedirectUrl('http://localhost:5173')).toBe('http://localhost:5173/operator/')
  })

  it('validates normal password changes', () => {
    expect(validatePasswordChange('', 'long-password-2', 'long-password-2')).toContain('현재')
    expect(validatePasswordChange('old-password', 'short', 'short')).toContain('10자')
    expect(validatePasswordChange('old-password', 'new-password-2', 'wrong-password')).toContain('일치')
    expect(validatePasswordChange('same-password', 'same-password', 'same-password')).toContain('다르게')
    expect(validatePasswordChange('old-password', 'new-password-2', 'new-password-2')).toBeNull()
  })

  it('allows recovery to set a password without knowing the old one', () => {
    expect(validatePasswordChange('', 'new-password-2', 'new-password-2', true)).toBeNull()
  })

  it('does not expose raw auth errors to the UI', () => {
    expect(passwordUpdateErrorMessage('invalid current password')).toContain('현재 비밀번호')
    expect(passwordUpdateErrorMessage('internal provider detail')).not.toContain('internal provider detail')
  })
})
