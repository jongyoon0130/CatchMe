import { isNativeApp } from './platform'

/** iOS/Android Capacitor — Supabase OAuth 콜백 (Info.plist URL scheme과 동일) */
export const NATIVE_OAUTH_REDIRECT = 'app.futureme.studio://auth/callback'

export function getOAuthRedirectUrl(): string {
  if (typeof window !== 'undefined' && isNativeApp()) return NATIVE_OAUTH_REDIRECT
  if (typeof window !== 'undefined') return window.location.origin
  return NATIVE_OAUTH_REDIRECT
}

/** Supabase OAuth 콜백 URL에서 code 또는 hash 토큰을 파싱한다. */
export function parseOAuthCallbackUrl(rawUrl: string): {
  code: string | null
  accessToken: string | null
  refreshToken: string | null
  error: string | null
} {
  const queryPart = rawUrl.includes('?') ? rawUrl.split('?')[1]?.split('#')[0] ?? '' : ''
  const hashPart = rawUrl.includes('#') ? rawUrl.split('#')[1] ?? '' : ''
  const query = new URLSearchParams(queryPart)
  const hash = new URLSearchParams(hashPart)

  return {
    code: query.get('code'),
    accessToken: hash.get('access_token'),
    refreshToken: hash.get('refresh_token'),
    error: query.get('error_description') ?? query.get('error') ?? hash.get('error_description') ?? hash.get('error'),
  }
}
