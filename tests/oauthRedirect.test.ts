import { describe, expect, test } from 'bun:test'
import { parseOAuthCallbackUrl } from '../src/lib/oauthRedirect'

describe('parseOAuthCallbackUrl', () => {
  test('reads PKCE code from query', () => {
    const r = parseOAuthCallbackUrl('app.futureme.studio://auth/callback?code=abc123')
    expect(r.code).toBe('abc123')
    expect(r.accessToken).toBeNull()
  })

  test('reads tokens from hash', () => {
    const r = parseOAuthCallbackUrl(
      'app.futureme.studio://auth/callback#access_token=at&refresh_token=rt',
    )
    expect(r.accessToken).toBe('at')
    expect(r.refreshToken).toBe('rt')
  })
})
