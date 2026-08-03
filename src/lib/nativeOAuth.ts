import type { Provider, SupabaseClient } from '@supabase/supabase-js'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { getOAuthRedirectUrl, NATIVE_OAUTH_REDIRECT, parseOAuthCallbackUrl } from './oauthRedirect'
import { isNativeApp } from './platform'

async function finishOAuthFromUrl(client: SupabaseClient, url: string): Promise<void> {
  const { code, accessToken, refreshToken, error } = parseOAuthCallbackUrl(url)
  if (error) throw new Error(error)

  if (code) {
    const { error: exchangeError } = await client.auth.exchangeCodeForSession(code)
    if (exchangeError) throw exchangeError
    return
  }

  if (accessToken && refreshToken) {
    const { error: sessionError } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (sessionError) throw sessionError
    return
  }

  throw new Error('oauth_callback_missing_tokens')
}

/** Capacitor iOS/Android — OAuth를 인앱 브라우저 + 딥링크로 처리 (Safari→beta 방지) */
export async function signInWithOAuthNative(
  client: SupabaseClient,
  provider: Provider,
): Promise<void> {
  const redirectTo = getOAuthRedirectUrl()

  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  })
  if (error) throw error
  if (!data.url) throw new Error('oauth_missing_url')

  await Browser.open({ url: data.url, presentationStyle: 'popover' })
}

export function attachNativeOAuthListener(client: SupabaseClient): () => void {
  if (!isNativeApp()) return () => {}

  let pending = false
  let removed = false
  let handle: { remove: () => void } | null = null

  void App.addListener('appUrlOpen', ({ url }) => {
    if (removed || !url.startsWith(NATIVE_OAUTH_REDIRECT)) return
    if (pending) return
    pending = true
    void (async () => {
      try {
        await Browser.close()
        await finishOAuthFromUrl(client, url)
      } catch (e) {
        console.error('[FutureMe/Auth] OAuth callback failed:', e)
      } finally {
        pending = false
      }
    })()
  }).then((h) => {
    if (removed) h.remove()
    else handle = h
  })

  return () => {
    removed = true
    handle?.remove()
  }
}

export { isNativeApp }
