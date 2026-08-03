const NONCE_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._'

export function generateRawNonce(length = 32): string {
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, (v) => NONCE_CHARSET[v % NONCE_CHARSET.length]).join('')
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}
