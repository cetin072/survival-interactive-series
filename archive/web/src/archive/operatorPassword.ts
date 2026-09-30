export const OPERATOR_PASSWORD_PRODUCTION_URL = 'https://survival-diary-archive.netlify.app/operator/'

export function operatorPasswordRedirectUrl(origin?: string) {
  const value = origin?.trim()
  if (value && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(value)) {
    return new URL('/operator/', value).toString()
  }
  return OPERATOR_PASSWORD_PRODUCTION_URL
}

export function validatePasswordChange(currentPassword: string, nextPassword: string, confirmation: string, recovery = false) {
  if (!recovery && !currentPassword) return '현재 비밀번호를 입력하세요.'
  if (nextPassword.length < 10) return '새 비밀번호는 10자 이상으로 설정하세요.'
  if (nextPassword !== confirmation) return '새 비밀번호 확인이 일치하지 않습니다.'
  if (!recovery && currentPassword === nextPassword) return '새 비밀번호는 현재 비밀번호와 다르게 설정하세요.'
  return null
}

export function passwordUpdateErrorMessage(message?: string | null) {
  if (/current.*password|invalid.*password|credentials/i.test(message ?? '')) return '현재 비밀번호가 맞지 않습니다.'
  if (/password.*same|different/i.test(message ?? '')) return '기존과 다른 비밀번호를 사용하세요.'
  return '비밀번호를 변경하지 못했습니다. 입력 내용을 확인하고 다시 시도하세요.'
}
