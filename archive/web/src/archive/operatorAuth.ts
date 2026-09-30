export const OPERATOR_PRODUCTION_ORIGIN = 'https://survival-diary-archive.netlify.app'
export const OPERATOR_PRODUCTION_URL = OPERATOR_PRODUCTION_ORIGIN + '/operator/'

export function operatorOAuthRedirectUrl(origin?: string) {
  const value = origin?.trim()
  if (value && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(value)) {
    return new URL('/operator/', value).toString()
  }
  return OPERATOR_PRODUCTION_URL
}

export function googleOAuthErrorMessage(message?: string | null) {
  if (!message) return 'Google 로그인에 실패했습니다. 잠시 후 다시 시도하거나 기존 운영자 로그인을 사용하세요.'
  if (/provider.*not.*enabled|unsupported provider/i.test(message)) {
    return 'Google 로그인이 아직 Supabase Auth에 활성화되지 않았습니다. 기존 운영자 로그인으로 들어가거나 Google provider 설정을 확인하세요.'
  }
  if (/redirect/i.test(message)) {
    return 'Google 로그인 반환 주소가 허용되지 않았습니다. Supabase Auth Redirect URL 설정을 확인하세요.'
  }
  return 'Google 로그인에 실패했습니다. 잠시 후 다시 시도하거나 기존 운영자 로그인을 사용하세요.'
}

export function oauthRedirectError(location: Pick<Location, 'hash' | 'search'>) {
  const sources = [location.search.replace(/^\?/, ''), location.hash.replace(/^#/, '')].filter(Boolean)
  for (const source of sources) {
    const params = new URLSearchParams(source)
    const error = params.get('error_description') ?? params.get('error')
    if (error) return googleOAuthErrorMessage(error)
  }
  return null
}
