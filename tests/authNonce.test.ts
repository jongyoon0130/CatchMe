import { describe, expect, test } from 'bun:test'
import { generateRawNonce, sha256Hex } from '../src/lib/authNonce'

describe('authNonce', () => {
  test('generateRawNonce returns requested length', () => {
    expect(generateRawNonce(24).length).toBe(24)
  })

  test('sha256Hex is stable for same input', async () => {
    const a = await sha256Hex('futureme-nonce-test')
    const b = await sha256Hex('futureme-nonce-test')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
