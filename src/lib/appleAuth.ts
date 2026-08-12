import type { SupabaseClient } from '@supabase/supabase-js'
import { generateRawNonce, sha256Hex } from './authNonce'
import { getOAuthRedirectUrl } from './oauthRedirect'
import { isIosNative } from './platform'

/** Capacitor `appId` — Apple Developer App ID와 동일해야 함 */
const IOS_BUNDLE_ID = 'app.futureme.studio'

function supabaseAuthCallbackUrl(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
  if (!url) throw new Error('supabase_not_configured')
  return `${url.replace(/\/$/, '')}/auth/v1/callback`
}

async function signInWithAppleOAuth(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: getOAuthRedirectUrl(),
    },
  })
  if (error) throw error
}

async function saveAppleProfileName(
  client: SupabaseClient,
  givenName: string | null,
  familyName: string | null,
): Promise<void> {
  const parts = [givenName, familyName].filter((v): v is string => Boolean(v?.trim()))
  const fullName = parts.join(' ').trim()
  if (!fullName) return

  const { error } = await client.auth.updateUser({
    data: {
      full_name: fullName,
      name: fullName,
      ...(givenName ? { given_name: givenName } : {}),
      ...(familyName ? { family_name: familyName } : {}),
    },
  })
  if (error) console.warn('[CatchMe/Auth] Apple 이름 저장 실패:', error.message)
}

async function signInWithAppleNative(client: SupabaseClient): Promise<void> {
  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')
  const rawNonce = generateRawNonce()
  const hashedNonce = await sha256Hex(rawNonce)

  const result = await SignInWithApple.authorize({
    clientId: IOS_BUNDLE_ID,
    redirectURI: supabaseAuthCallbackUrl(),
    scopes: 'email name',
    nonce: hashedNonce,
  })

  const { identityToken, givenName, familyName } = result.response
  if (!identityToken) throw new Error('apple_no_identity_token')

  const { error } = await client.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
    nonce: rawNonce,
  })
  if (error) throw error

  await saveAppleProfileName(client, givenName, familyName)
}

export async function signInWithApple(client: SupabaseClient): Promise<void> {
  if (isIosNative()) {
    await signInWithAppleNative(client)
    return
  }
  await signInWithAppleOAuth(client)
}

export function isAppleSignInCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /cancel/i.test(message) || /1001/.test(message)
}
